import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MemoryManager } from '../../../memory/index.js';

// Mock McpServer — capture registered tools
const registeredTools: Record<string, { handler: Function; schema: unknown }> = {};
const mockServer = {
  tool: vi.fn((name: string, params: unknown, handler: Function) => {
    registeredTools[name] = { handler, schema: params };
  }),
};

// Mock createRecallMemoryTool to avoid real LangChain initialization
vi.mock('../../../session/tools.js', () => ({
  createRecallMemoryTool: (memory: MemoryManager) => ({
    invoke: async ({ query }: { query: string }) => {
      return memory.buildContext(query);
    },
  }),
}));

// Import after mocks
const { registerMemoryTools } = await import('../../tools/memory.js');

function makeMemory(impl: (q: string) => Promise<string>) {
  return { buildContext: vi.fn(impl) } as unknown as MemoryManager;
}

describe('registerMemoryTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(registeredTools).forEach(k => delete registeredTools[k]);
  });

  it('registers "recall_memory" tool on the server', () => {
    const memory = makeMemory(async () => '');
    registerMemoryTools(mockServer as any, memory);
    expect(mockServer.tool).toHaveBeenCalledOnce();
    expect(mockServer.tool.mock.calls[0]?.[0]).toBe('recall_memory');
  });

  it('handler returns content block with memory result', async () => {
    const memory = makeMemory(async () => '### Preferências\n- gosta de café');
    registerMemoryTools(mockServer as any, memory);
    const { handler } = registeredTools['recall_memory']!;
    const result = await handler({ query: 'café' });
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('café');
    expect(result.isError).toBeFalsy();
  });

  it('handler returns fallback text when buildContext returns empty string', async () => {
    const memory = makeMemory(async () => '');
    registerMemoryTools(mockServer as any, memory);
    const { handler } = registeredTools['recall_memory']!;
    const result = await handler({ query: 'assunto inexistente' });
    expect(result.content[0].text).toBe('Nenhuma memória relevante encontrada.');
  });

  it('handler returns isError:true on buildContext throw', async () => {
    const memory = makeMemory(async () => { throw new Error('DB offline'); });
    registerMemoryTools(mockServer as any, memory);
    const { handler } = registeredTools['recall_memory']!;
    const result = await handler({ query: 'falha' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Erro');
  });
});
