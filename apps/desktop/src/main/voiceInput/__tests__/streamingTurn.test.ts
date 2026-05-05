/**
 * Phase 53 Plan 01 Task 2 — streamingTurn orchestrator behavioral tests.
 *
 * Mocks `electron` BrowserWindow (we don't import the real one; the orchestrator
 * accepts a `mainWindow` shaped object via deps). All SSE + TTS dependencies
 * are injected via `deps.openStream` / `deps.provider` overrides, keeping the
 * test pure in Node env.
 */
import { describe, it, expect, vi } from 'vitest';

// IMPORTANT: stub `electron` because streamingTurn.ts imports BrowserWindow's
// type. The runtime never touches the import in tests (we pass a fake window).
vi.mock('electron', () => ({ BrowserWindow: class {} }));
// streamingTurn.ts imports `tts/index.ts` which transitively imports the
// electron-store-backed `store.ts`. The store throws at module-load time in
// tests (no projectName). We never use the live provider here — every test
// passes `provider` via deps — so we stub the module and the getter.
vi.mock('../tts/index.js', () => ({
  getActiveTtsProvider: () => {
    throw new Error('getActiveTtsProvider should not be called in tests — pass provider via deps');
  },
}));

import { runStreamingTurn, type StreamingTurnDeps } from '../streamingTurn.js';
import { IPC_CHANNELS } from '../../../shared/ipc-types.js';
import type { OpenChatStreamOpts } from '../../sse-client.js';
import type { TTSProvider, TTSResult } from '../tts/provider.js';

interface FakeWindow {
  isDestroyed: () => boolean;
  webContents: { send: ReturnType<typeof vi.fn> };
}

function makeFakeWindow(): FakeWindow {
  return {
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
  };
}

/**
 * Build a fake openStream that synchronously delivers tokens via setImmediate-like
 * micro-task scheduling so we can await `done` deterministically.
 */
function makeFakeStream(tokens: string[]): NonNullable<StreamingTurnDeps['openStream']> {
  return async (opts: OpenChatStreamOpts) => {
    for (const t of tokens) {
      opts.onToken(t);
    }
    opts.onEnd();
  };
}

function makeProvider(synthesize: (text: string) => Promise<TTSResult>): TTSProvider {
  return { name: 'fake', synthesize };
}

describe('runStreamingTurn — Task 2 behavioral tests', () => {
  it('Test 1 — multi-sentence: emits 3 TTS_CHUNK with monotonic idx then TTS_END', async () => {
    const win = makeFakeWindow();
    const provider = makeProvider(async (text) => ({
      audio: Buffer.from(`audio:${text}`),
      format: 'mp3',
    }));
    const handle = runStreamingTurn(
      {
        backendUrl: 'http://test',
        apiKey: 'k',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mainWindow: win as any,
        openStream: makeFakeStream(['Olá. ', 'Como vai?', ' Bem. ', ' ']),
        provider,
      },
      'user transcription',
    );
    await handle.done;

    const chunkCalls = win.webContents.send.mock.calls.filter(
      ([ch]) => ch === IPC_CHANNELS.TTS_CHUNK,
    );
    expect(chunkCalls).toHaveLength(3);
    const idxValues = chunkCalls.map(([, payload]) => payload.idx);
    expect(idxValues).toEqual([0, 1, 2]);
    // turnId is consistent across all chunks
    const turnIds = new Set(chunkCalls.map(([, p]) => p.turnId));
    expect(turnIds.size).toBe(1);
    expect([...turnIds][0]).toBe(handle.turnId);

    // TTS_END called exactly once at the end
    const endCalls = win.webContents.send.mock.calls.filter(
      ([ch]) => ch === IPC_CHANNELS.TTS_END,
    );
    expect(endCalls).toHaveLength(1);
    expect(endCalls[0]![1]).toEqual({ turnId: handle.turnId });
  });

  it('Test 2 (D-04) — residual flush emits one TTS_CHUNK with idx=0', async () => {
    const win = makeFakeWindow();
    const provider = makeProvider(async (text) => ({
      audio: Buffer.from(text),
      format: 'mp3',
    }));
    const handle = runStreamingTurn(
      {
        backendUrl: 'http://test',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mainWindow: win as any,
        openStream: makeFakeStream(['Resposta sem terminador']),
        provider,
      },
      'q',
    );
    await handle.done;

    const chunkCalls = win.webContents.send.mock.calls.filter(
      ([ch]) => ch === IPC_CHANNELS.TTS_CHUNK,
    );
    expect(chunkCalls).toHaveLength(1);
    expect(chunkCalls[0]![1].idx).toBe(0);
    // Decode to verify it carried the residual sentence
    const decoded = Buffer.from(chunkCalls[0]![1].audioBase64, 'base64').toString();
    expect(decoded).toBe('Resposta sem terminador');
  });

  it('Test 3 (D-12) — abort prevents post-cancellation TTS_CHUNK even if synthesize resolves later', async () => {
    const win = makeFakeWindow();

    // synthesize returns a never-resolving promise we manually resolve later.
    let resolveSynth: ((v: TTSResult) => void) | null = null;
    const synthPromise = new Promise<TTSResult>((res) => {
      resolveSynth = res;
    });
    const provider = makeProvider(() => synthPromise);

    const handle = runStreamingTurn(
      {
        backendUrl: 'http://test',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mainWindow: win as any,
        openStream: makeFakeStream(['Hello world. ']),
        provider,
      },
      'q',
    );

    // Wait a microtask cycle so the onToken loop schedules synthAndSend.
    await Promise.resolve();
    handle.abort();
    // Now resolve the dangling synth promise — must NOT trigger TTS_CHUNK send.
    resolveSynth!({ audio: Buffer.from('late audio'), format: 'mp3' });
    await handle.done;

    const chunkCalls = win.webContents.send.mock.calls.filter(
      ([ch]) => ch === IPC_CHANNELS.TTS_CHUNK,
    );
    expect(chunkCalls).toHaveLength(0);
  });

  it('Test 4 — graceful per-sentence degrade: failed synthesize does not abort the turn', async () => {
    const win = makeFakeWindow();
    let n = 0;
    const provider = makeProvider(async (text) => {
      const which = n++;
      if (which === 1) throw new Error('synth blew up on sentence 2');
      return { audio: Buffer.from(`audio:${text}`), format: 'mp3' };
    });
    const handle = runStreamingTurn(
      {
        backendUrl: 'http://test',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mainWindow: win as any,
        openStream: makeFakeStream(['A. B. C. ']),
        provider,
      },
      'q',
    );
    await handle.done;

    const chunkCalls = win.webContents.send.mock.calls.filter(
      ([ch]) => ch === IPC_CHANNELS.TTS_CHUNK,
    );
    expect(chunkCalls).toHaveLength(2);
    // Surviving idx values are 0 and 2 (idx=1 was the failed sentence)
    const idxValues = chunkCalls.map(([, payload]) => payload.idx).sort();
    expect(idxValues).toEqual([0, 2]);

    const endCalls = win.webContents.send.mock.calls.filter(
      ([ch]) => ch === IPC_CHANNELS.TTS_END,
    );
    expect(endCalls).toHaveLength(1);
  });

  it('does NOT send TTS_END or TTS_CHUNK when window is destroyed', async () => {
    const win = makeFakeWindow();
    win.isDestroyed = () => true;
    const provider = makeProvider(async (text) => ({
      audio: Buffer.from(text),
      format: 'mp3',
    }));
    const handle = runStreamingTurn(
      {
        backendUrl: 'http://test',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mainWindow: win as any,
        openStream: makeFakeStream(['Hi. ']),
        provider,
      },
      'q',
    );
    await handle.done;
    expect(win.webContents.send).not.toHaveBeenCalled();
  });
});
