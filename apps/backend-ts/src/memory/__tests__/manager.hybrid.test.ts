import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryManager } from '../manager.js';

// Mock MemoryStore — avoids real SQLite
vi.mock('../store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(function () {
    return {
      countMessages: vi.fn().mockReturnValue(0),
      getOldestMessages: vi.fn().mockReturnValue([]),
      deleteMessages: vi.fn(),
      saveSummary: vi.fn(),
      getProfileFacts: vi.fn().mockReturnValue([]),
      startConversation: vi.fn().mockReturnValue(1),
      endConversation: vi.fn(),
      saveMessages: vi.fn(),
      close: vi.fn(),
      getLatestSummary: vi.fn().mockReturnValue(null),
    };
  }),
  ToolLogger: vi.fn().mockImplementation(function () { return {}; }),
}));

// Mock MemoryVectors — avoids real ChromaDB
vi.mock('../vectors.js', () => ({
  MemoryVectors: vi.fn().mockImplementation(function () {
    return {
      queryMemoriesByType: vi.fn().mockResolvedValue([]),
      addMemory: vi.fn().mockResolvedValue(true),
      addTypedMemory: vi.fn().mockResolvedValue(true),
      backfillSpeakerIds: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

// Mock HybridRetriever — isolates MemoryManager from SQLite/ChromaDB in these tests
const mockRetrieve = vi.fn().mockResolvedValue([]);
vi.mock('../hybrid-retriever.js', () => ({
  HybridRetriever: vi.fn().mockImplementation(function () {
    return { retrieve: mockRetrieve };
  }),
}));

// Mock db.ts — avoids touching real SQLite file on import
vi.mock('../db.js', () => ({
  db: {},
  sqlite: {},
}));

beforeEach(() => {
  mockRetrieve.mockReset();
  mockRetrieve.mockResolvedValue([]);
});

describe('MemoryManager.buildContext — HybridRetriever integration (HMEM-04, HMEM-06)', () => {
  // Test 1 (HMEM-06 — single section)
  it('produces a single ### Memórias section (not three typed sections)', async () => {
    mockRetrieve.mockResolvedValue([{ id: 'm1', document: 'Python é legal', score: 0.9 }]);
    const mm = new MemoryManager();
    const result = await mm.buildContext('python');

    expect(result).toContain('### Memórias');
    expect(result).toContain('Python é legal');
    expect(result).not.toContain('### Memórias semânticas');
    expect(result).not.toContain('### Memórias episódicas');
    expect(result).not.toContain('### Memórias procedurais');
  });

  // Test 2 (HMEM-06 — empty results: section omitted)
  it('omits ### Memórias section when retrieve returns empty array', async () => {
    mockRetrieve.mockResolvedValue([]);
    const mm = new MemoryManager();
    const result = await mm.buildContext('anything');

    expect(result).not.toContain('### Memórias');
  });

  // Test 3 (HMEM-06 — API unchanged: backward-compatible constructor + signature)
  it('MemoryManager constructor works with no arguments and buildContext accepts optional rollingSum', async () => {
    const mm = new MemoryManager();
    await expect(mm.buildContext('test')).resolves.not.toThrow();
    await expect(mm.buildContext('test', 'some summary')).resolves.not.toThrow();
  });

  // Test 4 (HMEM-04 — recency as tiebreaker: manager preserves retrieve() order)
  it('preserves retrieve() output order — manager does not re-sort by recency', async () => {
    const results = [
      { id: 'a', document: 'primeiro resultado', score: 0.9 },
      { id: 'b', document: 'segundo resultado', score: 0.7 },
      { id: 'c', document: 'terceiro resultado', score: 0.5 },
    ];
    mockRetrieve.mockResolvedValue(results);
    const mm = new MemoryManager();
    const result = await mm.buildContext('query');

    const posA = result.indexOf('primeiro resultado');
    const posB = result.indexOf('segundo resultado');
    const posC = result.indexOf('terceiro resultado');

    expect(posA).toBeGreaterThanOrEqual(0);
    expect(posB).toBeGreaterThan(posA);
    expect(posC).toBeGreaterThan(posB);
  });

  // Test 5 (HMEM-06 — profile + summary + memories section ordering)
  it('outputs sections in correct order: ### Perfil → ### Resumo → ### Memórias', async () => {
    const { MemoryStore } = await import('../store.js');
    mockRetrieve.mockResolvedValue([{ id: 'm1', document: 'fact1', score: 0.9 }]);

    const mm = new MemoryManager();
    (mm.store.getProfileFacts as ReturnType<typeof vi.fn>).mockReturnValue([
      { key: 'nome', value: 'Biel', source: 'explicit', createdAt: '2026-01-01' },
    ]);

    const result = await mm.buildContext('query', '### Resumo\n- resumo item');

    const profilePos = result.indexOf('### Perfil do usuário');
    const resumoPos = result.indexOf('### Resumo');
    const memoriesPos = result.indexOf('### Memórias');

    expect(profilePos).toBeGreaterThanOrEqual(0);
    expect(resumoPos).toBeGreaterThan(profilePos);
    expect(memoriesPos).toBeGreaterThan(resumoPos);
    expect(result).toContain('fact1');
  });
});
