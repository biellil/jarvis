import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mocks — vi.mock factory runs before module imports.
// vi.fn() não funciona como constructor em vi.hoisted() context; usar classes reais
// e spies no .prototype para inspeção (Phase 54 pattern).
const {
  connectMock,
  listToolsMock,
  callToolMock,
  closeMock,
  ClientCtorSpy,
  StreamableTransportCtorSpy,
  SSETransportCtorSpy,
  ClientCtorMock,
  StreamableTransportCtor,
  SSETransportCtor,
} = vi.hoisted(() => {
  const connectMock = vi.fn();
  const listToolsMock = vi.fn();
  const callToolMock = vi.fn();
  const closeMock = vi.fn();
  const ClientCtorSpy = vi.fn();
  const StreamableTransportCtorSpy = vi.fn();
  const SSETransportCtorSpy = vi.fn();
  class ClientCtorMock {
    connect = connectMock;
    listTools = listToolsMock;
    callTool = callToolMock;
    close = closeMock;
    constructor(...args: any[]) {
      ClientCtorSpy(...args);
    }
  }
  class StreamableTransportCtor {
    constructor(...args: any[]) {
      StreamableTransportCtorSpy(...args);
    }
  }
  class SSETransportCtor {
    constructor(...args: any[]) {
      SSETransportCtorSpy(...args);
    }
  }
  return {
    connectMock,
    listToolsMock,
    callToolMock,
    closeMock,
    ClientCtorSpy,
    StreamableTransportCtorSpy,
    SSETransportCtorSpy,
    ClientCtorMock,
    StreamableTransportCtor,
    SSETransportCtor,
  };
});

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: ClientCtorMock,
}));
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: StreamableTransportCtor,
}));
vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: SSETransportCtor,
}));

import { McpClientManager, CONNECT_TIMEOUT_MS } from '../manager.js';

function makeLogger(): any {
  return { logDispatch: vi.fn(() => 1) };
}

describe('McpClientManager (Phase 65)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete process.env['MCP_SERVER_URL'];
    delete process.env['MCP_SERVER_BEARER'];
    delete process.env['MCP_SERVER_NAME'];
    connectMock.mockReset().mockResolvedValue(undefined);
    listToolsMock.mockReset().mockResolvedValue({ tools: [] });
    callToolMock.mockReset();
    closeMock.mockReset().mockResolvedValue(undefined);
    ClientCtorSpy.mockClear();
    StreamableTransportCtorSpy.mockClear();
    SSETransportCtorSpy.mockClear();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    vi.useRealTimers();
  });

  describe('configFromEnv (D-01)', () => {
    it('reads all 3 envs when set', () => {
      process.env['MCP_SERVER_URL'] = 'http://x';
      process.env['MCP_SERVER_BEARER'] = 'tok';
      process.env['MCP_SERVER_NAME'] = 'n8n';
      const m = new McpClientManager();
      expect(m.configFromEnv()).toEqual({ url: 'http://x', bearer: 'tok', name: 'n8n' });
    });
    it('returns null when MCP_SERVER_URL is empty/unset', () => {
      const m = new McpClientManager();
      expect(m.configFromEnv()).toBeNull();
    });
    it('defaults bearer to "" and name to "mcp" when only URL is set', () => {
      process.env['MCP_SERVER_URL'] = 'http://x';
      const m = new McpClientManager();
      expect(m.configFromEnv()).toEqual({ url: 'http://x', bearer: '', name: 'mcp' });
    });
  });

  describe('reload', () => {
    it('boot silent opt-in: no URL → status=disconnected, info log (D-02)', async () => {
      const m = new McpClientManager();
      await m.reload(new Set(), makeLogger());
      expect(m.getStatus().status).toBe('disconnected');
      expect(m.getTools()).toEqual([]);
      expect(logSpy.mock.calls.flat().join(' ')).toContain('disabled: MCP_SERVER_URL not configured');
    });

    it('invalid URL: status=error, lastError set (D-03)', async () => {
      process.env['MCP_SERVER_URL'] = 'not a url';
      const m = new McpClientManager();
      await m.reload(new Set(), makeLogger());
      expect(m.getStatus().status).toBe('error');
      expect(m.getStatus().error).toContain('Invalid MCP_SERVER_URL');
    });

    it('connect failure leaves manager empty (SC3)', async () => {
      process.env['MCP_SERVER_URL'] = 'http://localhost:9999';
      connectMock.mockRejectedValueOnce(new Error('ECONNREFUSED-1'));
      connectMock.mockRejectedValueOnce(new Error('ECONNREFUSED-2'));  // SSE fallback also fails
      const m = new McpClientManager();
      await m.reload(new Set(), makeLogger());
      expect(m.getStatus().status).toBe('error');
      expect(m.getTools()).toEqual([]);
      expect(m.getStatus().error).toMatch(/ECONNREFUSED/);
    });

    it('discovers and registers external tools (MCP-CLI-03)', async () => {
      process.env['MCP_SERVER_URL'] = 'http://localhost:1234/mcp';
      process.env['MCP_SERVER_NAME'] = 'n8n';
      listToolsMock.mockResolvedValue({
        tools: [
          { name: 'send_email', description: 'send', inputSchema: { type: 'object', properties: {} } },
          { name: 'fetch_invoices', description: 'fetch', inputSchema: { type: 'object', properties: {} } },
        ],
      });
      const m = new McpClientManager();
      await m.reload(new Set(), makeLogger());
      expect(m.getStatus().status).toBe('connected');
      expect(m.getStatus().toolCount).toBe(2);
      const names = m.getTools().map((t) => t.name);
      expect(names).toEqual(['n8n.send_email', 'n8n.fetch_invoices']);
    });

    it('StreamableHTTP fails → SSE fallback succeeds (Pitfall 4)', async () => {
      process.env['MCP_SERVER_URL'] = 'http://localhost:1234/mcp';
      // Streamable connect throws; SSE connect succeeds
      let attempt = 0;
      connectMock.mockImplementation(async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('protocol error');
        return undefined;
      });
      const m = new McpClientManager();
      await m.reload(new Set(), makeLogger());
      expect(m.getStatus().status).toBe('connected');
      expect(StreamableTransportCtorSpy).toHaveBeenCalledOnce();
      expect(SSETransportCtorSpy).toHaveBeenCalledOnce();
    });

    it('getStatus matches McpClientStatus shape (Plan 01 IPC type)', async () => {
      process.env['MCP_SERVER_URL'] = 'http://x';
      process.env['MCP_SERVER_NAME'] = 'foo';
      const m = new McpClientManager();
      await m.reload(new Set(), makeLogger());
      const s = m.getStatus();
      expect(s).toHaveProperty('status');
      expect(s).toHaveProperty('serverName');
      expect(s).toHaveProperty('toolCount');
      expect(s).toHaveProperty('error');
      expect(s.serverName).toBe('foo');
    });

    it('reload is idempotent: second call closes first client', async () => {
      process.env['MCP_SERVER_URL'] = 'http://x';
      const m = new McpClientManager();
      await m.reload(new Set(), makeLogger());
      await m.reload(new Set(), makeLogger());
      expect(closeMock).toHaveBeenCalled();
    });

    it('collision skip: native name discards external tool (D-06)', async () => {
      process.env['MCP_SERVER_URL'] = 'http://x';
      process.env['MCP_SERVER_NAME'] = 'mem';
      listToolsMock.mockResolvedValue({
        tools: [
          { name: 'recall', description: 'r', inputSchema: { type: 'object' } },
          { name: 'safe_tool', description: 's', inputSchema: { type: 'object' } },
        ],
      });
      const m = new McpClientManager();
      await m.reload(new Set(['mem.recall']), makeLogger());
      expect(m.getStatus().toolCount).toBe(1);
      expect(m.getTools()[0]!.name).toBe('mem.safe_tool');
    });

    it('5s connect timeout: never-resolving connect → status=error', async () => {
      vi.useFakeTimers();
      process.env['MCP_SERVER_URL'] = 'http://x';
      connectMock.mockImplementation(() => new Promise(() => { /* never */ }));
      const m = new McpClientManager();
      const reloadPromise = m.reload(new Set(), makeLogger());
      // Both StreamableHTTP and SSE attempts are 5s each → advance 11s to clear both
      await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS * 2 + 1000);
      await reloadPromise;
      expect(m.getStatus().status).toBe('error');
      expect(m.getStatus().error).toMatch(/timeout/);
    });

    it('getTools returns the same array reference between calls (no rebuild)', async () => {
      process.env['MCP_SERVER_URL'] = 'http://x';
      listToolsMock.mockResolvedValue({ tools: [] });
      const m = new McpClientManager();
      await m.reload(new Set(), makeLogger());
      expect(m.getTools()).toBe(m.getTools());
    });
  });
});
