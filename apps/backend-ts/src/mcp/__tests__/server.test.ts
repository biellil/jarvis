import { describe, it, expect, vi } from 'vitest';

// Mock SDK to avoid real stdio/process.stdin dependency
const registeredToolNames: string[] = [];
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  function MockMcpServer(this: any, { name }: { name: string }) {
    this._name = name;
    this.tool = vi.fn((toolName: string) => { registeredToolNames.push(toolName); });
    this.connect = vi.fn();
    this.close = vi.fn();
  }
  return { McpServer: vi.fn(function (this: any, opts: { name: string }) { MockMcpServer.call(this, opts); }) };
});
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
  function MockStdioServerTransport(this: any) {}
  return { StdioServerTransport: vi.fn(function (this: any) { MockStdioServerTransport.call(this); }) };
});

import type { MemoryManager } from '../../memory/index.js';
const { createMcpServer } = await import('../server.js');

const mockMemory = {
  buildContext: vi.fn(async () => ''),
} as unknown as MemoryManager;

describe('createMcpServer', () => {
  it('registers exactly 5 tools', () => {
    registeredToolNames.length = 0;
    createMcpServer(mockMemory);
    expect(registeredToolNames).toHaveLength(5);
    expect(registeredToolNames).toContain('recall_memory');
    expect(registeredToolNames).toContain('list_files');
    expect(registeredToolNames).toContain('openFile');
    expect(registeredToolNames).toContain('openFolder');
    expect(registeredToolNames).toContain('viewContent');
  });

  it('creates McpServer with name "jarvis"', async () => {
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    expect(McpServer).toHaveBeenCalledWith(expect.objectContaining({ name: 'jarvis' }));
  });
});
