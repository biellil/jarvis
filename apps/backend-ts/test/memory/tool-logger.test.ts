/**
 * Tests for ToolLogger.logDispatch() and updateOutcome() (Phase 18-02).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import { ToolLogger, createStoreForTests } from '../../src/memory/store.js';

let tmpDir: string;
let dbPath: string;
let logger: ToolLogger;
let sqlite: Database.Database;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'jarvis-tool-logger-'));
  dbPath = path.join(tmpDir, 'test.sqlite');
  // Provisiona o schema via createStoreForTests, depois abre um logger
  // apontando pro mesmo arquivo.
  const store = createStoreForTests(dbPath);
  sqlite = store.sqlite;
  logger = new ToolLogger(dbPath);
});

afterEach(() => {
  try {
    logger.close();
  } catch {}
  try {
    sqlite.close();
  } catch {}
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('schema migration 0001', () => {
  it('tool_calls has output column after migration', () => {
    const cols = sqlite.prepare("PRAGMA table_info('tool_calls')").all() as Array<{
      name: string;
      type: string;
    }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain('output');
    const output = cols.find((c) => c.name === 'output')!;
    expect(output.type.toLowerCase()).toBe('text');
  });
});

describe('ToolLogger.logDispatch', () => {
  it('returns a numeric id and inserts a row with outcome=dispatched', () => {
    const id = logger.logDispatch('open_app', { app: 'firefox' });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);

    const row = sqlite
      .prepare('SELECT tool_name, params_json, outcome, output, error FROM tool_calls WHERE id = ?')
      .get(id) as any;
    expect(row.tool_name).toBe('open_app');
    expect(JSON.parse(row.params_json)).toEqual({ app: 'firefox' });
    expect(row.outcome).toBe('dispatched');
    expect(row.output).toBeNull();
    expect(row.error).toBeNull();
  });

  it('returns null and does not throw when DB is closed', () => {
    logger.close();
    const id = logger.logDispatch('open_app', { app: 'firefox' });
    expect(id).toBeNull();
  });
});

describe('ToolLogger.updateOutcome', () => {
  it('updates an existing row to success', () => {
    const id = logger.logDispatch('open_app', { app: 'firefox' })!;
    const ok = logger.updateOutcome(id, 'success', 'Opened firefox', null);
    expect(ok).toBe(true);

    const row = sqlite
      .prepare('SELECT outcome, output, error FROM tool_calls WHERE id = ?')
      .get(id) as any;
    expect(row.outcome).toBe('success');
    expect(row.output).toBe('Opened firefox');
    expect(row.error).toBeNull();
  });

  it('updates an existing row to error', () => {
    const id = logger.logDispatch('delete_file', { file_path: '/etc/passwd' })!;
    const ok = logger.updateOutcome(id, 'error', null, 'permission denied');
    expect(ok).toBe(true);

    const row = sqlite
      .prepare('SELECT outcome, output, error FROM tool_calls WHERE id = ?')
      .get(id) as any;
    expect(row.outcome).toBe('error');
    expect(row.output).toBeNull();
    expect(row.error).toBe('permission denied');
  });

  it('returns false for unknown id without throwing', () => {
    expect(logger.updateOutcome(99999, 'success', 'x', null)).toBe(false);
  });

  it('returns false and does not throw when DB is closed', () => {
    const id = logger.logDispatch('list_processes', {})!;
    logger.close();
    expect(logger.updateOutcome(id, 'success', 'ok', null)).toBe(false);
  });
});
