/**
 * Tests for MemoryStore typed memory methods:
 *   saveTypedMemory(), getTypedMemories(), getAllTypedMemories()
 *
 * Phase 35-P02 — v1.8 Memory Intelligence
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import { MemoryStore, type TypedMemoryEntry } from '../../src/memory/store.js';

let tmpDir: string;
let dbPath: string;
let store: MemoryStore;
let sqlite: Database.Database;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'jarvis-store-typed-'));
  dbPath = path.join(tmpDir, 'test.sqlite');
  store = new MemoryStore(dbPath);
  sqlite = new Database(dbPath);
});

afterEach(() => {
  try {
    sqlite.close();
  } catch {}
  try {
    store.close();
  } catch {}
  rmSync(tmpDir, { recursive: true, force: true });
});

/** Helper: create a conversation and return its id */
function createConversation(): number {
  const id = store.startConversation();
  if (id === null) throw new Error('startConversation returned null');
  return id;
}

describe('MemoryStore.saveTypedMemory', () => {
  it('persists a row to typed_memories', () => {
    const convId = createConversation();
    const entry: TypedMemoryEntry = {
      id: 'tm-01',
      conversationId: convId,
      type: 'semantic',
      content: 'User prefers dark mode',
      extractedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    store.saveTypedMemory(entry);

    const row = sqlite
      .prepare("SELECT COUNT(*) as count FROM typed_memories WHERE id = 'tm-01'")
      .get() as { count: number };
    expect(row.count).toBe(1);
  });

  it('persists with null sourceId succeeds', () => {
    const convId = createConversation();
    const entry: TypedMemoryEntry = {
      id: 'tm-no-source',
      conversationId: convId,
      type: 'episodic',
      content: 'User opened the app at noon',
      extractedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      // sourceId intentionally omitted
    };

    store.saveTypedMemory(entry);

    const row = sqlite
      .prepare("SELECT source_id FROM typed_memories WHERE id = 'tm-no-source'")
      .get() as { source_id: number | null };
    expect(row).toBeDefined();
    expect(row.source_id).toBeNull();
  });
});

describe('MemoryStore.getTypedMemories', () => {
  it('returns rows for the given conversation and type', () => {
    const convId = createConversation();
    const iso = new Date().toISOString();

    store.saveTypedMemory({ id: 'tm-s1', conversationId: convId, type: 'semantic', content: 'fact 1', extractedAt: iso, createdAt: iso });
    store.saveTypedMemory({ id: 'tm-s2', conversationId: convId, type: 'semantic', content: 'fact 2', extractedAt: iso, createdAt: iso });
    store.saveTypedMemory({ id: 'tm-e1', conversationId: convId, type: 'episodic', content: 'event 1', extractedAt: iso, createdAt: iso });

    const results = store.getTypedMemories(convId, 'semantic');
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.type).toBe('semantic');
    }
  });

  it('returns empty array when no rows match', () => {
    const convId = createConversation();
    const results = store.getTypedMemories(convId, 'procedural');
    expect(results).toEqual([]);
  });
});

describe('MemoryStore.getAllTypedMemories', () => {
  it('returns all rows across conversations', () => {
    const convId1 = createConversation();
    const convId2 = createConversation();
    const iso = new Date().toISOString();

    store.saveTypedMemory({ id: 'tm-c1', conversationId: convId1, type: 'semantic', content: 'conv1 memory', extractedAt: iso, createdAt: iso });
    store.saveTypedMemory({ id: 'tm-c2', conversationId: convId2, type: 'episodic', content: 'conv2 memory', extractedAt: iso, createdAt: iso });

    const all = store.getAllTypedMemories();
    expect(all).toHaveLength(2);
  });

  it('returns empty array when no typed memories exist', () => {
    const all = store.getAllTypedMemories();
    expect(all).toEqual([]);
  });
});
