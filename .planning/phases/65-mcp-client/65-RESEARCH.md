# Phase 65: MCP Client — Research

**Researched:** 2026-05-08
**Domain:** MCP client over HTTP, runtime tool injection into LangGraph ReAct agent, hot-reload via file watcher
**Confidence:** HIGH (SDK API surface verified from installed `.d.ts`, n8n transport behavior verified from official docs + community issue, all package versions verified via `npm view`)

## Summary

Phase 65 wires JARVIS's backend-ts to one external MCP server over HTTP, dynamically registers that server's tools into the existing LangGraph ReAct agent in `chat-session.ts`, and reloads cleanly when the user edits `.env`. The whole stack is **already on disk** (`@modelcontextprotocol/sdk@1.29.0` from Phase 64) — Phase 65 only consumes the *client* half of the SDK that we never imported before. Two new dependencies are required: `chokidar@5.0.0` (file watcher, already on the v3.0 stack roadmap) and `@n8n/json-schema-to-zod@1.9.0` (runtime JSON Schema → Zod conversion for tool wrapping).

The single biggest discretionary call — **HTTP transport variant** — resolves cleanly: use `StreamableHTTPClientTransport` first, with a try/catch fallback to `SSEClientTransport` on transport-protocol error. n8n's MCP Server Trigger node officially supports both, with Streamable HTTP being the modern (spec 2025-06-18) default and SSE marked deprecated. Other major providers (Pipedream, Zapier MCP) are streamable-HTTP-only by 2026. The fallback path costs ~10 lines and protects users still on older n8n versions or self-hosted servers that haven't migrated.

The integration point in `chat-session.ts:195` is the single most important design decision and is **already pre-shaped** by Phase 55/63 patterns: `allTools` is a plain array built inside `ChatSession.create()`. Phase 65 needs a singleton `McpClientManager` exposed via a synchronous `getCachedTools()` getter that returns the LangChain-formatted tool array — `chat-session.ts` spreads this into `allTools` like Phase 63's `analyze_screen`.

**Primary recommendation:** Build a singleton `McpClientManager` in `apps/backend-ts/src/mcp/client/` with three responsibilities: (1) connect to the configured MCP server using `StreamableHTTPClientTransport` with a 5s `AbortSignal.timeout`, falling back to `SSEClientTransport` on protocol error; (2) cache an array of LangChain `tool()` instances built by wrapping `client.callTool()` in a thunk and converting MCP `inputSchema` (JSON Schema) to Zod via `@n8n/json-schema-to-zod`; (3) expose `reload()` driven by both the chokidar `.env` watcher and the `mcp-client:reload` IPC handler (mirroring the Phase 57 `RELOAD_LLM` shape). `chat-session.ts:195` (and `:247` in `swapLLM`) reads tools via `mcpManager.getTools()` at session-construction time — no rebuild of in-flight ReAct loops (D-11).

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Configuração & Auth (.env)**

- **D-01:** `.env` carrega 3 variáveis para o cliente MCP: `MCP_SERVER_URL` (HTTP/HTTPS endpoint), `MCP_SERVER_BEARER` (token enviado em `Authorization: Bearer <token>`), `MCP_SERVER_NAME` (identifier curto definido pelo usuário, usado em prefixos de tools, logs e mensagens de erro).
- **D-02:** Boot é **silencioso e opt-in**: se `MCP_SERVER_URL` está vazio/não setado, MCP client não instancia, nenhuma tool externa registrada, log info único `[mcp-client] disabled: MCP_SERVER_URL not configured`.
- **D-03:** Validação de formato apenas: se `MCP_SERVER_URL` existe mas é URL malformada, log error mas backend continua subindo.
- **D-04:** Padrão dotenv existente: `.env` (commitado) + `.env.local` (gitignored). Phase 65 documenta as 3 variáveis em `.env.example`.

**Namespace, Discovery & Tool Exposure**

- **D-05:** Tools externas prefixadas com `MCP_SERVER_NAME`. Ex: `MCP_SERVER_NAME=n8n` + tool remota `send_email` → JARVIS expõe `n8n.send_email` ao LLM.
- **D-06:** Em colisão pós-prefixo, **tool nativa sempre vence**. Tool externa descartada com warning `[mcp-client] tool {prefixed_name} conflicts with native tool — skipped`.
- **D-07:** `description` é anotada com origem: `[via {MCP_SERVER_NAME}] {description original}`. `inputSchema` permanece idêntico ao do servidor.
- **D-08:** **Sem allowlist, sem filtro**: registra TODAS as tools retornadas por `listTools()`.

**Reload, Re-discovery & Lifecycle**

- **D-09:** **chokidar** observa `.env` e `.env.local`. Mudança em qualquer um dispara reload se houve mudança em `MCP_SERVER_*`.
- **D-10:** Settings UI sub-bloco "MCP Client" em `McpSection`: status (`Conectado a {SERVER_NAME}: {N} tools` ou `Não conectado`) + botão "Reconectar" → IPC `mcp-client:reload`.
- **D-11:** **Reload não interrompe conversa ativa.** Tools novas/atualizadas entram apenas na próxima `ChatSession.create()`.
- **D-12:** **Re-discovery só ao reconectar.** Sem polling, sem `notifications/tools/list_changed`.
- **D-13:** Boot timeout 5s. Falha → log error + zero tools externas. **Sem auto-retry** com backoff.

**Aprovação, Audit & Error Handling**

- **D-14:** **Trust mode — sem toast de confirmação** para tools MCP externas. Decisão deliberada e divergente de Phase 54/55.
- **D-15:** Audit via `ToolLogger` existente com campos extras: `source: 'mcp-external'` + `serverName: MCP_SERVER_NAME`.
- **D-16:** Erro estruturado `{ content: [{ type: 'text', text: 'MCP server {NAME} indisponível...', isError: true }] }` retorna ao LLM.
- **D-17:** Tool timeout default 30s. Hardcoded.

### Claude's Discretion (resolved by this research, see Standard Stack & Architecture below)

- HTTP transport variant — **resolved:** StreamableHTTP primary + SSE fallback
- McpClientManager structure — **resolved:** singleton, lazy boot connect, in-memory tool cache
- API to pass external tools to ChatSession.create() — **resolved:** synchronous getter `mcpManager.getTools()`, called inside `ChatSession.create()` and `swapLLM()` (mirrors Phase 63 analyze_screen pattern)
- .env change detection — **resolved:** re-parse via `dotenv.parse(fs.readFileSync(...))` + manual diff of the 3 `MCP_SERVER_*` keys
- JSON Schema → Zod — **resolved:** `@n8n/json-schema-to-zod@1.9.0` runtime conversion (LangChain `tool()` accepts both Zod and JSON Schema, but Zod gives runtime validation parity with native tools)
- chokidar setup — **resolved:** `watch(['.env', '.env.local'], { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 } })` + 250ms debounce on top

### Deferred Ideas (OUT OF SCOPE)

- MCP-CLI-04: Múltiplos servidores MCP simultâneos
- MCP-CLI-05: Settings UI para adicionar/remover servidores sem `.env`
- MCP-SRV-04: HTTP Streamable transport para o servidor MCP do JARVIS
- Allowlist de auto-approval per-tool, polling periódico de tools, reconnect com backoff
- Toast de aprovação per-tool externa, allowlist de auto-approve em `.env`
- Reagir a `notifications/tools/list_changed`, rebuild imediato do agent ReAct na sessão ativa
- Override de timeout per-tool via env var, audit trail persistido em DB

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MCP-CLI-01 | Usuário pode configurar URL de servidor MCP estático via `.env` (HTTP transport) | `dotenv` already loaded by `node --env-file`; `Standard Stack` (StreamableHTTPClientTransport) covers HTTP path; `Architecture Patterns § McpClientManager.connect()` defines URL → client wiring |
| MCP-CLI-02 | JARVIS usa as tools do servidor MCP em conversas normais sem configuração adicional | `Architecture Patterns § Tool Registration into ChatSession` — `mcpManager.getTools()` spreads into `allTools` at `chat-session.ts:195`; trust mode (D-14) means no extra UX surfaces |
| MCP-CLI-03 | JARVIS descobre e registra tools disponíveis ao conectar, repassando-as ao agente LLM | `client.listTools()` after `client.connect()` returns `{ tools: [{ name, description, inputSchema }] }`; `Code Examples § listTools → wrapAsLangChainTool` shows the exact conversion pipeline |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | 1.29.0 | Already installed in `apps/backend-ts/package.json:21` for Phase 64 server. Phase 65 imports `Client`, `StreamableHTTPClientTransport`, `SSEClientTransport` from same package. | Official MCP SDK. v1.10.0 (April 2025) was first to ship Streamable HTTP per spec 2025-06-18. v1.29.0 published 2026-03-30 — current. [VERIFIED: `npm view @modelcontextprotocol/sdk version` → `1.29.0`, `time.modified` → `2026-03-30`] |
| `chokidar` | 5.0.0 | File watcher for `.env` + `.env.local`. ESM-only, requires Node 20+ (project runs Node 24.12.0 — verified). | Industry-standard cross-platform file watcher. v5 (Nov 2025) added ESM-only, modernized internals. `awaitWriteFinish` handles atomic-save artifacts (editors writing to a temp file then renaming) which trip up naive watchers. [VERIFIED: `npm view chokidar version` → `5.0.0`, `time.modified` → `2025-11-25`] |
| `@n8n/json-schema-to-zod` | 1.9.0 | Runtime JSON Schema → Zod conversion. MCP `listTools()` returns JSON Schema for `inputSchema`; we need Zod to keep parity with how native tools are wired. | Maintained fork of `StefanTerdell/json-schema-to-zod` by the n8n team specifically for runtime conversion (the upstream version is codegen-only — explicit warning in its README). Zero deps, 72 KB unpacked. n8n itself uses this in production for its own MCP Client Tool node. [VERIFIED: `npm view @n8n/json-schema-to-zod version` → `1.9.0`, `time.modified` → `2026-05-05` (3 days old at time of research)] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dotenv` | (transitively used by `node --env-file`) | Re-parse `.env` after watcher fires to detect `MCP_SERVER_*` changes specifically. | Only inside the env-watcher diff function. Use `import { parse } from 'dotenv'` then `dotenv.parse(fs.readFileSync('.env', 'utf8'))` to get a record without mutating `process.env`. [CITED: dotenv docs — `parse()` is pure, doesn't write to process.env] |
| `@langchain/core` | 1.1.45 (already installed) | `tool()` factory + `StructuredToolInterface` type. External MCP tools wrap `client.callTool()` and become `StructuredToolInterface[]` indistinguishable from native tools. | At tool-creation time inside `McpClientManager._buildLangChainTools()`. |
| `zod` | 4.3.6 (already installed) | The schemas produced by `@n8n/json-schema-to-zod` are Zod v4 instances. Project is on Zod 4.x (verified in package.json). | Runtime input validation for external tools — matches Phase 17/18 native tool pattern. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `StreamableHTTPClientTransport` (primary) | `SSEClientTransport` only | Would limit to legacy MCP servers and break against modern Pipedream/Zapier/Smithery deployments. Streamable HTTP is the spec 2025-06-18 default. SSE remains as fallback for older n8n self-hosters. |
| `@n8n/json-schema-to-zod` | Pass JSON Schema directly to LangChain `tool()` | LangChain `tool()` does accept JSON Schema [CITED: docs.langchain.com/oss/javascript/langchain/structured-output — "Supports: Zod Schema, Standard Schema, JSON Schema"], BUT existing native tools all use Zod — keeping Zod everywhere keeps the codebase coherent and gives runtime input validation that surfaces clean errors back to the LLM. |
| `@n8n/json-schema-to-zod` | `zod-from-json-schema@0.5.2` | Smaller surface but newer (Nov 2025), fewer real-world stress-tests, no major framework using it. n8n's variant is battle-tested by n8n's own MCP node. |
| `chokidar` for env watch | `node:fs.watch()` (stdlib) | `fs.watch()` is unstable across platforms (rename vs change events differ on Linux/macOS/Windows; some editors trigger duplicate events; doesn't handle atomic saves). chokidar normalizes all this. Project already plans chokidar for Phase 67 — single dep, two consumers. |
| Singleton McpClientManager | Per-ChatSession lazy connect | Per-session would re-do TCP handshake + `listTools()` on every conversation start (~200-1000ms penalty). Singleton with module-level state mirrors `actionsClient.ts` (Phase 54) and `embeddingQueue` (Phase 61). [VERIFIED in codebase: `apps/backend-ts/src/session/lock.ts` and Phase 54 actionsClient pattern] |
| Synchronous `getTools()` | Async `await getTools()` in ChatSession.create() | ChatSession.create() must finish synchronously after `createReactAgent({ tools })` — agent expects an array, not a Promise. Manager refreshes tools async on reload; `getTools()` reads cache synchronously. |

**Installation:**
```bash
pnpm add chokidar@5.0.0 @n8n/json-schema-to-zod@1.9.0 --filter @jarvis/backend-ts
```

**Version verification (npm registry, 2026-05-08):**
```bash
npm view @modelcontextprotocol/sdk version  # 1.29.0 — published 2026-03-30
npm view chokidar version                    # 5.0.0 — published 2025-11-25
npm view @n8n/json-schema-to-zod version     # 1.9.0 — published 2026-05-05
```
[VERIFIED: all three `npm view` calls executed during this research session]

## Architecture Patterns

### Recommended Module Structure

```
apps/backend-ts/src/mcp/
├── client/                      # NEW — Phase 65
│   ├── manager.ts               # McpClientManager singleton
│   ├── transport.ts             # connectWithFallback() helper (StreamableHTTP → SSE)
│   ├── tool-adapter.ts          # MCP tool def → LangChain tool() conversion
│   ├── env-diff.ts              # parse .env, return changed MCP_SERVER_* keys
│   └── __tests__/
│       ├── manager.test.ts
│       ├── tool-adapter.test.ts
│       └── env-diff.test.ts
├── client-sessions.ts           # EXISTING (Phase 64 — server-side tracking, untouched)
├── server.ts                    # EXISTING
└── tools/                       # EXISTING (server tools)

apps/backend-ts/src/config/
└── env-watcher.ts               # NEW — chokidar instance, debounced, dispatches to McpClientManager.reload()

apps/backend-ts/src/index.ts     # EDIT — instantiate manager + start watcher after MemoryManager init

apps/backend-ts/src/session/chat-session.ts  # EDIT — line 195 (create) and 247 (swapLLM): add `...mcpManager.getTools()` to allTools

apps/desktop/src/main/ipc/mcp-settings.ts    # EDIT — add `mcp-client:reload` and `mcp-client:get-status` handlers
apps/desktop/src/renderer/src/settings/sections/McpSection.tsx  # EDIT — append "MCP Client" sub-block (status + Reconectar button)
apps/desktop/src/shared/ipc-types.ts         # EDIT — add `MCP_CLIENT_RELOAD` and `MCP_CLIENT_GET_STATUS` channels
```

### Pattern 1: Singleton McpClientManager with synchronous getter

**What:** A module-level singleton that owns the lifecycle (connect, listTools, callTool, close, reload) and exposes a synchronous `getTools()` returning the cached LangChain tool array.

**When to use:** This is the *only* pattern that satisfies D-11 (reload doesn't interrupt active conversation) — the running ReAct agent in an active turn keeps its tool snapshot from `create()` time; the next `ChatSession.create()` reads the new cache.

**Example:**
```typescript
// apps/backend-ts/src/mcp/client/manager.ts
// [ASSUMED API shape — verified against installed SDK .d.ts in /root/Analisador-de-Perfil/node_modules/@modelcontextprotocol/sdk@1.26.0; v1.29.0 should be backwards-compatible per semver]
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { buildLangChainTool } from './tool-adapter.js';

interface McpConfig {
  url: string;
  bearer: string;
  name: string;
}

class McpClientManager {
  private _client: Client | null = null;
  private _config: McpConfig | null = null;
  private _cachedTools: StructuredToolInterface[] = [];
  private _status: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
  private _lastError: string | null = null;
  private _toolCount = 0;

  // Read at boot from process.env
  configFromEnv(): McpConfig | null {
    const url = process.env['MCP_SERVER_URL']?.trim();
    if (!url) return null;
    const bearer = process.env['MCP_SERVER_BEARER']?.trim() ?? '';
    const name = process.env['MCP_SERVER_NAME']?.trim() ?? 'mcp';
    return { url, bearer, name };
  }

  /** Idempotent: closes existing client, reconnects with current env config. */
  async reload(nativeToolNames: Set<string>): Promise<void> {
    await this._safeClose();
    this._cachedTools = [];
    this._toolCount = 0;
    const cfg = this.configFromEnv();
    if (!cfg) {
      this._status = 'disconnected';
      console.log('[mcp-client] disabled: MCP_SERVER_URL not configured');
      return;
    }
    let parsedUrl: URL;
    try { parsedUrl = new URL(cfg.url); } catch (e) {
      this._status = 'error';
      this._lastError = `Invalid MCP_SERVER_URL: ${(e as Error).message}`;
      console.error(`[mcp-client] ${this._lastError}`);
      return;
    }
    this._config = cfg;
    this._status = 'connecting';
    try {
      const { client } = await this._connectWithFallback(parsedUrl, cfg.bearer);
      this._client = client;
      const { tools } = await client.listTools();
      this._cachedTools = tools
        .map((t) => buildLangChainTool(t, cfg.name, () => client.callTool({ name: t.name, arguments: {} }), nativeToolNames))
        .filter((t): t is StructuredToolInterface => t !== null);
      this._toolCount = this._cachedTools.length;
      this._status = 'connected';
      console.log(`[mcp-client] connected to ${cfg.name}: ${this._toolCount} tools`);
    } catch (e) {
      this._status = 'error';
      this._lastError = (e as Error).message;
      console.error(`[mcp-client] connect failed: ${this._lastError}`);
    }
  }

  /** Synchronous — returns cached array. Safe to call inside ChatSession.create(). */
  getTools(): StructuredToolInterface[] { return this._cachedTools; }

  getStatus() {
    return { status: this._status, serverName: this._config?.name ?? null, toolCount: this._toolCount, error: this._lastError };
  }

  private async _connectWithFallback(url: URL, bearer: string) {
    const requestInit = bearer ? { headers: { Authorization: `Bearer ${bearer}` } } : undefined;
    try {
      const transport = new StreamableHTTPClientTransport(url, { requestInit });
      const client = new Client({ name: 'jarvis-client', version: '3.0.0' });
      await Promise.race([
        client.connect(transport),
        new Promise((_, rej) => setTimeout(() => rej(new Error('connect timeout 5s')), 5000)),
      ]);
      return { client, transport };
    } catch (httpErr) {
      console.warn(`[mcp-client] StreamableHTTP failed (${(httpErr as Error).message}), trying SSE…`);
      const transport = new SSEClientTransport(url, { requestInit });
      const client = new Client({ name: 'jarvis-client', version: '3.0.0' });
      await Promise.race([
        client.connect(transport),
        new Promise((_, rej) => setTimeout(() => rej(new Error('connect timeout 5s')), 5000)),
      ]);
      return { client, transport };
    }
  }

  private async _safeClose() {
    if (this._client) {
      try { await this._client.close(); } catch { /* swallow */ }
      this._client = null;
    }
  }
}

export const mcpManager = new McpClientManager();
```

[CITED: SDK API surface from `/root/Analisador-de-Perfil/node_modules/@modelcontextprotocol/sdk@1.26.0/dist/esm/client/{index.d.ts,streamableHttp.d.ts}` — exact shapes of `Client.listTools()`, `Client.callTool()`, `StreamableHTTPClientTransport` constructor]

### Pattern 2: Tool adapter — MCP tool def → LangChain `tool()`

**What:** Each MCP tool returned by `listTools()` becomes a `StructuredToolInterface` whose execute function calls `client.callTool({name, arguments})` and returns the text content for the LLM.

**When to use:** Inside `McpClientManager.reload()`, once per discovered tool, after collision check against native tool names.

**Example:**
```typescript
// apps/backend-ts/src/mcp/client/tool-adapter.ts
import { tool, type StructuredToolInterface } from '@langchain/core/tools';
import { jsonSchemaToZod } from '@n8n/json-schema-to-zod';
import type { ToolLogger } from '../../memory/store.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema: { type: 'object'; properties?: Record<string, unknown>; required?: string[] };
}

const TOOL_TIMEOUT_MS = 30_000;

export function buildLangChainTool(
  def: McpToolDef,
  serverName: string,
  client: Client,
  nativeToolNames: Set<string>,
  logger: ToolLogger,
): StructuredToolInterface | null {
  const prefixedName = `${serverName}.${def.name}`;
  if (nativeToolNames.has(prefixedName) || nativeToolNames.has(def.name)) {
    console.warn(`[mcp-client] tool ${prefixedName} conflicts with native tool — skipped`);
    return null;
  }
  const annotatedDescription = `[via ${serverName}] ${def.description ?? def.name}`;
  // Runtime JSON Schema → Zod
  const zodSchema = jsonSchemaToZod(def.inputSchema);

  const wrapped = tool(
    async (input: Record<string, unknown>) => {
      const startedAt = Date.now();
      try {
        const result = await Promise.race([
          client.callTool({ name: def.name, arguments: input }),
          new Promise((_, rej) =>
            setTimeout(() => rej(new Error(`MCP tool timeout after ${TOOL_TIMEOUT_MS}ms`)), TOOL_TIMEOUT_MS),
          ),
        ]) as { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

        // D-15: audit via existing ToolLogger with mcp-external source
        logger.logDispatch(prefixedName, input, { source: 'mcp-external', serverName });

        if (result.isError) {
          // D-16: structured error format already matches what the agent expects
          return result.content.map((c) => c.text).join('\n');
        }
        return result.content.map((c) => c.text).join('\n');
      } catch (err) {
        const msg = (err as Error).message;
        logger.logDispatch(prefixedName, input, { source: 'mcp-external', serverName, error: msg });
        // D-16: structured error in pt-BR for the LLM to narrate
        return `MCP server ${serverName} indisponível — tool ${def.name} não pôde executar agora (${msg})`;
      }
    },
    {
      name: prefixedName,
      description: annotatedDescription,
      schema: zodSchema,
    },
  );
  return wrapped as unknown as StructuredToolInterface;
}
```

[ASSUMED: `ToolLogger.logDispatch()` accepts an extra `metadata` argument — needs verification when reading `apps/backend-ts/src/memory/store.ts` during plan-check. If the existing signature is fixed, Plan 02 must extend it (additive, default `{}`).]

### Pattern 3: chokidar env watcher with debounced reload

**What:** Single chokidar instance watching `.env` and `.env.local` (if present), debounced 250ms, only triggers reload if any of the 3 `MCP_SERVER_*` keys changed.

**When to use:** Started once in `apps/backend-ts/src/index.ts` after `mcpManager.reload()` initial connect, before `app.listen()`.

**Example:**
```typescript
// apps/backend-ts/src/config/env-watcher.ts
import chokidar from 'chokidar';
import { parse as parseDotenv } from 'dotenv';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const WATCHED_KEYS = ['MCP_SERVER_URL', 'MCP_SERVER_BEARER', 'MCP_SERVER_NAME'] as const;

function snapshotMcpVars(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  // Re-read from disk (don't mutate process.env)
  const envPath = resolve(process.cwd(), '../../.env');
  const localPath = resolve(process.cwd(), '../../.env.local');
  const merged: Record<string, string> = {};
  if (existsSync(envPath)) Object.assign(merged, parseDotenv(readFileSync(envPath, 'utf8')));
  if (existsSync(localPath)) Object.assign(merged, parseDotenv(readFileSync(localPath, 'utf8'))); // .env.local overrides
  for (const k of WATCHED_KEYS) out[k] = merged[k];
  return out;
}

export function startEnvWatcher(onMcpChange: () => Promise<void>): () => Promise<void> {
  let lastSnapshot = snapshotMcpVars();
  let debounceTimer: NodeJS.Timeout | null = null;

  const watcher = chokidar.watch(['.env', '.env.local'], {
    cwd: resolve(process.cwd(), '../..'),         // project root
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });

  const handler = (path: string) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const next = snapshotMcpVars();
      const changed = WATCHED_KEYS.some((k) => next[k] !== lastSnapshot[k]);
      if (!changed) return;
      lastSnapshot = next;
      // Update process.env so configFromEnv() sees the new values
      for (const k of WATCHED_KEYS) {
        if (next[k] === undefined) delete process.env[k];
        else process.env[k] = next[k];
      }
      console.log(`[env-watcher] MCP_SERVER_* changed (${path}) — triggering reload`);
      await onMcpChange();
    }, 250);
  };

  watcher.on('change', handler);
  watcher.on('add', handler);     // file recreated after delete
  watcher.on('unlink', handler);  // file deleted

  return async () => { await watcher.close(); };
}
```

[CITED: chokidar v5 docs — `awaitWriteFinish`, `ignoreInitial`, `add`/`change`/`unlink` events https://github.com/paulmillr/chokidar]
[CITED: dotenv `parse()` returns Record<string, string> without mutating process.env — standard library behavior]

### Pattern 4: Tool registration in ChatSession (D-11 compliance)

**What:** Add `...mcpManager.getTools()` to the `allTools` array at lines 195 and 247-260 of `chat-session.ts`. Manager's getter is synchronous and returns `[]` when disconnected — degrades cleanly.

**Example (diff against `chat-session.ts:195`):**
```typescript
// BEFORE (line 195):
const allTools = [recallMemoryTool, ...pcToolsWrapped, createRequestFileActionTool(clientIdRef)];

// AFTER:
const nativeNames = new Set(allTools.map((t) => t.name));  // for collision check
const allTools = [
  recallMemoryTool,
  ...pcToolsWrapped,
  createRequestFileActionTool(clientIdRef),
  ...mcpManager.getTools(),                                  // Phase 65 — D-05/D-06
];
// (note: collision check happens INSIDE manager.reload(), not here — names are already filtered)
```

The same edit must be replicated at lines 247-260 inside `swapLLM()`. Both call sites already feed `createReactAgent({ tools: allTools })`.

[VERIFIED: chat-session.ts lines 195 and 247-251 read in this research session]

### Pattern 5: IPC reload handler mirrors Phase 57 RELOAD_LLM

**What:** New IPC channel `mcp-client:reload` in `mcp-settings.ts` POSTs to `http://localhost:8001/internal/mcp-client/reload`, which calls `mcpManager.reload()`. Status broadcast to all BrowserWindows on completion.

**Example:**
```typescript
// apps/desktop/src/shared/ipc-types.ts (extend existing)
export const IPC_CHANNELS = {
  // ... existing ...
  MCP_CLIENT_RELOAD: 'mcp-client:reload',
  MCP_CLIENT_GET_STATUS: 'mcp-client:get-status',
  MCP_CLIENT_STATUS_CHANGED: 'mcp-client:status-changed',  // backend → renderer push
} as const;

// apps/desktop/src/main/ipc/mcp-settings.ts (extend existing)
ipcMain.handle(IPC_CHANNELS.MCP_CLIENT_RELOAD, async () => {
  const resp = await fetch('http://localhost:8001/internal/mcp-client/reload', { method: 'POST' });
  const status = await resp.json();
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.MCP_CLIENT_STATUS_CHANGED, status);
  });
  return status;
});
```

[CITED: settings.ts:294 `await fetch('http://localhost:8001/internal/reload-llm', ...)` — same pattern, verified in this research session]

### Anti-Patterns to Avoid

- **Async getTools() in ChatSession.create():** would force ChatSession.create() to await the cache — race condition on rapid reload, plus `createReactAgent` expects a sync array.
- **Rebuilding the active ReAct agent on reload:** D-11 explicitly forbids this. Tool changes apply on next `ChatSession.create()`.
- **Reading `process.env` inside the watcher to detect change:** `process.env` doesn't auto-refresh — must re-parse `.env` from disk. The code in Pattern 3 above does this correctly.
- **Polling `listTools()` every N seconds:** D-12 forbids this. Re-discovery only on reconnect.
- **Auto-retry with backoff on connect failure:** D-13 explicitly fail-fast. Trying to be helpful here will surprise the user.
- **`console.log()` inside the MCP client adapter when running in stdio context:** trick from Phase 64 D-04 — though Phase 65 is HTTP client (not stdio server), it's still good hygiene. Use `console.log` only for boot-time info messages, never inside the tool callback (those are async; lazy logging is fine via ToolLogger).
- **Using the upstream `json-schema-to-zod` package instead of `@n8n/json-schema-to-zod`:** the upstream's README explicitly says "The output of this package is not meant to be used at runtime" — it generates JS source code strings, not runtime Zod objects. Only the `@n8n` fork does runtime conversion. [VERIFIED: research above with citation to upstream npm page]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP client transport | Custom JSON-RPC over fetch | `@modelcontextprotocol/sdk` Client + StreamableHTTPClientTransport | SDK handles MCP initialize handshake, capability negotiation, session ID generation, SSE event ID resumption, JSON-RPC framing. Building this would take ~2 weeks of edge-case work. |
| File watching | `fs.watch()` | chokidar | Cross-platform inconsistencies, atomic save handling (editors often write to a temp file then rename), debouncing of multi-event saves, recreate-after-delete detection. |
| JSON Schema → Zod conversion | Recursive switch on `type` | `@n8n/json-schema-to-zod` | Real schemas have `oneOf`, `allOf`, `anyOf`, `$ref`, nested `properties`, `additionalProperties`, format constraints. The n8n fork handles all of this and is battle-tested in their MCP node. |
| Bearer auth header injection | Custom fetch wrapper | StreamableHTTPClientTransport's `requestInit.headers` | The transport auto-applies headers to all fetch calls including SSE GET — passing through `requestInit` is the documented way. |
| Hot-reload of tool list | Watch + invalidate Map cache + lock | Singleton with sync getter + atomic array swap | Pattern 1 above is 60 lines and avoids locks because writes are atomic (assigning `_cachedTools = newArray`) and reads are just dereferences. |
| Tool timeout enforcement | Global timeout middleware | `Promise.race` with `setTimeout` per call | 30s timeout (D-17) is per-call, not global. Promise.race in the tool wrapper is the canonical Node pattern (already used in Phase 63 `captureScreenFn` with `AbortSignal.timeout(5_000)`). |

**Key insight:** This phase is heavily SDK-driven. The MCP TS SDK + chokidar + the n8n JSON Schema runtime converter cover ~95% of the work. The remaining 5% is wiring (manager singleton, env-diff, IPC handler, UI sub-block) — all of which mirror existing patterns from Phases 54, 57, 63, and 64.

## Runtime State Inventory

This phase is **not** a rename or migration — it is greenfield code. Section omitted by design.

For completeness:
- **Stored data:** None. Tools live in memory; no DB writes specific to MCP client.
- **Live service config:** External (the user's MCP server, e.g., n8n). Not our concern.
- **OS-registered state:** None.
- **Secrets/env vars:** 3 new env vars introduced by this phase, all in `.env` (committed) + `.env.local` (gitignored) — pattern already established by JARVIS.
- **Build artifacts:** None.

## Common Pitfalls

### Pitfall 1: SDK ESM-only path imports
**What goes wrong:** TypeScript compile error `Cannot find module '@modelcontextprotocol/sdk/client'` when importing from the package root.
**Why it happens:** SDK uses `"exports"` map with sub-paths. Top-level `from '@modelcontextprotocol/sdk'` doesn't exist. Phase 64's server.ts already gets this right: `from '@modelcontextprotocol/sdk/server/mcp.js'` (note the `.js`).
**How to avoid:** Always import from the deepest sub-path with `.js` extension. For client: `'@modelcontextprotocol/sdk/client/index.js'` and `'@modelcontextprotocol/sdk/client/streamableHttp.js'`.
**Warning signs:** TypeScript red squiggles on the import; `ERR_MODULE_NOT_FOUND` at runtime.
[VERIFIED: Phase 64's `apps/backend-ts/src/mcp/server.ts:4-5` uses this exact pattern with `.js` extensions]

### Pitfall 2: Stale process.env after .env edit
**What goes wrong:** chokidar fires `change`, manager reads `process.env.MCP_SERVER_URL`, gets old value, no-op.
**Why it happens:** `node --env-file=.env` reads .env once at boot. `process.env` is a static snapshot. Editing `.env` does not auto-refresh the process.
**How to avoid:** In the watcher handler, re-parse the file from disk via `dotenv.parse(fs.readFileSync(...))` and explicitly mutate `process.env` for the 3 MCP keys before calling `manager.reload()`. Pattern 3 above shows this.
**Warning signs:** Reload fires but no observable change; logs say "no change detected" when there obviously is.

### Pitfall 3: Atomic-save editor breaks watcher
**What goes wrong:** User saves `.env` in VS Code → watcher fires `unlink` then `add` (because VS Code writes to a `.tmp` file then renames) → manager sees missing env vars between events and disconnects.
**Why it happens:** Many editors (VS Code, vim with backup) don't write in-place. They write to a temp file then `rename(temp, target)`, which on Linux looks like `unlink + add` not `change`.
**How to avoid:** Use `awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }` in chokidar options + treat `add` and `change` events identically in the handler. The 250ms debounce on top absorbs both events into one logical change.
**Warning signs:** Reload fires twice in quick succession on every save; brief disconnect-reconnect cycle visible in logs.
[CITED: chokidar Issue #594 + README discussion of awaitWriteFinish behavior]

### Pitfall 4: n8n self-hosted exposes only SSE
**What goes wrong:** Connect to n8n self-hosted < v1.130.x → StreamableHTTP fails with 404 or protocol error → user sees "MCP server unavailable" with no recovery path.
**Why it happens:** Older n8n versions only exposed SSE under `/mcp/<path>/sse`. Streamable HTTP support landed in PR #15454. n8n cloud auto-updates; self-hosted does not.
**How to avoid:** The fallback pattern in `_connectWithFallback` (Pattern 1 above) tries StreamableHTTP first and falls back to SSE on any connect error. Both transports are still in v1.29.0 of the SDK.
**Warning signs:** First connect succeeds but then fails after upgrade — usually means StreamableHTTP became default and the SSE-only server fell over.

### Pitfall 5: Tool name collision with prefix
**What goes wrong:** User sets `MCP_SERVER_NAME=memory`, server exposes `recall` tool → prefixed name `memory.recall` conflicts with native `recall_memory`? (No — different names, but a server exposing literally `memory.recall` as a single token would.)
**Why it happens:** D-06 covers this exactly: collision check after prefix.
**How to avoid:** Build the `nativeToolNames` Set (containing `recall_memory`, `list_files`, `openFile`, `openFolder`, `viewContent`, `closeFile`, `moveFile`, `renameFile`, `request_file_action`, `analyze_screen`, `media_control`, `adjust_volume`) BEFORE iterating discovered MCP tools. Skip any whose prefixed name is in the set, log a warning. Also skip if the *unprefixed* name matches (defensive against `MCP_SERVER_NAME=''`).
**Warning signs:** "tool X conflicts with native — skipped" warning at boot or reload. User reports "the n8n send_email tool isn't appearing" — check the warning log.

### Pitfall 6: ChatSession holds stale tool array after reload
**What goes wrong:** User edits `.env`, watcher fires, manager reloads tools — but the active `ChatSession` still has the OLD tools because `createReactAgent` was called with the snapshot.
**Why it happens:** This is **intended** per D-11. New tools apply on next `ChatSession.create()`.
**How to avoid:** Don't try to "fix" this. Document clearly in the system prompt or the Settings UI sub-block that "tools MCP recarregadas — ativas na próxima conversa" (D-11 wording).
**Warning signs:** User clicks Reconectar, then immediately tries to use a new tool, and JARVIS responds "I don't have that tool" — they expect immediate effect. The toast/log message is the mitigation.

### Pitfall 7: Bearer token leak in logs
**What goes wrong:** Manager logs the connection URL on connect, accidentally including the bearer token.
**Why it happens:** Some setups put bearer in URL query string, or a stack trace might dump `requestInit`.
**How to avoid:** Never log `cfg.bearer` or stringify `requestInit`. Only log `cfg.url` and `cfg.name`. ToolLogger entries should not capture the bearer either (audit log lives in memory but D-15 logs `args` — if user passes a bearer through args by mistake, that's their problem, but our code shouldn't make it worse).
**Warning signs:** Grep audit logs for `Bearer ` — should never appear.

## Code Examples

### Connect to n8n with bearer auth (StreamableHTTP first, SSE fallback)

```typescript
// Source: SDK .d.ts inspection + GitHub typescript-sdk/docs/client.md
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

async function connectMcp(url: URL, bearer: string) {
  const requestInit = bearer ? { headers: { Authorization: `Bearer ${bearer}` } } : undefined;
  const client = new Client({ name: 'jarvis-client', version: '3.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit }));
  } catch (httpErr) {
    await client.connect(new SSEClientTransport(url, { requestInit }));
  }
  const { tools } = await client.listTools();
  return { client, tools };
}
```

### Convert MCP inputSchema → Zod → LangChain tool()

```typescript
// Source: @n8n/json-schema-to-zod README + @langchain/core tool() factory
import { jsonSchemaToZod } from '@n8n/json-schema-to-zod';
import { tool } from '@langchain/core/tools';

const mcpToolDef = {
  name: 'send_email',
  description: 'Sends an email via SMTP',
  inputSchema: { type: 'object', properties: { to: { type: 'string' }, body: { type: 'string' } }, required: ['to', 'body'] },
};

const zodSchema = jsonSchemaToZod(mcpToolDef.inputSchema);

const langchainTool = tool(
  async (input: { to: string; body: string }) => {
    const result = await client.callTool({ name: mcpToolDef.name, arguments: input });
    return result.content.map((c: any) => c.text).join('\n');
  },
  { name: `n8n.${mcpToolDef.name}`, description: `[via n8n] ${mcpToolDef.description}`, schema: zodSchema },
);
```

### chokidar with atomic-save protection

```typescript
// Source: chokidar v5 README https://github.com/paulmillr/chokidar
import chokidar from 'chokidar';
const watcher = chokidar.watch(['.env', '.env.local'], {
  cwd: '/abs/path/to/project',
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
});
watcher.on('change', (path) => console.log(`changed: ${path}`));
watcher.on('add', (path) => console.log(`added: ${path}`));
watcher.on('unlink', (path) => console.log(`removed: ${path}`));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| HTTP+SSE transport (separate POST + GET endpoints) | Streamable HTTP (single endpoint, server decides streaming) | MCP spec 2025-06-18 | All new MCP servers (Pipedream, Zapier, Smithery) ship Streamable HTTP only. SSE remains as legacy compat. |
| Manual JSON-RPC over WebSocket | StreamableHTTPClientTransport from official SDK | SDK v1.10.0 (April 2025) | Removes ~500 LOC of plumbing. SDK now handles initialize handshake, session IDs, resumption tokens. |
| chokidar v3.x (CJS, no ESM) | chokidar v5 (ESM-only, Node 20+) | Nov 2025 | Forces ESM imports — already aligned with project's `"type": "module"` in package.json. |

**Deprecated/outdated:**
- **`SSEClientTransport`:** still functional in v1.29.0 but spec marks it deprecated. Use only as fallback.
- **Original `json-schema-to-zod` package (StefanTerdell):** runtime use deprecated by author — output is meant for codegen. Use `@n8n/json-schema-to-zod` for runtime.
- **`AgentExecutor` from legacy LangChain:** already off the table for JARVIS — Phase 17 uses `createReactAgent` from LangGraph 1.x.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ToolLogger.logDispatch()` accepts an extra metadata argument (e.g., `{source, serverName}`) | Pattern 2 | LOW — D-15 mandates extra fields. If signature is fixed, plan-check phase will catch it; Plan 02 must extend `logDispatch` (additive change, default `{}`). |
| A2 | SDK v1.29.0 is API-compatible with v1.26.0 (`.d.ts` files inspected from sibling project at v1.26.0) | Standard Stack, Pattern 1 | LOW — semver minor bumps. Plan 02 should run a smoke test importing `Client.listTools` and `callTool` to confirm. |
| A3 | n8n cloud as of 2026-05 has migrated to StreamableHTTP as default (per PR #15454 merged) | Common Pitfalls #4 | LOW — fallback covers both. If n8n cloud were SSE-only, fallback path executes silently. |
| A4 | The project's `.env` lives at `/root/jarvis/.env` and is loaded via `node --env-file=../../.env` per backend-ts package.json | Pattern 3 | LOW — verified by reading `apps/backend-ts/package.json:7` and `find` for `.env`. No `.env.local` exists currently — watcher handles its absence gracefully. |
| A5 | `dotenv` is already installed transitively (Node `--env-file` uses dotenv internally; LangChain may also pull it) | Standard Stack supporting | LOW — if not present, `pnpm add dotenv@latest --filter @jarvis/backend-ts` is a one-liner. Plan 01 should `pnpm list dotenv` to confirm. |
| A6 | `createReactAgent` rebuilds the tool dispatch internally — passing a fresh tool array on each `ChatSession.create()` is sufficient (no extra cache invalidation needed). | Pattern 4 | LOW — verified in `chat-session.ts:197-201` and `swapLLM():262-266` — both call `createReactAgent` fresh. |

If any assumption above proves wrong during plan-check, the planner should flag and request user confirmation. None of these assumptions block research-to-plan handoff.

## Open Questions

1. **Does `client.callTool()` honor `AbortSignal` for cancellation?**
   - What we know: SDK v1.29.0 `callTool()` accepts a third `RequestOptions` parameter; `RequestOptions` includes `signal?: AbortSignal` per the inspected `.d.ts`.
   - What's unclear: whether the underlying StreamableHTTPClientTransport actually aborts the in-flight HTTP request when the signal fires.
   - Recommendation: Phase 65 uses `Promise.race` with a setTimeout for the 30s timeout (D-17). If the SDK abort works, future refactor to `signal: AbortSignal.timeout(30_000)` is a 2-line cleanup. Not blocking.

2. **What happens when MCP server returns a tool with `outputSchema`?**
   - What we know: MCP spec 2025-06-18 supports optional `outputSchema` for structured tool output validation. SDK auto-validates if present.
   - What's unclear: do n8n / Pipedream emit `outputSchema`? If they do, and validation fails, does `callTool()` throw or return `{isError: true}`?
   - Recommendation: catch all errors in the tool callback (Pattern 2) and convert to D-16 structured error string. This protects against any SDK validation throw.

3. **Should the env watcher debounce window be tunable?**
   - What we know: 250ms picked empirically — tight enough to feel "instant" to the user, loose enough to absorb VS Code's atomic-save double-event.
   - What's unclear: edge case of slow filesystem (network mount, WSL with Windows filesystem) where stabilityThreshold of 200ms might not be enough.
   - Recommendation: hardcode at 250ms for v3.0; revisit if a user reports "had to click Reconectar twice". Not blocking.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | 24.12.0 | — (project requires Node 20+) |
| pnpm | Install | ✓ | 10.27.0 | — |
| `@modelcontextprotocol/sdk` | All MCP code | ✓ | 1.29.0 (already in package.json) | — |
| External MCP server (n8n) | E2E test of MCP-CLI-02 | UNKNOWN — user-side | — | Plan 04 (validation) provides a mock MCP server in tests; manual E2E uses user's own n8n |
| chokidar | env-watcher | ✗ (must add) | install 5.0.0 | none — required for D-09 |
| `@n8n/json-schema-to-zod` | tool-adapter | ✗ (must add) | install 1.9.0 | LangChain `tool()` accepts JSON Schema directly — could skip Zod conversion, but loses runtime input validation. **Use the package; fallback only if install fails on user's network.** |
| `dotenv` (for parse()) | env-watcher | UNKNOWN — likely transitive | check via `pnpm list dotenv` in Plan 01 | Use `node:fs` + manual line-parsing of `KEY=value` (15 lines) — only if dotenv is genuinely missing. |

**Missing dependencies with no fallback:**
- chokidar — must install. ESM-only, Node 20+ — both satisfied.

**Missing dependencies with fallback:**
- `@n8n/json-schema-to-zod` — fallback to passing JSON Schema directly to `tool()`. Use the package by default.
- `dotenv` — fallback to manual `.env` parsing. Use existing if available.

[VERIFIED via Bash: `node --version` → 24.12.0; `pnpm --version` → 10.27.0]
[VERIFIED via package.json read: `@modelcontextprotocol/sdk@1.29.0`, `zod@^4.3.6`, `@langchain/core@^1.1.45`]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.3 (already in `apps/backend-ts/devDependencies`) |
| Config file | `apps/backend-ts/vitest.config.ts` (existing) — Phase 65 inherits |
| Quick run command | `pnpm --filter @jarvis/backend-ts test -- src/mcp/client/__tests__` |
| Full suite command | `pnpm --filter @jarvis/backend-ts test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| MCP-CLI-01 | `.env` with `MCP_SERVER_URL` set → manager connects on boot | unit (mock SDK Client) | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/manager.test.ts -t "configFromEnv"` | ❌ Wave 0 — needs new test file |
| MCP-CLI-01 | `.env` with no `MCP_SERVER_URL` → manager stays disconnected, no error | unit | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/manager.test.ts -t "boot silent opt-in"` | ❌ Wave 0 |
| MCP-CLI-01 | `.env` with malformed `MCP_SERVER_URL` → manager logs error, stays disconnected | unit | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/manager.test.ts -t "invalid URL"` | ❌ Wave 0 |
| MCP-CLI-02 | External tool registered in `allTools` after connect | unit (mock manager) | `pnpm --filter @jarvis/backend-ts test src/session/__tests__/chat-session.test.ts -t "external tools spread"` | ❌ Wave 0 — extend existing chat-session.test.ts |
| MCP-CLI-02 | External tool callable via `langchainTool.invoke({...})` → returns content text | unit | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/tool-adapter.test.ts -t "invoke forwards to client.callTool"` | ❌ Wave 0 |
| MCP-CLI-02 | External tool name prefixed with `MCP_SERVER_NAME` | unit | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/tool-adapter.test.ts -t "prefixed name"` | ❌ Wave 0 |
| MCP-CLI-02 | External tool description annotated `[via {NAME}]` | unit | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/tool-adapter.test.ts -t "annotated description"` | ❌ Wave 0 |
| MCP-CLI-02 (D-06) | Collision with native tool name → external tool skipped, warning logged | unit | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/tool-adapter.test.ts -t "collision skip"` | ❌ Wave 0 |
| MCP-CLI-03 | `client.listTools()` results converted to LangChain tool array | unit (mock listTools) | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/manager.test.ts -t "discovers and registers"` | ❌ Wave 0 |
| MCP-CLI-03 | JSON Schema → Zod conversion preserves `required` fields | unit | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/tool-adapter.test.ts -t "schema preserves required"` | ❌ Wave 0 |
| **SC1** (hot reload) | chokidar `change` on `.env` with `MCP_SERVER_URL` change → manager.reload() called | integration (real chokidar, fake .env file in tmpdir) | `pnpm --filter @jarvis/backend-ts test src/config/__tests__/env-watcher.test.ts -t "MCP_SERVER_URL change triggers reload"` | ❌ Wave 0 |
| **SC1** (hot reload) | chokidar `change` on `.env` with NON-MCP key change → manager.reload() NOT called | integration | `pnpm --filter @jarvis/backend-ts test src/config/__tests__/env-watcher.test.ts -t "non-MCP change ignored"` | ❌ Wave 0 |
| **SC1** (hot reload) | atomic save (unlink + add within 100ms) → debounced to single reload call | integration | `pnpm --filter @jarvis/backend-ts test src/config/__tests__/env-watcher.test.ts -t "atomic save debounce"` | ❌ Wave 0 |
| **SC1** (D-11) | Reload during active turn → in-flight ChatSession's tool array unchanged | unit (snapshot via `agent.tools`) | `pnpm --filter @jarvis/backend-ts test src/session/__tests__/chat-session.test.ts -t "tools snapshot stable across reload"` | ❌ Wave 0 |
| **SC2** (E2E) | User asks JARVIS a question → JARVIS calls `n8n.send_email` → response includes tool result | integration (mock MCP server in test process) | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/e2e-mock-server.test.ts -t "agent uses external tool"` | ❌ Wave 0 — needs mock MCP server fixture |
| **SC3** (graceful degradation) | MCP server unreachable on boot → no tools registered, ChatSession works normally | unit | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/manager.test.ts -t "connect failure leaves manager empty"` | ❌ Wave 0 |
| **SC3** (graceful degradation) | MCP server dies mid-call → tool returns D-16 error string in pt-BR | unit (mock client.callTool throw) | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/tool-adapter.test.ts -t "server down returns pt-BR error"` | ❌ Wave 0 |
| **SC3** (graceful degradation) | tool timeout > 30s → returns timeout error string, doesn't hang agent | unit (fake timer) | `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__/tool-adapter.test.ts -t "30s timeout"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @jarvis/backend-ts test src/mcp/client/__tests__` (the new MCP client test directory)
- **Per wave merge:** `pnpm --filter @jarvis/backend-ts test src/mcp src/session src/config` (broader, catches integration regressions)
- **Phase gate:** `pnpm --filter @jarvis/backend-ts test` (full backend-ts suite green) + manual E2E human verification (separate plan, mirrors Phase 64-04 pattern)

### Wave 0 Gaps
- [ ] `apps/backend-ts/src/mcp/client/__tests__/manager.test.ts` — covers MCP-CLI-01, MCP-CLI-03, SC3
- [ ] `apps/backend-ts/src/mcp/client/__tests__/tool-adapter.test.ts` — covers MCP-CLI-02, MCP-CLI-03, SC3
- [ ] `apps/backend-ts/src/mcp/client/__tests__/env-diff.test.ts` — covers env-diff helper used by watcher
- [ ] `apps/backend-ts/src/mcp/client/__tests__/e2e-mock-server.test.ts` — covers SC2 with in-process mock MCP server
- [ ] `apps/backend-ts/src/config/__tests__/env-watcher.test.ts` — covers SC1
- [ ] Extend `apps/backend-ts/src/session/chat-session.test.ts` (existing) — covers external tools spread + D-11 snapshot stability
- [ ] Mock MCP server fixture (`apps/backend-ts/src/mcp/client/__tests__/fixtures/mock-server.ts`) — in-process MCP server using stdio or in-memory transport, used by e2e-mock-server.test.ts and env-watcher integration tests
- [ ] No new framework install — vitest is already configured

## Project Constraints (from CLAUDE.md)

> CLAUDE.md describes a Python+LangChain stack but the actual codebase is TypeScript+Electron — researcher has verified this in `apps/backend-ts/package.json`. The Python sections of CLAUDE.md are aspirational/historical; the operative constraints below are the universal ones plus what's enforced via Phase 14+ migration.

- **Multi-LLM abstraction:** Toda chamada ao LLM deve passar por camada de abstração — never hardcode of provider. *Phase 65 does not touch the LLM layer; it only adds tools that go through the existing ReAct agent.*
- **Multiplataforma:** Code OS-specific isolated. *MCP client over HTTP is OS-agnostic — chokidar handles cross-platform file events. ✓*
- **Privacidade:** Conversa nunca vai para cloud sem configuração explícita. *Phase 65 only forwards tool calls to a server explicitly configured by the user in `.env`. Trust mode (D-14) is documented as an explicit user choice. ✓*
- **Sem UI obrigatória:** JARVIS deve funcionar 100% em terminal. *D-10 makes the Settings UI a convenience, not a requirement — the system works headless via `.env` only. ✓*
- **GSD Workflow:** Before Edit/Write tools, use a GSD command. *Researcher follows GSD; planner/executor will too. ✓*
- **Conventional Commits + emoji + pt-BR:** All commits in pt-BR with emoji per CLAUDE.md table. *Planner must specify pt-BR commit messages with emoji prefix in PLAN files. ✓*
- **NEVER include "Co-Authored-By: Claude" or "🤖 Generated with [Claude Code]" in commits.** *Critical rule — overrides default GSD behavior. Planner and executor must respect.*

## Recommended Task Breakdown Hint for the Planner

Based on the above, the natural plan decomposition is **4 plans** (mirroring the Phase 64 cadence):

- **Plan 65-01 — Install deps + type contracts**
  Add `chokidar@5.0.0` and `@n8n/json-schema-to-zod@1.9.0` to backend-ts. Extend `apps/desktop/src/shared/ipc-types.ts` with `MCP_CLIENT_RELOAD`, `MCP_CLIENT_GET_STATUS`, `MCP_CLIENT_STATUS_CHANGED` channels and the `McpClientStatus` payload type. Update `.env.example` with the 3 new variables and a comment block explaining trust mode. Verify `dotenv` is available (transitively or add explicitly).

- **Plan 65-02 — McpClientManager + tool adapter (core, no UI, no watcher)**
  Build `apps/backend-ts/src/mcp/client/{manager.ts, tool-adapter.ts, env-diff.ts}` plus their `__tests__/`. This is the meat of the phase: connect with fallback, listTools, JSON Schema → Zod, LangChain tool wrap, ToolLogger integration with `source: 'mcp-external'`, 30s timeout, structured error in pt-BR. Hook `mcpManager.reload()` into `apps/backend-ts/src/index.ts` after MemoryManager init. Edit `chat-session.ts:195` and `swapLLM():247` to spread `mcpManager.getTools()`. Tests cover MCP-CLI-01, MCP-CLI-02, MCP-CLI-03, SC3.

- **Plan 65-03 — env-watcher + IPC reload + Settings UI sub-block**
  Build `apps/backend-ts/src/config/env-watcher.ts` with chokidar + debounce + diff. Wire startup in `index.ts`. Backend route `POST /internal/mcp-client/reload` calling `mcpManager.reload()`. IPC handlers `MCP_CLIENT_RELOAD` and `MCP_CLIENT_GET_STATUS` in `apps/desktop/src/main/ipc/mcp-settings.ts` (extending the existing file from Phase 64). Status broadcast to all BrowserWindows on change. Extend `McpSection.tsx` with the "MCP Client" sub-block (status label + Reconectar button + IPC subscription). Tests cover SC1 (hot reload) and the IPC handler.

- **Plan 65-04 — Human verification checkpoint (mirrors Phase 64-04 pattern)**
  Standalone document describing manual E2E: configure `.env` with a real n8n URL + bearer; verify JARVIS connects on boot; ask JARVIS to invoke a tool from n8n; edit `.env` to change `MCP_SERVER_NAME`; verify hot reload + new prefix in logs; kill n8n; verify graceful degradation with pt-BR error narration; verify Settings UI status updates.

The 4-plan split keeps each plan ≤ 8 tasks (Phase 64's cadence) and keeps Wave 0 test fixtures bundled with their owning plan.

## Sources

### Primary (HIGH confidence)
- `/root/Analisador-de-Perfil/node_modules/@modelcontextprotocol/sdk/dist/esm/client/{index.d.ts, streamableHttp.d.ts}` (v1.26.0) — actual SDK API surface inspected directly
- `apps/backend-ts/package.json` — verified `@modelcontextprotocol/sdk@1.29.0`, `zod@4.3.6`, `@langchain/core@1.1.45`
- `apps/backend-ts/src/session/chat-session.ts:130-269` — read in this session, identifies exact integration points (lines 195, 247)
- `apps/backend-ts/src/mcp/server.ts` (Phase 64) — exact import-path patterns confirmed
- `apps/desktop/src/main/ipc/settings.ts:285-365` (Phase 57 RELOAD_LLM) — IPC reload pattern blueprint
- `apps/backend-ts/src/mcp/__tests__/server.test.ts` — vitest pattern with SDK mock
- npm registry — `npm view` for chokidar (5.0.0), @n8n/json-schema-to-zod (1.9.0), @modelcontextprotocol/sdk (1.29.0) all executed live in this session
- [MCP TypeScript SDK Client Docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/client.md) — bearer auth + Streamable HTTP example
- [n8n MCP Server Trigger docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcptrigger/) — confirmed both SSE + Streamable HTTP exposed, bearer auth
- [chokidar v5 README](https://github.com/paulmillr/chokidar) — awaitWriteFinish, ignoreInitial, atomic save handling

### Secondary (MEDIUM confidence)
- [LangChain JS Structured Output docs](https://docs.langchain.com/oss/javascript/langchain/structured-output) — confirmed `tool()` schema accepts Zod / Standard Schema / JSON Schema
- [Why MCP Deprecated SSE and Went with Streamable HTTP](https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/) — context for SSE deprecation timing
- [n8n GitHub Issue #18938](https://github.com/n8n-io/n8n/issues/18938) — confirms n8n's transport behavior; informed the fallback decision
- [@n8n/json-schema-to-zod README](https://github.com/n8n-io/n8n/tree/master/packages/%40n8n/json-schema-to-zod) — runtime conversion confirmed (vs upstream codegen-only)

### Tertiary (LOW confidence — flagged for plan-check verification)
- A1: `ToolLogger.logDispatch()` extra-args signature — verify in Plan 02 by reading `apps/backend-ts/src/memory/store.ts`
- A2: SDK 1.26 → 1.29 API compatibility — verify in Plan 02 with a dry-run import smoke test

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all 3 packages verified in npm registry within this session, plus SDK API surface read from disk
- Architecture: HIGH — all integration points verified by reading actual code (chat-session.ts, settings.ts, mcp-settings.ts, McpSection.tsx, index.ts)
- Pitfalls: HIGH — Pitfall 1 (ESM imports) verified directly in Phase 64 code; Pitfall 3 (atomic save) verified against chokidar issues; Pitfall 4 (n8n SSE-only) verified against n8n PR #15454
- Validation Architecture: HIGH — vitest already configured, mocking pattern shown in existing `mcp/__tests__/server.test.ts`

**Research date:** 2026-05-08
**Valid until:** 2026-06-08 (30 days — stable phase, but `@n8n/json-schema-to-zod` shipped 3 days ago and may iterate; reverify if planning slips past June)

## RESEARCH COMPLETE
