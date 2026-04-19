/**
 * Tests for typed_memories table structure and CHECK constraint (Phase 35-P01).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import { createStoreForTests } from '../../src/memory/store.js';

let tmpDir: string;
let dbPath: string;
let sqlite: Database.Database;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'jarvis-schema-typed-'));
  dbPath = path.join(tmpDir, 'test.sqlite');
  const store = createStoreForTests(dbPath);
  sqlite = store.sqlite;
});

afterEach(() => {
  try {
    sqlite.close();
  } catch {}
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('typed_memories table structure', () => {
  it('typed_memories table exists after migration', () => {
    const cols = sqlite.prepare("PRAGMA table_info('typed_memories')").all() as Array<{
      name: string;
      type: string;
    }>;
    const names = cols.map((c) => c.name);
    expect(names.length).toBeGreaterThanOrEqual(8);
    expect(names).toContain('id');
    expect(names).toContain('conversation_id');
    expect(names).toContain('type');
    expect(names).toContain('content');
    expect(names).toContain('confidence');
    expect(names).toContain('extracted_at');
    expect(names).toContain('source_id');
    expect(names).toContain('created_at');
  });

  it('type column rejects invalid enum value', () => {
    // First insert a conversation to satisfy the FK
    sqlite.exec(
      `INSERT INTO conversations (started_at) VALUES ('${new Date().toISOString()}')`,
    );
    const convRow = sqlite.prepare('SELECT id FROM conversations LIMIT 1').get() as {
      id: number;
    };

    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO typed_memories (id, conversation_id, type, content, extracted_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'test-invalid',
          convRow.id,
          'invalid',
          'test content',
          new Date().toISOString(),
          new Date().toISOString(),
        ),
    ).toThrow();
  });

  it('type column accepts semantic, episodic, procedural', () => {
    sqlite.exec(
      `INSERT INTO conversations (started_at) VALUES ('${new Date().toISOString()}')`,
    );
    const convRow = sqlite.prepare('SELECT id FROM conversations LIMIT 1').get() as {
      id: number;
    };

    const validTypes = ['semantic', 'episodic', 'procedural'] as const;
    for (const type of validTypes) {
      expect(() =>
        sqlite
          .prepare(
            `INSERT INTO typed_memories (id, conversation_id, type, content, extracted_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            `test-${type}`,
            convRow.id,
            type,
            `content for ${type}`,
            new Date().toISOString(),
            new Date().toISOString(),
          ),
      ).not.toThrow();
    }
  });

  it('source_id is nullable', () => {
    sqlite.exec(
      `INSERT INTO conversations (started_at) VALUES ('${new Date().toISOString()}')`,
    );
    const convRow = sqlite.prepare('SELECT id FROM conversations LIMIT 1').get() as {
      id: number;
    };

    // Insert without source_id — should succeed
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO typed_memories (id, conversation_id, type, content, extracted_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'test-no-source',
          convRow.id,
          'semantic',
          'memory without source',
          new Date().toISOString(),
          new Date().toISOString(),
        ),
    ).not.toThrow();

    const row = sqlite
      .prepare('SELECT source_id FROM typed_memories WHERE id = ?')
      .get('test-no-source') as { source_id: number | null };
    expect(row.source_id).toBeNull();
  });

  it('confidence is nullable', () => {
    sqlite.exec(
      `INSERT INTO conversations (started_at) VALUES ('${new Date().toISOString()}')`,
    );
    const convRow = sqlite.prepare('SELECT id FROM conversations LIMIT 1').get() as {
      id: number;
    };

    // Insert without confidence — should succeed
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO typed_memories (id, conversation_id, type, content, extracted_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'test-no-confidence',
          convRow.id,
          'episodic',
          'memory without confidence',
          new Date().toISOString(),
          new Date().toISOString(),
        ),
    ).not.toThrow();

    const row = sqlite
      .prepare('SELECT confidence FROM typed_memories WHERE id = ?')
      .get('test-no-confidence') as { confidence: number | null };
    expect(row.confidence).toBeNull();
  });
});
