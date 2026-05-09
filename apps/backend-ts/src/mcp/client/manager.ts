/**
 * Phase 65 (MCP-CLI-01, MCP-CLI-03) — McpClientManager singleton.
 *
 * Owns the lifecycle of one MCP client connection (Phase 65 is single-server only):
 *   - Reads `MCP_SERVER_URL/BEARER/NAME` from process.env (D-01)
 *   - Boots silently when URL unset (D-02), logs error + stays disconnected on invalid URL (D-03)
 *   - Connects via StreamableHTTP with SSE fallback (Pitfall 4), 5s timeout (D-13)
 *   - listTools() once per connect, registers via tool-adapter (D-05/D-06/D-07/D-15/D-16/D-17)
 *   - Exposes synchronous `getTools()` so ChatSession.create() can spread it (D-11 — snapshot stable mid-turn)
 *   - `getStatus()` mirrors the IPC type `McpClientStatus` from shared/ipc-types.ts (Plan 01)
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { ToolLogger } from '../../memory/store.js';
import { buildLangChainTool, type McpToolDef } from './tool-adapter.js';

export interface McpConfig {
  url: string;
  bearer: string;
  name: string;
}

export type McpStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** D-13: hardcoded 5s for boot connect; failure means zero external tools, no auto-retry. */
export const CONNECT_TIMEOUT_MS = 5_000;

export class McpClientManager {
  private _client: Client | null = null;
  private _config: McpConfig | null = null;
  private _cachedTools: StructuredToolInterface[] = [];
  private _status: McpStatus = 'disconnected';
  private _lastError: string | null = null;
  private _toolCount = 0;

  configFromEnv(): McpConfig | null {
    const url = process.env['MCP_SERVER_URL']?.trim();
    if (!url) return null;
    const bearer = process.env['MCP_SERVER_BEARER']?.trim() ?? '';
    const name = process.env['MCP_SERVER_NAME']?.trim() || 'mcp';
    return { url, bearer, name };
  }

  /**
   * Idempotent: closes existing client (if any), reads env, reconnects, refreshes tool cache.
   * Never throws — all errors are captured into `_lastError` and reflected via getStatus().
   */
  async reload(nativeToolNames: ReadonlySet<string>, logger: ToolLogger): Promise<void> {
    await this._safeClose();
    this._cachedTools = [];
    this._toolCount = 0;
    this._lastError = null;

    const cfg = this.configFromEnv();
    if (!cfg) {
      this._status = 'disconnected';
      this._config = null;
      // D-02: single info log on silent opt-in
      console.log('[mcp-client] disabled: MCP_SERVER_URL not configured');
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(cfg.url);
    } catch (e) {
      this._status = 'error';
      this._lastError = `Invalid MCP_SERVER_URL: ${(e as Error).message}`;
      this._config = cfg;
      console.error(`[mcp-client] ${this._lastError}`);
      return;
    }

    this._config = cfg;
    this._status = 'connecting';

    try {
      const client = await this._connectWithFallback(parsedUrl, cfg.bearer);
      this._client = client;

      const { tools } = await client.listTools();
      const langchainTools: StructuredToolInterface[] = [];
      for (const def of tools as McpToolDef[]) {
        const wrapped = buildLangChainTool(def, cfg.name, client, nativeToolNames, logger);
        if (wrapped !== null) langchainTools.push(wrapped);
      }
      this._cachedTools = langchainTools;
      this._toolCount = langchainTools.length;
      this._status = 'connected';
      // Pitfall 7: never log cfg.bearer — only url + name + count
      console.log(`[mcp-client] connected to ${cfg.name}: ${this._toolCount} tools`);
    } catch (e) {
      this._status = 'error';
      this._lastError = (e as Error).message;
      this._cachedTools = [];
      this._toolCount = 0;
      console.error(`[mcp-client] connect failed: ${this._lastError}`);
    }
  }

  /** Synchronous accessor — safe to call inside ChatSession.create(). */
  getTools(): StructuredToolInterface[] {
    return this._cachedTools;
  }

  getStatus(): {
    status: McpStatus;
    serverName: string | null;
    toolCount: number;
    error: string | null;
  } {
    return {
      status: this._status,
      serverName: this._config?.name ?? null,
      toolCount: this._toolCount,
      error: this._lastError,
    };
  }

  /** Try StreamableHTTP first, fallback to SSE (Pitfall 4). 5s timeout per attempt. */
  private async _connectWithFallback(url: URL, bearer: string): Promise<Client> {
    const requestInit = bearer
      ? { headers: { Authorization: `Bearer ${bearer}` } }
      : undefined;

    const tryConnect = async (
      makeTransport: () => StreamableHTTPClientTransport | SSEClientTransport,
    ): Promise<Client> => {
      const transport = makeTransport();
      const client = new Client({ name: 'jarvis-client', version: '3.0.0' });
      await Promise.race([
        client.connect(transport),
        new Promise<never>((_, rej) =>
          setTimeout(
            () => rej(new Error(`connect timeout after ${CONNECT_TIMEOUT_MS}ms`)),
            CONNECT_TIMEOUT_MS,
          ),
        ),
      ]);
      return client;
    };

    try {
      return await tryConnect(() => new StreamableHTTPClientTransport(url, { requestInit }));
    } catch (httpErr) {
      // Pitfall 7: don't log requestInit (would expose bearer); only log error message
      console.warn(
        `[mcp-client] StreamableHTTP failed (${(httpErr as Error).message}), trying SSE…`,
      );
      return await tryConnect(() => new SSEClientTransport(url, { requestInit }));
    }
  }

  private async _safeClose(): Promise<void> {
    if (this._client) {
      try {
        await this._client.close();
      } catch {
        /* swallow — best-effort */
      }
      this._client = null;
    }
  }
}

/** Singleton — instantiated once at module load, lifecycle managed by index.ts boot. */
export const mcpManager = new McpClientManager();
