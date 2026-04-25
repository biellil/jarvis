/**
 * Tests for MemoryManager typed methods:
 *   saveTypedMemory() — dual-write to SQLite + ChromaDB
 *   llm field — optional BaseChatModel on MemoryManagerOptions
 *
 * Phase 36-P02 — v1.8 Memory Intelligence
 *
 * Uses vi.fn() mocks for store and vectors to avoid real DB/ChromaDB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Extraction } from '../../src/memory/extractor.js';
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
    getProfileFacts = vi.fn().mockReturnValue([]);
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
  }
  return { MemoryVectors: MockMemoryVectors };
});

vi.mock('../../src/memory/profile.js', () => ({
  isExplicitProfileCommand: vi.fn().mockReturnValue(false),
  extractProfileFacts: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../src/config.js', () => ({
  config: { chromaHost: 'localhost', chromaPort: 8000 },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeManager(): MemoryManager {
  return new MemoryManager({});
}

const semanticExtraction: Extraction = {
  type: 'semantic',
  content: 'User prefers TypeScript over JavaScript',
  confidence: 0.9,
};

const episodicExtraction: Extraction = {
  type: 'episodic',
  content: 'User reported a bug in the login flow today',
  confidence: 0.75,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('MemoryManager.saveTypedMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns immediately when convId is null', async () => {
    const mgr = makeManager();
    await mgr.saveTypedMemory(null, semanticExtraction);

    expect(mgr.store.saveTypedMemory).not.toHaveBeenCalled();
    expect(mgr.vectors.addTypedMemory).not.toHaveBeenCalled();
  });

  it('calls store.saveTypedMemory with correct TypedMemoryEntry shape', async () => {
    const mgr = makeManager();
    await mgr.saveTypedMemory(42, semanticExtraction);

    expect(mgr.store.saveTypedMemory).toHaveBeenCalledOnce();
    const entry = (mgr.store.saveTypedMemory as ReturnType<typeof vi.fn>).mock.calls[0][0];

    // id must start with conv-42-semantic-
    expect(entry.id).toMatch(/^conv-42-semantic-\d+$/);
    expect(entry.conversationId).toBe(42);
    expect(entry.type).toBe('semantic');
    expect(entry.content).toBe(semanticExtraction.content);
    expect(entry.confidence).toBe(semanticExtraction.confidence);
    expect(typeof entry.extractedAt).toBe('string');
    expect(typeof entry.createdAt).toBe('string');
    expect(entry.sourceId).toBeUndefined();
  });

  it('calls vectors.addTypedMemory with correct type routing', async () => {
    const mgr = makeManager();
    await mgr.saveTypedMemory(7, episodicExtraction);

    expect(mgr.vectors.addTypedMemory).toHaveBeenCalledOnce();
    const [memId, content, type, metadata] = (mgr.vectors.addTypedMemory as ReturnType<typeof vi.fn>).mock.calls[0];

    expect(memId).toMatch(/^conv-7-episodic-\d+$/);
    expect(content).toBe(episodicExtraction.content);
    expect(type).toBe('episodic');
    expect(metadata).toMatchObject({
      convId: '7',
      type: 'episodic',
      confidence: String(episodicExtraction.confidence),
    });
  });

  it('logs warn and does not throw when store.saveTypedMemory throws', async () => {
    const mgr = makeManager();
    (mgr.store.saveTypedMemory as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('db write error');
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(mgr.saveTypedMemory(1, semanticExtraction)).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledOnce();
    const warnMsg = warnSpy.mock.calls[0].join(' ');
    expect(warnMsg).toContain('MemoryManager.saveTypedMemory failed');
  });
});

describe('MemoryManager llm field', () => {
  it('is undefined when not provided in options', () => {
    const mgr = new MemoryManager({});
    expect(mgr.llm).toBeUndefined();
  });

  it('is set when provided in options', () => {
    const fakeLlm = { invoke: vi.fn() } as unknown as Parameters<typeof MemoryManager>[0]['llm'];
    const mgr = new MemoryManager({ llm: fakeLlm });
    expect(mgr.llm).toBe(fakeLlm);
  });
});
