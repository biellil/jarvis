/**
 * Phase 65 — In-process mock for `@modelcontextprotocol/sdk` Client.
 *
 * Used by e2e-mock-server.test.ts and (potentially) Plan 03 watcher integration tests.
 * Provides a configurable Client mock with controllable listTools() and callTool().
 */
import { vi } from 'vitest';

export interface MockMcpToolDef {
  name: string;
  description?: string;
  inputSchema: { type: 'object'; properties?: Record<string, unknown>; required?: string[] };
}

export interface MockMcpServer {
  client: any;  // shape: { connect, listTools, callTool, close }
  setTools: (tools: MockMcpToolDef[]) => void;
  setCallToolHandler: (
    fn: (req: { name: string; arguments: any }) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>,
  ) => void;
}

export function createMockMcpServer(initialTools: MockMcpToolDef[] = []): MockMcpServer {
  let tools = [...initialTools];
  let callToolHandler: (req: { name: string; arguments: any }) => Promise<any> = async (req) => ({
    content: [{ type: 'text', text: `mock response for ${req.name}` }],
  });

  const client = {
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn(async () => ({ tools })),
    callTool: vi.fn((req: { name: string; arguments: any }) => callToolHandler(req)),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return {
    client,
    setTools: (next) => { tools = [...next]; },
    setCallToolHandler: (fn) => { callToolHandler = fn; },
  };
}
