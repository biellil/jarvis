/**
 * Streaming TTS Player — Phase 53 Plan 02 (STTS-01)
 *
 * Renderer-side gapless audio queue. Decodes incoming MP3/WAV chunks
 * (delivered via IPC `tts:chunk`) and schedules each AudioBufferSourceNode
 * with sample-accurate `start(when=lastEnd)` so subsequent chunks begin
 * immediately after the previous chunk ends — zero perceptible silence
 * (success criteria #2 of STTS-01).
 *
 * Key behaviors:
 * - Single AudioContext via getAudioContext() (singleton mandate from STATE.md
 *   soak-test pitfall — never instantiate AudioContext here).
 * - Out-of-order chunk arrival is handled by buffering pending decodes in a
 *   per-turn Map keyed by idx and draining only when nextIdx is contiguous.
 * - stopTurn(turnId) cancels every active source for that turn (barge-in,
 *   D-12). Subsequent enqueueChunk for the same turnId starts a fresh queue.
 * - Multi-turn isolation: each turn has its own queue + lastEnd cursor.
 * - First-sentence callback fires when the FIRST chunk's source actually
 *   starts playing (D-07: orb 'thinking → speaking' transition).
 *
 * Pitfalls handled:
 * - Pitfall 2 (suspended AudioContext): resume() before scheduling.
 * - Pitfall 3 (gap from start() with no arg): always pass explicit when=lastEnd.
 * - Pitfall 7 (queue leak): onended drains; stopTurn deletes; queues map empties.
 *
 * IPC channels (literal strings — Plan 01 of this phase introduces
 * IPC_CHANNELS.TTS_* constants; once Plan 01 lands we can swap to those).
 */

import { getAudioContext } from './audioContextSingleton';
import type {
  TTSChunkPayload,
  TTSEndPayload,
  TTSStopPayload,
} from '../../../shared/ipc-types';

export type { TTSChunkPayload };

interface TurnQueue {
  pending: Map<number, AudioBuffer>;
  nextIdx: number;
  lastEnd: number;
  activeSources: Set<AudioBufferSourceNode>;
  firstStarted: boolean;
}

const queues = new Map<string, TurnQueue>();
let firstSentenceListener: ((turnId: string) => void) | null = null;
let endListener: ((turnId: string) => void) | null = null;

/** D-07: registered by orb to flip 'thinking → speaking' on first audible sample. */
export function setOnFirstSentenceStart(fn: ((turnId: string) => void) | null): void {
  firstSentenceListener = fn;
}

/** Optional: notified when all chunks of a turn have drained naturally. */
export function setOnTurnEnd(fn: ((turnId: string) => void) | null): void {
  endListener = fn;
}

function getOrCreateQueue(turnId: string): TurnQueue {
  let q = queues.get(turnId);
  if (!q) {
    q = {
      pending: new Map(),
      nextIdx: 0,
      lastEnd: 0,
      activeSources: new Set(),
      firstStarted: false,
    };
    queues.set(turnId, q);
  }
  return q;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Decode the chunk and either schedule it now (if its idx matches the
 * queue's nextIdx) or hold it pending until the gap is filled.
 */
export async function enqueueChunk(payload: TTSChunkPayload): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  const audioBuffer = await ctx.decodeAudioData(
    base64ToArrayBuffer(payload.audioBase64),
  );
  const q = getOrCreateQueue(payload.turnId);
  q.pending.set(payload.idx, audioBuffer);

  // Drain in idx order — handles late arrivals correctly.
  while (q.pending.has(q.nextIdx)) {
    const buf = q.pending.get(q.nextIdx)!;
    q.pending.delete(q.nextIdx);
    const startAt = Math.max(ctx.currentTime, q.lastEnd);
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(ctx.destination);
    const isFirst = !q.firstStarted;
    const turnId = payload.turnId;
    source.onended = (): void => {
      q.activeSources.delete(source);
      if (q.activeSources.size === 0 && q.pending.size === 0) {
        // Pitfall 7: drop queue once fully drained to avoid Map leak.
        const cb = endListener;
        queues.delete(turnId);
        if (cb) cb(turnId);
      }
    };
    source.start(startAt);
    q.activeSources.add(source);
    q.lastEnd = startAt + buf.duration;
    q.nextIdx++;

    if (isFirst) {
      q.firstStarted = true;
      const delayMs = Math.max(0, (startAt - ctx.currentTime) * 1000);
      const cb = firstSentenceListener;
      setTimeout(() => {
        if (cb) cb(turnId);
      }, delayMs);
    }
  }
}

/**
 * Cancel every active source for the turn (barge-in / interrupt).
 * Subsequent enqueueChunk for the same turnId starts a fresh queue.
 */
export function stopTurn(turnId: string): void {
  const q = queues.get(turnId);
  if (!q) return;
  for (const src of q.activeSources) {
    try {
      src.stop();
    } catch {
      /* already stopped */
    }
  }
  queues.delete(turnId);
}

/** Test-only inspector. */
export function __getActiveTurnsForTest(): string[] {
  return [...queues.keys()];
}

/** Test-only reset — clears queues and listeners. */
export function __resetStreamingPlayerForTest(): void {
  queues.clear();
  firstSentenceListener = null;
  endListener = null;
}

/**
 * Wire IPC listeners exposed by the preload bridge. Call once at app boot
 * (e.g., inside App.tsx useEffect). Returns an unsubscribe function.
 *
 * Reads `window.jarvis.streamingTts` (declared in shared/ipc-types JarvisAPI).
 * Returns a no-op unsubscribe if the API is missing (unit tests, headless
 * environments).
 */
export function wireStreamingTtsListeners(): () => void {
  const api =
    typeof window !== 'undefined' ? window.jarvis?.streamingTts : undefined;
  if (!api) return () => undefined;

  const unsubChunk = api.onChunk((payload: TTSChunkPayload) => {
    void enqueueChunk(payload);
  });
  const unsubEnd = api.onEnd((_payload: TTSEndPayload) => {
    /* end is a safety signal — onended chain handles cleanup */
  });
  const unsubStop = api.onStop((payload: TTSStopPayload) => {
    stopTurn(payload.turnId);
  });
  return () => {
    unsubChunk();
    unsubEnd();
    unsubStop();
  };
}
