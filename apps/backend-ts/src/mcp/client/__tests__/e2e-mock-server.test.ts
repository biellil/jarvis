import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mock server + ctor classes — vi.fn factory cannot be used as constructor
// in vi.hoisted() context (Vitest 4 limitation), so we wrap the mock server's client
// in a class whose constructor returns the same instance per test.
const { mockServer, ClientCtor, StreamableTransportCtor, SSETransportCtor } = vi.hoisted(() => {
  // Inline factory — defining createMockMcpServer here avoids cross-module hoist deps
  let tools: Array<{ name: string; description?: string; inputSchema: any }> = [];
  let callToolHandler: (req: { name: string; arguments: any }) => Promise<any> = async (req) => ({
    content: [{ type: 'text', text: `mock response for ${req.name}` }],
  });
  const client = {
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn(async () => ({ tools })),
    callTool: vi.fn((req: { name: string; arguments: any }) => callToolHandler(req)),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mockServer = {
    client,
    setTools: (next: typeof tools) => { tools = [...next]; },
    setCallToolHandler: (fn: typeof callToolHandler) => { callToolHandler = fn; },
  };
  // Class-based ctor that always returns the SAME mock client instance.
  class ClientCtor {
    connect = client.connect;
    listTools = client.listTools;
    callTool = client.callTool;
    close = client.close;
  }
  class StreamableTransportCtor {}
  class SSETransportCtor {}
  return { mockServer, ClientCtor, StreamableTransportCtor, SSETransportCtor };
});

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: ClientCtor,
}));
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: StreamableTransportCtor,
}));
vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: SSETransportCtor,
}));

import { McpClientManager } from '../manager.js';

function makeLogger(): any {
  return { logDispatch: vi.fn(() => 1) };
}

describe('e2e: McpClientManager + tool-adapter against mock MCP server (SC2)', () => {
  beforeEach(() => {
    process.env['MCP_SERVER_URL'] = 'http://mock';
    process.env['MCP_SERVER_NAME'] = 'n8n';
    delete process.env['MCP_SERVER_BEARER'];
    mockServer.client.callTool.mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('agent uses external tool: tool returned by manager invokes mock server callTool', async () => {
    mockServer.setTools([
      {
        name: 'send_email',
        description: 'Send an email',
        inputSchema: {
          type: 'object',
          properties: { to: { type: 'string' }, body: { type: 'string' } },
          required: ['to', 'body'],
        },
      },
    ]);
    mockServer.setCallToolHandler(async (req) => {
      expect(req.name).toBe('send_email');
      expect(req.arguments).toEqual({ to: 'a@b.com', body: 'hello' });
      return { content: [{ type: 'text', text: 'OK msg-id-42' }] };
    });

    const m = new McpClientManager();
    await m.reload(new Set(), makeLogger());
    const tools = m.getTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe('n8n.send_email');

    const result = await tools[0]!.invoke({ to: 'a@b.com', body: 'hello' });
    expect(result).toBe('OK msg-id-42');
    expect(mockServer.client.callTool).toHaveBeenCalledOnce();
  });

  it('honors collision check after listTools (D-06 integrated)', async () => {
    mockServer.setTools([
      { name: 'send_email', description: 's', inputSchema: { type: 'object' } },
      { name: 'fetch_invoices', description: 'f', inputSchema: { type: 'object' } },
    ]);
    const m = new McpClientManager();
    await m.reload(new Set(['n8n.fetch_invoices']), makeLogger());
    const names = m.getTools().map((t) => t.name);
    expect(names).toEqual(['n8n.send_email']);
  });

  it('real Zod schema (via @n8n/json-schema-to-zod) rejects missing required field', async () => {
    mockServer.setTools([
      {
        name: 'must_have_to',
        description: 'must include to',
        inputSchema: {
          type: 'object',
          properties: { to: { type: 'string' } },
          required: ['to'],
        },
      },
    ]);
    const m = new McpClientManager();
    await m.reload(new Set(), makeLogger());
    const tool = m.getTools()[0]!;
    await expect(tool.invoke({} as any)).rejects.toBeTruthy();
    expect(mockServer.client.callTool).not.toHaveBeenCalled();
  });
});
