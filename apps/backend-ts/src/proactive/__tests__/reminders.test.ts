import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../memory/schema.js';
import { RemindersRepository } from '../repository.js';

let tmpDir: string;
let dbPath: string;
let db: ReturnType<typeof drizzle>;
let sqlite: InstanceType<typeof Database>;
let repo: RemindersRepository;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'jarvis-reminders-'));
  dbPath = join(tmpDir, 'test.sqlite');
  sqlite = new Database(dbPath);
  db = drizzle(sqlite, { schema });
  const migrationsFolder = join(process.cwd(), 'src/memory/migrations');
  migrate(db, { migrationsFolder });
  repo = new RemindersRepository(db);
});

afterEach(() => {
  sqlite.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('RemindersRepository', () => {
  it('create: inserts reminder with delayMs converted to due_at epoch ms', () => {
    const before = Date.now();
    const delayMs = 1_800_000; // 30 min
    const id = repo.create({ when: { delayMs }, message: 'revisar PR' });
    const after = Date.now();

    expect(id).toBeTypeOf('number');
    expect(id).toBeGreaterThan(0);

    const rows = sqlite.prepare('SELECT * FROM reminders WHERE id = ?').all(id) as any[];
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.message).toBe('revisar PR');
    expect(row.kind).toBe('reminder');
    expect(row.status).toBe('pending');
    // due_at deve ser approximately now + delayMs
    expect(row.due_at).toBeGreaterThanOrEqual(before + delayMs);
    expect(row.due_at).toBeLessThanOrEqual(after + delayMs);
  });

  it('create: inserts reminder with atIso converted to due_at epoch ms', () => {
    const atIso = '2026-05-10T09:00:00-03:00';
    const expectedDueAt = new Date(atIso).getTime();
    const id = repo.create({ when: { atIso }, message: 'reunião' });

    const rows = sqlite.prepare('SELECT * FROM reminders WHERE id = ?').all(id) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].due_at).toBe(expectedDueAt);
    expect(rows[0].message).toBe('reunião');
  });

  it('list: returns all pending reminders sorted by due_at', () => {
    const now = Date.now();
    // Insere em ordem invertida de due_at
    repo.create({ when: { delayMs: 7_200_000 }, message: 'segunda' }); // 2h
    repo.create({ when: { delayMs: 1_800_000 }, message: 'primeira' }); // 30min
    repo.create({ when: { delayMs: 86_400_000 }, message: 'terceira' }); // 1d

    const items = repo.list();
    expect(items).toHaveLength(3);
    // Deve vir ordenado por due_at asc
    expect(items[0].message).toBe('primeira');
    expect(items[1].message).toBe('segunda');
    expect(items[2].message).toBe('terceira');
    // Todos devem ser pending
    items.forEach((r) => expect(r.status).toBe('pending'));
  });

  it('cancel: updates status to cancelled', () => {
    const id = repo.create({ when: { delayMs: 1_800_000 }, message: 'cancelar esse' });

    const before = repo.list();
    expect(before).toHaveLength(1);
    expect(before[0].status).toBe('pending');

    repo.cancelById(id);

    const after = repo.list(); // list retorna apenas pending/deferred
    expect(after).toHaveLength(0);

    const raw = sqlite.prepare('SELECT status FROM reminders WHERE id = ?').get(id) as any;
    expect(raw.status).toBe('cancelled');
  });

  it('message max length: rejects messages over 500 chars', () => {
    const longMessage = 'a'.repeat(501);
    expect(() =>
      repo.create({ when: { delayMs: 1_800_000 }, message: longMessage }),
    ).toThrow();
  });

  it('delayMs max: rejects delayMs over 30 days', () => {
    const thirtyOneDays = 31 * 24 * 60 * 60 * 1000;
    expect(() =>
      repo.create({ when: { delayMs: thirtyOneDays }, message: 'muito longe' }),
    ).toThrow();
  });
});
