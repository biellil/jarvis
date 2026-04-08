/**
 * POST /tool-calls/:id/result router tests (Plan 18-05).
 *
 * Cobre:
 *   - 204 com success=true → outcome='success', output preenchido
 *   - 204 com success=false error='user_denied' → outcome='cancelled'
 *   - 204 com success=false error='EACCES' → outcome='error'
 *   - 400 body ausente / inválido (ex: success=true + error='foo')
 *   - 400 :id não numérico
 *   - 404 :id inexistente
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import request from 'supertest';

import { ToolLogger, createStoreForTests } from '../../src/memory/store.js';
import { createApp } from '../../src/app.js';

let tmpDir: string;
let dbPath: string;
let logger: ToolLogger;
let sqlite: Database.Database;
let app: ReturnType<typeof createApp>;
let seededId: number;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), 'jarvis-tool-calls-route-'));
  dbPath = path.join(tmpDir, 'test.sqlite');
  const store = createStoreForTests(dbPath);
  sqlite = store.sqlite;
  logger = new ToolLogger(dbPath);

  const id = logger.logDispatch('open_app', { app: 'firefox' });
  if (!id) throw new Error('seed dispatch failed');
  seededId = id;

  app = createApp({ toolLogger: logger });
});

afterEach(() => {
  try { logger.close(); } catch {}
  try { sqlite.close(); } catch {}
  rmSync(tmpDir, { recursive: true, force: true });
});

function getRow(id: number) {
  return sqlite
    .prepare('SELECT outcome, output, error FROM tool_calls WHERE id = ?')
    .get(id) as { outcome: string; output: string | null; error: string | null } | undefined;
}

describe('POST /tool-calls/:id/result', () => {
  it('success=true → 204 and outcome=success with output persisted', async () => {
    const res = await request(app)
      .post(`/tool-calls/${seededId}/result`)
      .send({ success: true, output: 'Opened firefox' });
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});

    const row = getRow(seededId)!;
    expect(row.outcome).toBe('success');
    expect(row.output).toBe('Opened firefox');
    expect(row.error).toBeNull();
  });

  it('success=true without output → 204 outcome=success output=null', async () => {
    const res = await request(app)
      .post(`/tool-calls/${seededId}/result`)
      .send({ success: true });
    expect(res.status).toBe(204);
    const row = getRow(seededId)!;
    expect(row.outcome).toBe('success');
    expect(row.output).toBeNull();
    expect(row.error).toBeNull();
  });

  it('success=false error=user_denied → 204 outcome=cancelled', async () => {
    const res = await request(app)
      .post(`/tool-calls/${seededId}/result`)
      .send({ success: false, error: 'user_denied' });
    expect(res.status).toBe(204);
    const row = getRow(seededId)!;
    expect(row.outcome).toBe('cancelled');
    expect(row.error).toBe('user_denied');
    expect(row.output).toBeNull();
  });

  it('success=false error=EACCES → 204 outcome=error', async () => {
    const res = await request(app)
      .post(`/tool-calls/${seededId}/result`)
      .send({ success: false, error: 'EACCES: permission denied' });
    expect(res.status).toBe(204);
    const row = getRow(seededId)!;
    expect(row.outcome).toBe('error');
    expect(row.error).toBe('EACCES: permission denied');
  });

  it('empty body → 400', async () => {
    const res = await request(app)
      .post(`/tool-calls/${seededId}/result`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.detail).toBeDefined();
    // row untouched (still dispatched)
    expect(getRow(seededId)!.outcome).toBe('dispatched');
  });

  it('success=true with error=foo → 400 (discriminated union)', async () => {
    const res = await request(app)
      .post(`/tool-calls/${seededId}/result`)
      .send({ success: true, error: 'oops' });
    expect(res.status).toBe(400);
    expect(getRow(seededId)!.outcome).toBe('dispatched');
  });

  it('success=false without error → 400', async () => {
    const res = await request(app)
      .post(`/tool-calls/${seededId}/result`)
      .send({ success: false });
    expect(res.status).toBe(400);
  });

  it(':id not numeric → 400', async () => {
    const res = await request(app)
      .post('/tool-calls/abc/result')
      .send({ success: true });
    expect(res.status).toBe(400);
    expect(res.body.detail).toBe('invalid tool call id');
  });

  it(':id nonexistent → 404', async () => {
    const res = await request(app)
      .post('/tool-calls/99999/result')
      .send({ success: true, output: 'x' });
    expect(res.status).toBe(404);
    expect(res.body.detail).toBe('tool call not found');
  });
});
