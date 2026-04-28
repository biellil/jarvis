/**
 * Integration tests for MemoryVectors against a temporary Chroma server.
 *
 * Strategy: spawn `chroma run --path <tmpdir> --port <free-port>` once per file,
 * wait until the HTTP endpoint is reachable, run tests, then kill it. If the
 * chroma CLI is not installed or fails to start, tests are skipped with a warning.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MemoryVectors } from './vectors.js';

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
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

let serverProc: ChildProcess | null = null;
let tmpDir: string | null = null;
let port = 0;
let serverAvailable = false;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chroma-test-'));
  try {
    port = await getFreePort();
  } catch {
    console.warn('[vectors.test] could not allocate free port; skipping');
    return;
  }
  try {
    serverProc = spawn('chroma', ['run', '--path', tmpDir, '--port', String(port), '--host', 'localhost'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });
    serverProc.on('error', (err) => {
      console.warn('[vectors.test] chroma server spawn error:', err.message);
    });
  } catch (err) {
    console.warn('[vectors.test] chroma CLI not available; skipping:', err);
    return;
  }
  serverAvailable = await waitForServer('localhost', port, 60_000);
  if (!serverAvailable) {
    console.warn('[vectors.test] chroma server did not become ready in time; skipping');
  }
}, 90_000);

afterAll(async () => {
  if (serverProc !== null && serverProc.pid !== undefined) {
    try {
      serverProc.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    // give it a moment to exit
    await new Promise((r) => setTimeout(r, 500));
    try {
      serverProc.kill('SIGKILL');
    } catch {
      /* ignore */
    }
  }
  if (tmpDir !== null) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe('MemoryVectors', () => {
  it('returns [] on empty collection', async () => {
    if (!serverAvailable) {
      console.warn('[skip] chroma server not available');
      return;
    }
    const v = new MemoryVectors({ port });
    const r = await v.queryMemories('anything', 5);
    expect(r).toEqual([]);
  }, 180_000);

  it('addMemory + queryMemories with same text returns top match with similarity > 0.99', async () => {
    if (!serverAvailable) return;
    const v = new MemoryVectors({ port });
    const text = 'O usuário prefere respostas curtas e objetivas.';
    await v.addMemory('mem-identity-1', text);
    const r = await v.queryMemories(text, 5);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0]!.id).toBe('mem-identity-1');
    expect(r[0]!.similarity).toBeGreaterThan(0.99);
  }, 180_000);

  it('returns the most relevant doc among several unrelated docs', async () => {
    if (!serverAvailable) return;
    const v = new MemoryVectors({ port });
    await v.addMemory('d1', 'The black cat slept on the couch all afternoon.');
    await v.addMemory('d2', 'The chocolate cake recipe calls for three eggs.');
    await v.addMemory('d3', 'The president signed a new economic decree today.');
    const r = await v.queryMemories('pet cats and kittens', 3);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0]!.id).toBe('d1');
  }, 180_000);

  it('threshold filter removes low-similarity matches', async () => {
    if (!serverAvailable) return;
    const v = new MemoryVectors({ port });
    await v.addMemory('t1', 'Manual de operação de tratores agrícolas modelo X.');
    const r = await v.queryMemories('completamente irrelevante astrofísica quântica', 5, 0.99);
    expect(r).toEqual([]);
  }, 180_000);

  it('addMemory with invalid server logs and does not throw', async () => {
    // Separate instance pointing at an unreachable port.
    const v = new MemoryVectors({ port: 1 });
    await expect(v.addMemory('x', 'hello')).resolves.toBe(false);
    const r = await v.queryMemories('hello', 5);
    expect(r).toEqual([]);
  }, 30_000);
});
