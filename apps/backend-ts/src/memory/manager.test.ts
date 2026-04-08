/**
 * Integration tests for MemoryManager. Spawns an ephemeral Chroma server
 * (same pattern as vectors.test.ts) and uses a tmp SQLite file.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AIMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

import { MemoryManager } from './manager.js';

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const addr = srv.address();
      if (addr === null || typeof addr === 'string') {
        srv.close();
        reject(new Error('could not get free port'));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForServer(host: string, port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://${host}:${port}/api/v2/heartbeat`);
      if (res.ok) return true;
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function fakeLlm(responder: (input: unknown) => unknown): BaseChatModel {
  return {
    invoke: async (messages: unknown) => {
      const content = responder(messages);
      if (content instanceof Error) throw content;
      return new AIMessage({ content: content as string });
    },
  } as unknown as BaseChatModel;
}

let serverProc: ChildProcess | null = null;
let tmpChromaDir: string | null = null;
let tmpDbDir: string | null = null;
let port = 0;
let serverAvailable = false;

beforeAll(async () => {
  tmpChromaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chroma-mgr-test-'));
  tmpDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-mgr-test-'));
  try {
    port = await getFreePort();
  } catch {
    console.warn('[manager.test] could not allocate free port; skipping');
    return;
  }
  try {
    serverProc = spawn(
      'chroma',
      ['run', '--path', tmpChromaDir, '--port', String(port), '--host', 'localhost'],
      { stdio: ['ignore', 'pipe', 'pipe'], detached: false },
    );
    serverProc.on('error', (err) => {
      console.warn('[manager.test] chroma spawn error:', err.message);
    });
  } catch (err) {
    console.warn('[manager.test] chroma CLI not available; skipping:', err);
    return;
  }
  serverAvailable = await waitForServer('localhost', port, 60_000);
  if (!serverAvailable) {
    console.warn('[manager.test] chroma server not ready in time; skipping');
  }
}, 90_000);

afterAll(async () => {
  if (serverProc !== null && serverProc.pid !== undefined) {
    try {
      serverProc.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 500));
    try {
      serverProc.kill('SIGKILL');
    } catch {
      /* ignore */
    }
  }
  for (const dir of [tmpChromaDir, tmpDbDir]) {
    if (dir !== null) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
});

function mkManager(suffix: string): MemoryManager {
  const dbPath = path.join(tmpDbDir!, `${suffix}.db`);
  return new MemoryManager({
    dbPath,
    vectorsOptions: { port },
    recallTopK: 5,
    recallThreshold: 0.3,
  });
}

describe('MemoryManager', () => {
  it('constructs and starts a conversation', async () => {
    if (!serverAvailable) return;
    const m = mkManager('construct');
    const id = await m.startConversation();
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
    m.close();
  }, 60_000);

  it('saveTurn persists messages and indexes them in vectors', async () => {
    if (!serverAvailable) return;
    const m = mkManager('saveturn');
    const id = (await m.startConversation())!;
    await m.saveTurn(id, 'eu amo pizza margherita', 'legal saber disso');

    // Query vectors — the turn should be recoverable semantically
    const ctx = await m.buildContext('do i like pizza?');
    expect(ctx).toContain('### Recall from past conversations');
    expect(ctx.toLowerCase()).toContain('pizza');
    m.close();
  }, 180_000);

  it('buildContext returns profile section after upsert', async () => {
    if (!serverAvailable) return;
    const m = mkManager('profile');
    // Directly upsert via the internal store
    (m as unknown as { store: { upsertProfile: (k: string, v: string, s: string) => void } }).store.upsertProfile(
      'nome',
      'Alice',
      'explicit',
    );
    const ctx = await m.buildContext('qual seu nome?');
    expect(ctx).toContain('### User profile');
    expect(ctx).toContain('- nome: Alice');
    m.close();
  }, 60_000);

  it('buildContext returns empty string when nothing is known', async () => {
    if (!serverAvailable) return;
    const m = mkManager('empty');
    const ctx = await m.buildContext('randomness');
    expect(ctx).toBe('');
    m.close();
  }, 60_000);

  it('learnFromTurn saves facts with explicit source when triggered', async () => {
    if (!serverAvailable) return;
    const m = mkManager('learn-explicit');
    const llm = fakeLlm(() => '{"hobby": "xadrez"}');
    await m.learnFromTurn(llm, 'lembra que eu jogo xadrez');
    const facts = m.getProfileFacts();
    const hobby = facts.find((f) => f.key === 'hobby');
    expect(hobby).toBeDefined();
    expect(hobby!.value).toBe('xadrez');
    expect(hobby!.source).toBe('explicit');
    m.close();
  }, 60_000);

  it('learnFromTurn saves facts with implicit source for regular messages', async () => {
    if (!serverAvailable) return;
    const m = mkManager('learn-implicit');
    const llm = fakeLlm(() => '{"linguagem_trabalho": "TypeScript"}');
    await m.learnFromTurn(llm, 'hoje passei o dia todo codando em TypeScript');
    const facts = m.getProfileFacts();
    const lang = facts.find((f) => f.key === 'linguagem_trabalho');
    expect(lang).toBeDefined();
    expect(lang!.source).toBe('implicit');
    m.close();
  }, 60_000);

  it('learnFromTurn swallows LLM errors', async () => {
    if (!serverAvailable) return;
    const m = mkManager('learn-err');
    const llm = fakeLlm(() => new Error('boom'));
    await expect(m.learnFromTurn(llm, 'whatever')).resolves.toBeUndefined();
    m.close();
  }, 60_000);

  it('endConversation does not throw', async () => {
    if (!serverAvailable) return;
    const m = mkManager('end');
    const id = (await m.startConversation())!;
    await expect(m.endConversation(id)).resolves.toBeUndefined();
    m.close();
  }, 60_000);
});
