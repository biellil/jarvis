/**
 * ActionLogger tests (Phase 54 — LACT-08)
 *
 * Uses createStoreForTests(':memory:') for isolated SQLite per test suite.
 * Mirrors ToolLogger test patterns from store.test.ts.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { createStoreForTests } from '../store.js';
import { ActionLogger } from '../store.js';

let db: ReturnType<typeof createStoreForTests>['db'];
let sqlite: Database.Database;

beforeAll(() => {
  const result = createStoreForTests(':memory:');
  db = result.db;
  sqlite = result.sqlite;
});

afterAll(() => {
  sqlite.close();
});

describe('ActionLogger', () => {
  it('log() inserts a row with correct values', () => {
    const logger = new ActionLogger(db);
    logger.log('approved', '/home/user/Downloads', 'openFolder', 'lmstudio/x', 'client-uuid', 'req-uuid');

    const row = sqlite
      .prepare("SELECT * FROM actions_log WHERE result = 'approved' ORDER BY id DESC LIMIT 1")
      .get() as any;

    expect(row).not.toBeNull();
    expect(row.result).toBe('approved');
    expect(row.path).toBe('/home/user/Downloads');
    expect(row.action).toBe('openFolder');
    expect(row.model).toBe('lmstudio/x');
    expect(row.client_id).toBe('client-uuid');
    expect(row.request_id).toBe('req-uuid');
    expect(row.timestamp).toBeTruthy();
    expect(row.id).toBeGreaterThan(0);
  });

  it('log() does not throw when the db insert fails', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Pass an invalid db that throws on insert
    const brokenDb = {
      insert: () => {
        throw new Error('DB exploded');
      },
    } as any;
    const logger = new ActionLogger(brokenDb);

    expect(() => {
      logger.log('denied', '/some/path', 'openFile');
    }).not.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ActionLogger.log failed'));
    warnSpy.mockRestore();
  });

  it('all 3 result types insert correctly', () => {
    const logger = new ActionLogger(db);
    logger.log('approved', '/path/a', 'openFolder');
    logger.log('denied', '/path/b', 'openFile');
    logger.log('timeout', '/path/c', 'viewContent');

    const rows = sqlite
      .prepare("SELECT result FROM actions_log WHERE path IN ('/path/a', '/path/b', '/path/c') ORDER BY id")
      .all() as any[];

    const results = rows.map((r: any) => r.result);
    expect(results).toContain('approved');
    expect(results).toContain('denied');
    expect(results).toContain('timeout');
  });

  it('model, clientId, requestId are nullable — logs without them inserts NULLs', () => {
    const logger = new ActionLogger(db);
    logger.log('denied', '/nullable/path', 'closeFile');

    const row = sqlite
      .prepare("SELECT * FROM actions_log WHERE path = '/nullable/path' ORDER BY id DESC LIMIT 1")
      .get() as any;

    expect(row).not.toBeNull();
    expect(row.model).toBeNull();
    expect(row.client_id).toBeNull();
    expect(row.request_id).toBeNull();
  });
});
