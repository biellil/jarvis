/**
 * Tests that migration 0003_typed_memories runs cleanly on a fresh empty database (Phase 35-P01).
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

describe('migration 0003 on fresh database', () => {
  it('migration 0003 runs cleanly on a fresh empty database', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    expect(() => {
      runMigration(sqlite, loadSql('0000_0000_init.sql'));
      runMigration(sqlite, loadSql('0001_tool_calls_dispatch.sql'));
      runMigration(sqlite, loadSql('0002_voice_calls.sql'));
      runMigration(sqlite, loadSql('0003_typed_memories.sql'));
    }).not.toThrow();

    sqlite.close();
  });

  it('fresh database has typed_memories table with expected columns', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    runMigration(sqlite, loadSql('0000_0000_init.sql'));
    runMigration(sqlite, loadSql('0001_tool_calls_dispatch.sql'));
    runMigration(sqlite, loadSql('0002_voice_calls.sql'));
    runMigration(sqlite, loadSql('0003_typed_memories.sql'));

    const cols = sqlite.prepare("PRAGMA table_info('typed_memories')").all() as Array<{
      name: string;
      type: string;
    }>;
    const names = cols.map((c) => c.name);

    expect(names).toContain('id');
    expect(names).toContain('conversation_id');
    expect(names).toContain('type');
    expect(names).toContain('content');
    expect(names).toContain('confidence');
    expect(names).toContain('extracted_at');
    expect(names).toContain('source_id');
    expect(names).toContain('created_at');

    sqlite.close();
  });
});
