import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore, ToolLogger } from './store.js';
import Database from 'better-sqlite3';

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'jarvis-memstore-'));
  dbPath = join(tmpDir, 'test.sqlite');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('MemoryStore', () => {
  it('startConversation returns a numeric id > 0', () => {
    const store = new MemoryStore(dbPath);
    const id = store.startConversation();
    expect(id).toBeTypeOf('number');
    expect(id!).toBeGreaterThan(0);
    store.close();
  });

  it('endConversation sets ended_at', () => {
    const store = new MemoryStore(dbPath);
    const id = store.startConversation()!;
    store.endConversation(id);
    store.close();

    const raw = new Database(dbPath);
    const row = raw.prepare('SELECT ended_at FROM conversations WHERE id = ?').get(id) as any;
    expect(row.ended_at).toBeTruthy();
    raw.close();
  });

  it('saveMessages persists messages correctly', () => {
    const store = new MemoryStore(dbPath);
    const id = store.startConversation()!;
    const now = new Date().toISOString();
    store.saveMessages(id, [
      { role: 'user', content: 'hello', createdAt: now },
      { role: 'assistant', content: 'hi', createdAt: now },
    ]);
    store.close();

    const raw = new Database(dbPath);
    const rows = raw.prepare('SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id').all(id) as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0].role).toBe('user');
    expect(rows[0].content).toBe('hello');
    expect(rows[1].role).toBe('assistant');
    raw.close();
  });

  it('saveSummary persists a summary row', () => {
    const store = new MemoryStore(dbPath);
    const id = store.startConversation()!;
    store.saveSummary(id, 'summary text');
    store.close();

    const raw = new Database(dbPath);
    const row = raw.prepare('SELECT content FROM summaries WHERE conversation_id = ?').get(id) as any;
    expect(row.content).toBe('summary text');
    raw.close();
  });

  it('upsertProfile inserts then updates same key in place', () => {
    const store = new MemoryStore(dbPath);
    store.upsertProfile('name', 'Alice', 'explicit');
    store.upsertProfile('name', 'Bob', 'implicit');
    const facts = store.getProfileFacts();
    expect(facts).toHaveLength(1);
    expect(facts[0].key).toBe('name');
    expect(facts[0].value).toBe('Bob');
    expect(facts[0].source).toBe('implicit');
    store.close();
  });

  it('getProfileFacts returns rows ordered by insertion', () => {
    const store = new MemoryStore(dbPath);
    store.upsertProfile('a', '1', 'explicit');
    store.upsertProfile('b', '2', 'explicit');
    store.upsertProfile('c', '3', 'explicit');
    const facts = store.getProfileFacts();
    expect(facts.map((f) => f.key)).toEqual(['a', 'b', 'c']);
    store.close();
  });

  it('data persists across MemoryStore reopen', () => {
    const s1 = new MemoryStore(dbPath);
    const id = s1.startConversation()!;
    s1.saveMessages(id, [{ role: 'user', content: 'persist me', createdAt: new Date().toISOString() }]);
    s1.upsertProfile('lang', 'pt-BR', 'explicit');
    s1.close();

    const s2 = new MemoryStore(dbPath);
    const facts = s2.getProfileFacts();
    expect(facts).toHaveLength(1);
    expect(facts[0].value).toBe('pt-BR');

    const raw = new Database(dbPath);
    const msgs = raw.prepare('SELECT content FROM messages WHERE conversation_id = ?').all(id) as any[];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe('persist me');
    raw.close();
    s2.close();
  });

  it('saveMessages with invalid convId does not throw', () => {
    const store = new MemoryStore(dbPath);
    expect(() =>
      store.saveMessages(999999, [{ role: 'user', content: 'x', createdAt: new Date().toISOString() }]),
    ).not.toThrow();
    store.close();
  });

  it('endConversation with invalid id does not throw', () => {
    const store = new MemoryStore(dbPath);
    expect(() => store.endConversation(999999)).not.toThrow();
    store.close();
  });

  describe('rolling summarization helpers', () => {
    it('countMessages conta apenas roles user e assistant', () => {
      const store = new MemoryStore(dbPath);
      const id = store.startConversation()!;
      const now = new Date().toISOString();
      store.saveMessages(id, [
        { role: 'user', content: 'a', createdAt: now },
        { role: 'assistant', content: 'b', createdAt: now },
        { role: 'user', content: 'c', createdAt: now },
        { role: 'assistant', content: 'd', createdAt: now },
      ]);
      const count = (store as any).countMessages(id);
      expect(count).toBe(4);
      store.close();
    });

    it('getOldestMessages retorna as N mais antigas por id ASC', () => {
      const store = new MemoryStore(dbPath);
      const id = store.startConversation()!;
      const now = new Date().toISOString();
      store.saveMessages(id, [
        { role: 'user', content: 'msg1', createdAt: now },
        { role: 'assistant', content: 'msg2', createdAt: now },
        { role: 'user', content: 'msg3', createdAt: now },
        { role: 'assistant', content: 'msg4', createdAt: now },
        { role: 'user', content: 'msg5', createdAt: now },
      ]);
      const oldest = (store as any).getOldestMessages(id, 3);
      expect(oldest).toHaveLength(3);
      expect(oldest[0].content).toBe('msg1');
      expect(oldest[2].content).toBe('msg3');
      store.close();
    });

    it('deleteMessages remove as rows especificadas', () => {
      const store = new MemoryStore(dbPath);
      const id = store.startConversation()!;
      const now = new Date().toISOString();
      store.saveMessages(id, [
        { role: 'user', content: 'keep-me', createdAt: now },
        { role: 'assistant', content: 'delete-me', createdAt: now },
        { role: 'user', content: 'also-delete', createdAt: now },
      ]);
      const all = (store as any).getOldestMessages(id, 10);
      const toDelete = all.slice(1).map((m: any) => m.id);
      (store as any).deleteMessages(toDelete);
      store.close();

      const raw = new Database(dbPath);
      const rows = raw.prepare('SELECT content FROM messages WHERE conversation_id = ?').all(id) as any[];
      expect(rows).toHaveLength(1);
      expect(rows[0].content).toBe('keep-me');
      raw.close();
    });

    it('getLatestSummary retorna content do summary mais recente', () => {
      const store = new MemoryStore(dbPath);
      const id = store.startConversation()!;
      store.saveSummary(id, 'primeiro');
      store.saveSummary(id, 'segundo');
      const latest = (store as any).getLatestSummary(id);
      expect(latest).toBe('segundo');
      store.close();
    });

    it('getLatestSummary retorna null quando não há summaries', () => {
      const store = new MemoryStore(dbPath);
      const id = store.startConversation()!;
      const result = (store as any).getLatestSummary(id);
      expect(result).toBeNull();
      store.close();
    });

    it('deleteMessages com array vazio não lança exceção', () => {
      const store = new MemoryStore(dbPath);
      expect(() => (store as any).deleteMessages([])).not.toThrow();
      store.close();
    });

    it('countMessages retorna 0 para convId inválido sem throw', () => {
      const store = new MemoryStore(dbPath);
      expect(() => (store as any).countMessages(999999)).not.toThrow();
      expect((store as any).countMessages(999999)).toBe(0);
      store.close();
    });
  });
});

describe('ToolLogger', () => {
  it('log inserts a row with serialized params_json', () => {
    const logger = new ToolLogger(dbPath);
    logger.log('openApp', { name: 'firefox' }, 'success');
    logger.close();

    const raw = new Database(dbPath);
    const row = raw.prepare('SELECT tool_name, params_json, outcome FROM tool_calls').get() as any;
    expect(row.tool_name).toBe('openApp');
    expect(row.outcome).toBe('success');
    const parsed = typeof row.params_json === 'string' ? JSON.parse(row.params_json) : row.params_json;
    expect(parsed).toEqual({ name: 'firefox' });
    raw.close();
  });

  it('log with error outcome persists error string', () => {
    const logger = new ToolLogger(dbPath);
    logger.log('badTool', { x: 1 }, 'error', 'boom');
    logger.close();

    const raw = new Database(dbPath);
    const row = raw.prepare('SELECT outcome, error FROM tool_calls').get() as any;
    expect(row.outcome).toBe('error');
    expect(row.error).toBe('boom');
    raw.close();
  });

  it('log does not throw on invalid outcome', () => {
    const logger = new ToolLogger(dbPath);
    expect(() => logger.log('t', {}, 'bogus' as any)).not.toThrow();
    logger.close();
  });
});
