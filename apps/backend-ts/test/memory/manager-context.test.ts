/**
 * Tests for MemoryManager.buildContext() — tiered memory retrieval
 *
 * Phase 37-P01 — MCTX-01 to MCTX-04
 *
 * Uses vi.fn() mocks for store and vectors to avoid real DB/ChromaDB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryManager } from '../../src/memory/manager.js';

// ---------------------------------------------------------------------------
// Mock MemoryStore and MemoryVectors constructors so no real DB is opened
// ---------------------------------------------------------------------------
vi.mock('../../src/memory/store.js', () => {
  class MockMemoryStore {
    saveTypedMemory = vi.fn();
    startConversation = vi.fn().mockReturnValue(1);
    endConversation = vi.fn();
    saveMessages = vi.fn();
    getProfileFacts = vi.fn().mockReturnValue([{ key: 'nome', value: 'Biel', source: 'explicit' }]);
    upsertProfile = vi.fn();
    close = vi.fn();
  }
  return { MemoryStore: MockMemoryStore };
});

vi.mock('../../src/memory/vectors.js', () => {
  class MockMemoryVectors {
    addTypedMemory = vi.fn().mockResolvedValue(undefined);
    addMemory = vi.fn().mockResolvedValue(undefined);
    queryMemories = vi.fn().mockResolvedValue([]);
    queryMemoriesByType = vi.fn().mockResolvedValue([]);
  }
  return { MemoryVectors: MockMemoryVectors };
});

vi.mock('../../src/config.js', () => ({
  config: { chromaHost: 'localhost', chromaPort: 8000 },
}));

vi.mock('../../src/memory/profile.js', () => ({
  isExplicitProfileCommand: vi.fn().mockReturnValue(false),
  extractProfileFacts: vi.fn().mockResolvedValue({}),
}));

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function makeManager(): MemoryManager {
  return new MemoryManager({});
}

// ---------------------------------------------------------------------------
// MCTX-02: top-k=5 sem threshold
// ---------------------------------------------------------------------------
describe('buildContext() — MCTX-02: top-k=5 sem threshold', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('chama queryMemoriesByType 3 vezes com os tipos corretos e topK=5', async () => {
    const mgr = makeManager();
    await mgr.buildContext('teste de busca');

    const spy = mgr.vectors.queryMemoriesByType as ReturnType<typeof vi.fn>;
    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy).toHaveBeenCalledWith('teste de busca', 'semantic', 5);
    expect(spy).toHaveBeenCalledWith('teste de busca', 'episodic', 5);
    expect(spy).toHaveBeenCalledWith('teste de busca', 'procedural', 5);
  });

  it('NÃO chama queryMemories (legado com threshold)', async () => {
    const mgr = makeManager();
    await mgr.buildContext('teste de busca');

    const legacySpy = mgr.vectors.queryMemories as ReturnType<typeof vi.fn>;
    expect(legacySpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// MCTX-03: queries paralelas < 200ms
// ---------------------------------------------------------------------------
describe('buildContext() — MCTX-03: queries paralelas < 200ms', () => {
  it('completa em < 200ms com 80ms de delay por coleção (paralelo = ~80ms, sequencial = ~240ms)', async () => {
    const mgr = makeManager();

    // Substituir mock para adicionar 80ms de delay real por chamada
    (mgr.vectors.queryMemoriesByType as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        await new Promise<void>((r) => setTimeout(r, 80));
        return [];
      },
    );

    const start = Date.now();
    await mgr.buildContext('latência test');
    const elapsed = Date.now() - start;

    // Paralelo: ~80ms. Sequencial: ~240ms. Margem: 199ms.
    expect(elapsed).toBeLessThan(200);
  });
});

// ---------------------------------------------------------------------------
// MCTX-01: ordem tiered e headers pt-BR
// ---------------------------------------------------------------------------
describe('buildContext() — MCTX-01: ordem tiered e headers pt-BR', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('retorna seções na ordem: Perfil → Semântica → Episódica → Procedural', async () => {
    const mgr = makeManager();

    (mgr.vectors.queryMemoriesByType as ReturnType<typeof vi.fn>).mockImplementation(
      async (_: string, type: string) => {
        if (type === 'semantic') return [{ id: 's1', document: 'fato semântico', similarity: 0.9 }];
        if (type === 'episodic') return [{ id: 'e1', document: 'evento episódico', similarity: 0.8 }];
        if (type === 'procedural') return [{ id: 'p1', document: 'how-to procedural', similarity: 0.7 }];
        return [];
      },
    );

    const ctx = await mgr.buildContext('teste');

    const iPerfil = ctx.indexOf('### Perfil do usuário');
    const iSem = ctx.indexOf('### Memórias semânticas');
    const iEpi = ctx.indexOf('### Memórias episódicas');
    const iPro = ctx.indexOf('### Memórias procedurais');

    expect(iPerfil).toBeGreaterThanOrEqual(0);
    expect(iSem).toBeGreaterThan(iPerfil);
    expect(iEpi).toBeGreaterThan(iSem);
    expect(iPro).toBeGreaterThan(iEpi);
  });

  it('omite seção quando queryMemoriesByType retorna [] para aquele tipo', async () => {
    const mgr = makeManager();

    (mgr.vectors.queryMemoriesByType as ReturnType<typeof vi.fn>).mockImplementation(
      async (_: string, type: string) => {
        if (type === 'semantic') return []; // vazio — deve ser omitido
        if (type === 'episodic') return [{ id: 'e1', document: 'evento', similarity: 0.8 }];
        return [];
      },
    );

    const ctx = await mgr.buildContext('teste');

    expect(ctx).not.toContain('### Memórias semânticas');
    expect(ctx).toContain('### Memórias episódicas');
  });

  it('retorna string vazia quando perfil e todas as typed collections estão vazias', async () => {
    const mgr = makeManager();
    (mgr.store.getProfileFacts as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (mgr.vectors.queryMemoriesByType as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const ctx = await mgr.buildContext('vazio');
    expect(ctx).toBe('');
  });
});

// ---------------------------------------------------------------------------
// MCTX-04: backward compatibility e rollingSum
// ---------------------------------------------------------------------------
describe('buildContext() — MCTX-04: backward compatibility e rollingSum', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('buildContext(userText) sem rollingSum resolve sem erro (call site legado)', async () => {
    const mgr = makeManager();
    await expect(mgr.buildContext('query legada')).resolves.not.toThrow();
  });

  it('insere rollingSum entre Perfil e Memórias semânticas', async () => {
    const mgr = makeManager();

    (mgr.vectors.queryMemoriesByType as ReturnType<typeof vi.fn>).mockImplementation(
      async (_: string, type: string) => {
        if (type === 'semantic') return [{ id: 's1', document: 'fato', similarity: 0.9 }];
        return [];
      },
    );

    const rolling = 'Resumo: falamos sobre bugs ontem.';
    const ctx = await mgr.buildContext('teste', rolling);

    const iPerfil = ctx.indexOf('### Perfil do usuário');
    const iRolling = ctx.indexOf(rolling);
    const iSem = ctx.indexOf('### Memórias semânticas');

    expect(iRolling).toBeGreaterThan(iPerfil);
    expect(iSem).toBeGreaterThan(iRolling);
  });
});
