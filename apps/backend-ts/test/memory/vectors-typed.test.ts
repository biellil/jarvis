/**
 * Tests for MemoryVectors typed methods:
 *   addTypedMemory(), queryMemoriesByType()
 *
 * Phase 36-P02 — v1.8 Memory Intelligence
 *
 * Uses mock collections to avoid real ChromaDB server.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { MemoryVectors } from '../../src/memory/vectors.js';

// ---------------------------------------------------------------------------
// Mock embedText so no real model is needed
// ---------------------------------------------------------------------------
vi.mock('../../src/memory/embeddings.js', () => ({
  embedText: vi.fn().mockResolvedValue(new Float32Array([0.1, 0.2, 0.3])),
  EMBEDDING_MODEL: 'mock-model',
}));

// ---------------------------------------------------------------------------
// Mock ChromaClient so no real server connection is made
// ---------------------------------------------------------------------------
vi.mock('chromadb', () => ({
  ChromaClient: vi.fn().mockImplementation(() => ({
    getOrCreateCollection: vi.fn().mockResolvedValue({
      upsert: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ ids: [[]], documents: [[]], distances: [[]], metadatas: [[]] }),
      count: vi.fn().mockResolvedValue(0),
    }),
  })),
}));

// ---------------------------------------------------------------------------
// Mock config to avoid env var requirements
// ---------------------------------------------------------------------------
vi.mock('../../src/config.js', () => ({
  config: { chromaHost: 'localhost', chromaPort: 8000 },
}));

// ---------------------------------------------------------------------------
// Helper: create a mock collection
// ---------------------------------------------------------------------------
function makeMockCollection(
  docs: string[] = [],
  ids: string[] = [],
  distances: number[] = [],
) {
  return {
    upsert: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue({
      ids: [ids],
      documents: [docs],
      distances: [distances],
      metadatas: [ids.map(() => ({}))],
    }),
    count: vi.fn().mockResolvedValue(docs.length),
  };
}

// ---------------------------------------------------------------------------
// Helper: create a MemoryVectors with mocked typedCollections
// ---------------------------------------------------------------------------
function makeVectorsWithMocks(collections: Record<string, ReturnType<typeof makeMockCollection>>) {
  const vectors = new MemoryVectors({});
  // Override initTypedCollections to populate typedCollections map with mocks
  // @ts-expect-error — accessing private field for testing
  vectors['initTypedCollections'] = vi.fn().mockImplementation(async () => {
    for (const [type, col] of Object.entries(collections)) {
      // @ts-expect-error — accessing private field for testing
      vectors['typedCollections'].set(type, col);
    }
  });
  return vectors;
}

// ---------------------------------------------------------------------------
// addTypedMemory tests
// ---------------------------------------------------------------------------
describe('MemoryVectors.addTypedMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls upsert on the semantic collection', async () => {
    const semanticCol = makeMockCollection();
    const episodicCol = makeMockCollection();
    const proceduralCol = makeMockCollection();

    const vectors = makeVectorsWithMocks({
      semantic: semanticCol,
      episodic: episodicCol,
      procedural: proceduralCol,
    });

    await vectors.addTypedMemory('doc-001', 'User prefers dark mode', 'semantic', { source: 'test' });

    expect(semanticCol.upsert).toHaveBeenCalledOnce();
    expect(episodicCol.upsert).not.toHaveBeenCalled();
    expect(proceduralCol.upsert).not.toHaveBeenCalled();

    const call = semanticCol.upsert.mock.calls[0][0];
    expect(call.ids).toEqual(['doc-001']);
    expect(call.documents).toEqual(['User prefers dark mode']);
    expect(Array.isArray(call.embeddings[0])).toBe(true);
  });

  it('logs warn and does not throw when collection throws', async () => {
    const brokenCol = {
      upsert: vi.fn().mockRejectedValue(new Error('ChromaDB unavailable')),
      query: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    };

    const vectors = makeVectorsWithMocks({ semantic: brokenCol });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      vectors.addTypedMemory('doc-fail', 'some content', 'semantic'),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledOnce();
    const warnMsg = warnSpy.mock.calls[0].join(' ');
    expect(warnMsg).toContain('addTypedMemory');
    expect(warnMsg).toContain('semantic');
  });
});

// ---------------------------------------------------------------------------
// queryMemoriesByType tests
// ---------------------------------------------------------------------------
describe('MemoryVectors.queryMemoriesByType', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps query results to QueryResult[] with similarity = 1 - distance', async () => {
    const episodicCol = makeMockCollection(
      ['User reported a bug'],
      ['ep-001'],
      [0.2], // distance 0.2 → similarity 0.8
    );

    const vectors = makeVectorsWithMocks({ episodic: episodicCol });

    const results = await vectors.queryMemoriesByType('bug report', 'episodic', 3);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 'ep-001',
      document: 'User reported a bug',
      similarity: expect.closeTo(0.8, 5),
    });
  });

  it('returns [] on error without throwing', async () => {
    const brokenCol = {
      upsert: vi.fn(),
      query: vi.fn().mockRejectedValue(new Error('query failed')),
      count: vi.fn().mockResolvedValue(1),
    };

    const vectors = makeVectorsWithMocks({ semantic: brokenCol });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const results = await vectors.queryMemoriesByType('anything', 'semantic', 5);

    expect(results).toEqual([]);
    expect(warnSpy).toHaveBeenCalledOnce();
    const warnMsg = warnSpy.mock.calls[0].join(' ');
    expect(warnMsg).toContain('queryMemoriesByType');
  });
});
