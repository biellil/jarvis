/**
 * Tests that migration 0003_typed_memories runs on a v1.7 database without data loss (Phase 35-P01).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const migrationsDir = path.join(process.cwd(), 'src/memory/migrations');

function loadSql(filename: string): string {
  return readFileSync(path.join(migrationsDir, filename), 'utf8');
}

function runMigration(sqlite: Database.Database, sql: string): void {
  // Drizzle migrations use '--> statement-breakpoint' as separator
  const statements = sql.split('--> statement-breakpoint');
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) {
      sqlite.exec(trimmed);
    }
  }
}

function createV17Database(): Database.Database {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');

  // Run only migrations 0000 + 0001 + 0002 (v1.7 state)
  runMigration(sqlite, loadSql('0000_0000_init.sql'));
  runMigration(sqlite, loadSql('0001_tool_calls_dispatch.sql'));
  runMigration(sqlite, loadSql('0002_voice_calls.sql'));

  // Insert v1.7 seed data
  const now = new Date().toISOString();

  sqlite
    .prepare(
      `INSERT INTO conversations (id, started_at, ended_at) VALUES (?, ?, ?)`,
    )
    .run(1, now, null);
  sqlite
    .prepare(
      `INSERT INTO conversations (id, started_at, ended_at) VALUES (?, ?, ?)`,
    )
    .run(2, now, now);

  sqlite
    .prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(1, 1, 'user', 'Hello JARVIS', now);
  sqlite
    .prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(2, 1, 'assistant', 'Hello! How can I help?', now);
  sqlite
    .prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(3, 2, 'user', 'What time is it?', now);

  return sqlite;
}

describe('migration 0003 on v1.7 database', () => {
  it('migration 0003 runs on v1.7 database without data loss', () => {
    const sqlite = createV17Database();

    // Verify v1.7 state
    const convsBefore = (
      sqlite.prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number }
    ).count;
    const msgsBefore = (
      sqlite.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number }
    ).count;
    expect(convsBefore).toBe(2);
    expect(msgsBefore).toBe(3);

    // Run migration 0003
    expect(() => {
      runMigration(sqlite, loadSql('0003_typed_memories.sql'));
    }).not.toThrow();

    // Verify data still intact
    const convsAfter = (
      sqlite.prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number }
    ).count;
    const msgsAfter = (
      sqlite.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number }
    ).count;
    expect(convsAfter).toBe(2);
    expect(msgsAfter).toBe(3);

    // Verify typed_memories table exists
    const cols = sqlite.prepare("PRAGMA table_info('typed_memories')").all() as Array<{
      name: string;
    }>;
    expect(cols.length).toBeGreaterThan(0);
    expect(cols.map((c) => c.name)).toContain('type');

    sqlite.close();
  });

  it('existing v1.7 data remains intact after upgrade', () => {
    const sqlite = createV17Database();
    runMigration(sqlite, loadSql('0003_typed_memories.sql'));

    const convCount = (
      sqlite.prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number }
    ).count;
    const msgCount = (
      sqlite.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number }
    ).count;

    expect(convCount).toBe(2);
    expect(msgCount).toBe(3);

    sqlite.close();
  });
});
