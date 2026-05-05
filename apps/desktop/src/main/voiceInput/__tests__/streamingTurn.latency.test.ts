/**
 * Phase 53 Plan 01 Task 2 — latency budget test for streamingTurn.
 *
 * Mock SSE emits "Primeira frase. " at +100ms; mock TTS resolves after +200ms.
 * Asserts the first TTS_CHUNK IPC arrives within 1000ms of streamingTurn start
 * (success criteria #1 — STTS-01 mock-equivalent).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({ BrowserWindow: class {} }));
vi.mock('../tts/index.js', () => ({
  getActiveTtsProvider: () => {
    throw new Error('getActiveTtsProvider should not be called in latency test — pass provider via deps');
  },
}));

import { runStreamingTurn, type StreamingTurnDeps } from '../streamingTurn.js';
import { IPC_CHANNELS } from '../../../shared/ipc-types.js';
import type { OpenChatStreamOpts } from '../../sse-client.js';
import type { TTSProvider, TTSResult } from '../tts/provider.js';

function makeProvider(latencyMs: number): TTSProvider {
  return {
    name: 'fake-latency',
    synthesize: (text: string) =>
      new Promise<TTSResult>((resolve) => {
        setTimeout(
          () => resolve({ audio: Buffer.from(`audio:${text}`), format: 'mp3' }),
          latencyMs,
        );
      }),
  };
}

function makeDelayedStream(
  schedule: Array<{ atMs: number; token: string }>,
  endAtMs: number,
): NonNullable<StreamingTurnDeps['openStream']> {
  return async (opts: OpenChatStreamOpts) => {
    await new Promise<void>((resolve) => {
      let pending = schedule.length + 1;
      const settle = () => {
        if (--pending === 0) resolve();
      };
      for (const { atMs, token } of schedule) {
        setTimeout(() => {
          opts.onToken(token);
          settle();
        }, atMs);
      }
      setTimeout(() => {
        opts.onEnd();
        settle();
      }, endAtMs);
    });
  };
}

describe('runStreamingTurn — latency', () => {
  it('first TTS_CHUNK arrives within 1000ms (mock TTS @ 200ms, token @ 100ms)', async () => {
    const sendCalls: Array<{ channel: string; payload: unknown; t: number }> = [];
    const t0 = Date.now();
    const fakeWindow = {
      isDestroyed: () => false,
      webContents: {
        send: (channel: string, payload: unknown) => {
          sendCalls.push({ channel, payload, t: Date.now() - t0 });
        },
      },
    };

    const handle = runStreamingTurn(
      {
        backendUrl: 'http://test',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mainWindow: fakeWindow as any,
        openStream: makeDelayedStream([{ atMs: 100, token: 'Primeira frase. ' }], 150),
        provider: makeProvider(200),
      },
      'q',
    );

    await handle.done;

    const firstChunk = sendCalls.find((c) => c.channel === IPC_CHANNELS.TTS_CHUNK);
    expect(firstChunk).toBeDefined();
    // First IPC must arrive < 1s (success criteria #1).
    expect(firstChunk!.t).toBeLessThan(1000);
    // Sanity: should be ≥ ~300ms (token@100 + synth@200 — both real timers).
    expect(firstChunk!.t).toBeGreaterThanOrEqual(250);
  });
});
