/**
 * Tests for validateMemoryConsistency() — Phase 35-P02
 *
 * Uses mocked ChromaDB (no real server needed).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { MemoryStore } from '../../src/memory/store.js';
import { validateMemoryConsistency } from '../../src/memory/consistency.js';

let tmpDir: string;
let dbPath: string;
let store: MemoryStore;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'jarvis-consistency-'));
  dbPath = path.join(tmpDir, 'test.sqlite');
  store = new MemoryStore(dbPath);
});

afterEach(() => {
  try {
    store.close();
  } catch {}
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/** Helper: create a conversation and return its id */
function createConversation(): number {
  const id = store.startConversation();
  if (id === null) throw new Error('startConversation returned null');
  return id;
}

describe('validateMemoryConsistency', () => {
  it('logs WARN when SQLite rows are missing from ChromaDB', async () => {
    const convId = createConversation();
    const iso = new Date().toISOString();

    store.saveTypedMemory({ id: 'tm-match', conversationId: convId, type: 'semantic', content: 'exists in chroma', extractedAt: iso, createdAt: iso });
    store.saveTypedMemory({ id: 'tm-missing', conversationId: convId, type: 'episodic', content: 'missing from chroma', extractedAt: iso, createdAt: iso });

    const fakeVectors = {
      getAllDocIds: vi.fn<[], Promise<Set<string>>>().mockResolvedValue(new Set(['tm-match'])),
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await validateMemoryConsistency(store, fakeVectors as any);

    const warnCalls = warnSpy.mock.calls.map(args => args.join(' '));
    const hasConsistencyWarn = warnCalls.some(msg => msg.includes('[consistency check]'));
    expect(hasConsistencyWarn).toBe(true);

    const hasMismatchCount = warnCalls.some(msg => msg.includes('1'));
    expect(hasMismatchCount).toBe(true);
  });

  it('does not throw when ChromaDB errors', async () => {
    const fakeVectors = {
      getAllDocIds: vi.fn<[], Promise<Set<string>>>().mockRejectedValue(new Error('ChromaDB unavailable')),
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Should resolve without throwing
    await expect(validateMemoryConsistency(store, fakeVectors as any)).resolves.toBeUndefined();

    const warnCalls = warnSpy.mock.calls.map(args => args.join(' '));
    const hasValidationFailedWarn = warnCalls.some(msg => msg.includes('validation failed'));
    expect(hasValidationFailedWarn).toBe(true);
  });

  it('does not log WARN when all SQLite rows are in ChromaDB', async () => {
    const convId = createConversation();
    const iso = new Date().toISOString();

    store.saveTypedMemory({ id: 'tm-present', conversationId: convId, type: 'semantic', content: 'in both stores', extractedAt: iso, createdAt: iso });

    const fakeVectors = {
      getAllDocIds: vi.fn<[], Promise<Set<string>>>().mockResolvedValue(new Set(['tm-present'])),
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await validateMemoryConsistency(store, fakeVectors as any);

    // Should NOT have called console.warn with mismatch
    const warnCalls = warnSpy.mock.calls.map(args => args.join(' '));
    const hasMismatchWarn = warnCalls.some(msg => msg.includes('[consistency check]') && msg.includes('missing'));
    expect(hasMismatchWarn).toBe(false);
  });
});
