import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore } from '../store.js';
import Database from 'better-sqlite3';

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'jarvis-fts5-'));
  dbPath = join(tmpDir, 'test.sqlite');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('FTS5 virtual table setup', () => {
  it('Test 1: typed_memories_fts table exists after MemoryStore construction', () => {
    const store = new MemoryStore(dbPath);
    const raw = new Database(dbPath);
    const row = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='typed_memories_fts'")
      .get() as { name: string } | undefined;
    raw.close();
    store.close();
    expect(row).toBeDefined();
    expect(row!.name).toBe('typed_memories_fts');
  });

  it('Test 2: INSERT into typed_memories is mirrored in FTS5', () => {
    const store = new MemoryStore(dbPath);
    const convId = store.startConversation()!;
    const now = new Date().toISOString();
    store.saveTypedMemory({
      id: 'm1',
      conversationId: convId,
      type: 'semantic',
      content: 'hello world',
      confidence: 1,
      extractedAt: now,
      createdAt: now,
    });

    const raw = new Database(dbPath);
    const row = raw
      .prepare("SELECT id FROM typed_memories_fts WHERE typed_memories_fts MATCH 'hello'")
      .get() as { id: string } | undefined;
    raw.close();
    store.close();

    expect(row).toBeDefined();
    expect(row!.id).toBe('m1');
  });

  it('Test 3: UPDATE via re-insert updates FTS5 content (old terms removed)', () => {
    const store = new MemoryStore(dbPath);
    const convId = store.startConversation()!;
    const now = new Date().toISOString();
    // Insert initial
    store.saveTypedMemory({
      id: 'm1',
      conversationId: convId,
      type: 'semantic',
      content: 'hello world',
      confidence: 1,
      extractedAt: now,
      createdAt: now,
    });

    // Update via raw SQL (simulate UPDATE path)
    const raw = new Database(dbPath);
    raw.prepare("UPDATE typed_memories SET content = 'updated text' WHERE id = 'm1'").run();

    const matchUpdated = raw
      .prepare("SELECT id FROM typed_memories_fts WHERE typed_memories_fts MATCH 'updated'")
      .get() as { id: string } | undefined;
    const matchOld = raw
      .prepare("SELECT id FROM typed_memories_fts WHERE typed_memories_fts MATCH 'hello'")
      .get() as { id: string } | undefined;
    raw.close();
    store.close();

    expect(matchUpdated).toBeDefined();
    expect(matchUpdated!.id).toBe('m1');
    expect(matchOld).toBeUndefined();
  });

  it('Test 4: DELETE from typed_memories removes row from FTS5', () => {
    const store = new MemoryStore(dbPath);
    const convId = store.startConversation()!;
    const now = new Date().toISOString();
    store.saveTypedMemory({
      id: 'm1',
      conversationId: convId,
      type: 'semantic',
      content: 'hello world',
      confidence: 1,
      extractedAt: now,
      createdAt: now,
    });

    const raw = new Database(dbPath);
    raw.prepare("DELETE FROM typed_memories WHERE id = 'm1'").run();

    const row = raw
      .prepare("SELECT id FROM typed_memories_fts WHERE typed_memories_fts MATCH 'hello'")
      .get() as { id: string } | undefined;
    raw.close();
    store.close();

    expect(row).toBeUndefined();
  });

  it('Test 5: Pre-existing rows are backfilled into FTS5 on construction', () => {
    // Insert a raw row BEFORE constructing MemoryStore (no FTS5 yet)
    const rawSetup = new Database(dbPath);
    // Need to run migrations first to create the typed_memories table
    // We'll use a MemoryStore just for setup, then close it before inserting raw
    rawSetup.close();

    // Use createStoreForTests-like approach: create store just to run migrations
    const tempStore = new MemoryStore(dbPath);
    const convId = tempStore.startConversation()!;
    tempStore.close();

    // Now insert directly via raw SQLite (bypassing FTS5 triggers which don't exist yet)
    const rawInsert = new Database(dbPath);
    const now = new Date().toISOString();
    rawInsert
      .prepare(
        "INSERT INTO typed_memories (id, conversation_id, type, content, confidence, extracted_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run('pre-existing-id', convId, 'semantic', 'backfill test content', 1, now, now);
    rawInsert.close();

    // Drop the FTS5 table to simulate a fresh start (no FTS5 yet)
    // Then reconstruct MemoryStore — it should backfill existing rows
    const rawDrop = new Database(dbPath);
    rawDrop.exec(`
      DROP TABLE IF EXISTS typed_memories_fts;
      DROP TRIGGER IF EXISTS typed_memories_fts_ai;
      DROP TRIGGER IF EXISTS typed_memories_fts_au;
      DROP TRIGGER IF EXISTS typed_memories_fts_ad;
    `);
    rawDrop.close();

    // Re-construct MemoryStore — should create FTS5 and backfill
    const store2 = new MemoryStore(dbPath);

    const rawCheck = new Database(dbPath);
    const row = rawCheck
      .prepare("SELECT id FROM typed_memories_fts WHERE typed_memories_fts MATCH 'backfill'")
      .get() as { id: string } | undefined;
    rawCheck.close();
    store2.close();

    expect(row).toBeDefined();
    expect(row!.id).toBe('pre-existing-id');
  });
});
