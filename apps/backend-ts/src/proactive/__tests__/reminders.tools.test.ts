import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../memory/schema.js';
import { RemindersRepository } from '../repository.js';
import { createReminderTool, listRemindersTool, cancelReminderTool } from '../tools.js';

let tmpDir: string;
let sqlite: InstanceType<typeof Database>;
let db: ReturnType<typeof drizzle>;
let repo: RemindersRepository;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'jarvis-tools-'));
  const dbPath = join(tmpDir, 'test.sqlite');
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

describe('createReminderTool', () => {
  it('returns pt-BR confirmation string on success', async () => {
    const tool = createReminderTool(repo);
    const result = await tool.invoke({
      when: { delayMs: 1_800_000 },
      message: 'revisar PR',
    });
    expect(result).toMatch(/Lembrete criado pra daqui 30 minutos: revisar PR\./);
  });

  it('rejects invalid delayMs (negative, zero, over 30 days)', async () => {
    const tool = createReminderTool(repo);

    const negResult = await tool.invoke({ when: { delayMs: -1 }, message: 'teste' });
    expect(negResult).toMatch(/Erro/i);

    const zeroResult = await tool.invoke({ when: { delayMs: 0 }, message: 'teste' });
    expect(zeroResult).toMatch(/Erro/i);

    const overResult = await tool.invoke({
      when: { delayMs: 31 * 24 * 60 * 60 * 1000 },
      message: 'teste',
    });
    expect(overResult).toMatch(/Erro/i);
  });

  it('rejects invalid atIso (non-ISO string)', async () => {
    const tool = createReminderTool(repo);
    const result = await tool.invoke({ when: { atIso: 'amanhã às 9h' }, message: 'teste' });
    expect(result).toMatch(/Erro/i);
  });

  it('rejects message over 500 chars', async () => {
    const tool = createReminderTool(repo);
    const result = await tool.invoke({
      when: { delayMs: 1_800_000 },
      message: 'a'.repeat(501),
    });
    expect(result).toMatch(/Erro/i);
  });
});

describe('listRemindersTool', () => {
  it('returns pt-BR formatted list of pending reminders', async () => {
    repo.create({ when: { delayMs: 1_800_000 }, message: 'revisar PR' });
    repo.create({ when: { delayMs: 3_600_000 }, message: 'responder email' });

    const tool = listRemindersTool(repo);
    const result = await tool.invoke({});
    expect(result).toMatch(/1\./);
    expect(result).toMatch(/revisar PR/);
    expect(result).toMatch(/2\./);
    expect(result).toMatch(/responder email/);
  });

  it('returns "Nenhum lembrete pendente" when list is empty', async () => {
    const tool = listRemindersTool(repo);
    const result = await tool.invoke({});
    expect(result).toBe('Nenhum lembrete pendente.');
  });
});

describe('cancelReminderTool', () => {
  it('returns pt-BR confirmation on successful cancel', async () => {
    repo.create({ when: { delayMs: 1_800_000 }, message: 'revisar PR' });

    const tool = cancelReminderTool(repo);
    const result = await tool.invoke({ query: 'PR' });
    expect(result).toMatch(/Cancelado: revisar PR\./);
  });

  it('returns "Não achei lembrete" when query matches nothing', async () => {
    const tool = cancelReminderTool(repo);
    const result = await tool.invoke({ query: 'inexistente' });
    expect(result).toBe('Não achei lembrete com esse texto.');
  });

  it('returns disambiguated list when query matches multiple', async () => {
    repo.create({ when: { delayMs: 1_800_000 }, message: 'revisar PR do backend' });
    repo.create({ when: { delayMs: 3_600_000 }, message: 'revisar PR do frontend' });

    const tool = cancelReminderTool(repo);
    const result = await tool.invoke({ query: 'PR' });
    expect(result).toMatch(/Encontrei mais de um lembrete/);
    expect(result).toMatch(/revisar PR do backend/);
    expect(result).toMatch(/revisar PR do frontend/);
  });
});
