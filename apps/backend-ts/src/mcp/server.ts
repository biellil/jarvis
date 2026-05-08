// Phase 64 — MCP Server factory (MCP-SRV-01, MCP-SRV-02, D-01, D-02, D-04)
// Creates McpServer with all tools registered. Lazy startup — caller controls connect/close.
// CRITICAL: no console.log() — corrupts stdio JSON-RPC (D-04).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { MemoryManager } from '../memory/index.js';
import { registerMemoryTools } from './tools/memory.js';
import { registerFileActionTools } from './tools/file-actions.js';
import { clientSessions } from './client-sessions.js';

const STDIO_CLIENT_ID = 'stdio-client-1';

export interface McpServerInstance {
  server: McpServer;
  connect: () => Promise<void>;
  close: () => Promise<void>;
}

export function createMcpServer(memory: MemoryManager): McpServerInstance {
  const server = new McpServer({ name: 'jarvis', version: '3.0.0' });

  registerMemoryTools(server, memory);
  registerFileActionTools(server);

  let transport: StdioServerTransport | null = null;

  return {
    server,
    async connect() {
      transport = new StdioServerTransport();
      await server.connect(transport);
      clientSessions.connect(STDIO_CLIENT_ID);
      console.error('[MCP] Server started on stdio transport');
    },
    async close() {
      await server.close();
      clientSessions.disconnect(STDIO_CLIENT_ID);
      transport = null;
      console.error('[MCP] Server stopped');
    },
  };
}
