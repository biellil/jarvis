import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryManager } from './manager.js';

// Mock completo de MemoryStore — evita SQLite real
// Nota: mockImplementation deve usar function() {} (não arrow) para compatibilidade com new
vi.mock('./store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(function () {
    return {
      countMessages: vi.fn().mockReturnValue(0),
      getOldestMessages: vi.fn().mockReturnValue([]),
      deleteMessages: vi.fn(),
      saveSummary: vi.fn(),
      getProfileFacts: vi.fn().mockReturnValue([
        { key: 'nome', value: 'Biel', source: 'explicit', createdAt: '2026-01-01' },
      ]),
      startConversation: vi.fn().mockReturnValue(1),
      endConversation: vi.fn(),
      saveMessages: vi.fn(),
      close: vi.fn(),
      getLatestSummary: vi.fn().mockReturnValue(null),
    };
  }),
  ToolLogger: vi.fn().mockImplementation(function () { return {}; }),
}));

// Mock MemoryVectors — evita ChromaDB real
vi.mock('./vectors.js', () => ({
  MemoryVectors: vi.fn().mockImplementation(function () {
    return {
      queryMemoriesByType: vi.fn().mockResolvedValue([]),
      addMemory: vi.fn().mockResolvedValue(true),
      addTypedMemory: vi.fn().mockResolvedValue(true),
      backfillSpeakerIds: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

function makeLlm(summaryResponse = '- Fato 1\n- Fato 2') {
  return {
    invoke: vi.fn().mockResolvedValue({ content: summaryResponse }),
  } as any;
}

describe('MemoryManager.runRollingSummarization', () => {
  it('retorna imediatamente quando count < 20 sem chamar LLM', async () => {
    const llm = makeLlm();
    const mm = new MemoryManager({ llm });
    (mm.store.countMessages as any).mockReturnValue(5);
    await mm.runRollingSummarization(1);
    expect(llm.invoke).not.toHaveBeenCalled();
    expect(mm.store.deleteMessages).not.toHaveBeenCalled();
  });

  it('quando count >= 20: busca 10 mais antigas, gera summary, deleta e salva', async () => {
    const llm = makeLlm('- Resumo do passado');
    const mm = new MemoryManager({ llm });
    const fakeMessages = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      conversationId: 1,
      role: 'user',
      content: `msg${i + 1}`,
      createdAt: '2026-01-01',
    }));
    (mm.store.countMessages as any).mockReturnValue(20);
    (mm.store.getOldestMessages as any).mockReturnValue(fakeMessages);
    await mm.runRollingSummarization(1);
    expect(mm.store.getOldestMessages).toHaveBeenCalledWith(1, 10);
    expect(llm.invoke).toHaveBeenCalledOnce();
    expect(mm.store.deleteMessages).toHaveBeenCalledWith([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(mm.store.saveSummary).toHaveBeenCalledWith(
      1,
      expect.stringContaining('Resumo do passado'),
    );
  });

  it('NÃO deleta mensagens se LLM retornar string vazia', async () => {
    const llm = makeLlm('');
    const mm = new MemoryManager({ llm });
    const fakeMessages = [
      { id: 1, conversationId: 1, role: 'user', content: 'x', createdAt: '2026-01-01' },
    ];
    (mm.store.countMessages as any).mockReturnValue(20);
    (mm.store.getOldestMessages as any).mockReturnValue(fakeMessages);
    await mm.runRollingSummarization(1);
    expect(mm.store.deleteMessages).not.toHaveBeenCalled();
    expect(mm.store.saveSummary).not.toHaveBeenCalled();
  });

  it('não propaga erros — resolve silenciosamente quando LLM lança Error', async () => {
    const llm = { invoke: vi.fn().mockRejectedValue(new Error('LLM down')) } as any;
    const mm = new MemoryManager({ llm });
    (mm.store.countMessages as any).mockReturnValue(20);
    (mm.store.getOldestMessages as any).mockReturnValue([
      { id: 1, conversationId: 1, role: 'user', content: 'x', createdAt: '2026-01-01' },
    ]);
    await expect(mm.runRollingSummarization(1)).resolves.toBeUndefined();
  });

  it('atualiza _latestSummary após sumarização bem-sucedida', async () => {
    const llm = makeLlm('summary texto');
    const mm = new MemoryManager({ llm });
    (mm.store.countMessages as any).mockReturnValue(20);
    (mm.store.getOldestMessages as any).mockReturnValue([
      { id: 1, conversationId: 1, role: 'user', content: 'x', createdAt: '2026-01-01' },
    ]);
    await mm.runRollingSummarization(1);
    // _latestSummary é private, mas buildContext o expõe indiretamente
    const ctx = await mm.buildContext('qualquer coisa');
    expect(ctx).toContain('summary texto');
  });

  it('runRollingSummarization(null) retorna sem chamar nenhum método do store', async () => {
    const llm = makeLlm();
    const mm = new MemoryManager({ llm });
    await mm.runRollingSummarization(null);
    expect(mm.store.countMessages).not.toHaveBeenCalled();
  });
});

describe('MemoryManager.buildContext com _latestSummary (MSUM-03)', () => {
  it('quando rollingSum não passado e _latestSummary existe, injeta no contexto', async () => {
    const llm = makeLlm('- Resumo cached');
    const mm = new MemoryManager({ llm });
    (mm.store.countMessages as any).mockReturnValue(20);
    (mm.store.getOldestMessages as any).mockReturnValue([
      { id: 1, conversationId: 1, role: 'user', content: 'x', createdAt: '2026-01-01' },
    ]);
    await mm.runRollingSummarization(1);
    // buildContext sem rollingSum explícito deve usar _latestSummary
    const ctx = await mm.buildContext('query');
    expect(ctx).toContain('Resumo cached');
  });

  it('rollingSum explícito tem prioridade sobre _latestSummary', async () => {
    const llm = makeLlm('cached summary');
    const mm = new MemoryManager({ llm });
    (mm.store.countMessages as any).mockReturnValue(20);
    (mm.store.getOldestMessages as any).mockReturnValue([
      { id: 1, conversationId: 1, role: 'user', content: 'x', createdAt: '2026-01-01' },
    ]);
    await mm.runRollingSummarization(1);
    const ctx = await mm.buildContext('query', 'explicit summary override');
    expect(ctx).toContain('explicit summary override');
    expect(ctx).not.toContain('cached summary');
  });

  it('summary aparece após Perfil do usuário e antes de Memórias', async () => {
    const llm = makeLlm('- Item do resumo');
    const mm = new MemoryManager({ llm });
    (mm.store.countMessages as any).mockReturnValue(20);
    (mm.store.getOldestMessages as any).mockReturnValue([
      { id: 1, conversationId: 1, role: 'user', content: 'x', createdAt: '2026-01-01' },
    ]);
    await mm.runRollingSummarization(1);
    // HybridRetriever.retrieve() is used now (Phase 93) — mock via the retriever instance
    (mm as any).retriever.retrieve = vi.fn().mockResolvedValue([
      { id: 'm1', document: 'preferência: café', score: 0.9 },
    ]);
    const ctx = await mm.buildContext('query');
    const profilePos = ctx.indexOf('### Perfil do usuário');
    const summaryPos = ctx.indexOf('Item do resumo');
    const memoriesPos = ctx.indexOf('### Memórias');
    expect(profilePos).toBeGreaterThanOrEqual(0);
    expect(summaryPos).toBeGreaterThan(profilePos);
    expect(memoriesPos).toBeGreaterThan(summaryPos);
  });
});
