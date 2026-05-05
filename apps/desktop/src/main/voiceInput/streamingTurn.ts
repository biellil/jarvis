/**
 * streamingTurn — Phase 53 Plan 01 (STTS-01).
 *
 * Orchestrates a single streaming turn:
 *   SSE `/api/chat/stream` (token stream)
 *     → SentenceChunker (split on /[.!?]\s+/)
 *     → per-sentence parallel `tts.synthesize()`
 *     → IPC `tts:chunk` per sentence (monotonic idx in assignment order)
 *     → final IPC `tts:end` after all in-flight syntheses settle.
 *
 * Cancellation (D-12): `handle.abort()` flips the `cancelled` flag AND
 * aborts the underlying SSE fetch. Any synthesize() promises that resolve
 * after cancellation are silently dropped — no further `tts:chunk` IPC
 * is sent. Plan 04 will additionally emit a `tts:stop` IPC and stop the
 * renderer-side audio queue; this module stays focused on producer-side
 * cancellation safety.
 *
 * Failure modes:
 *   - Single synthesize() rejection: per-sentence graceful degrade
 *     (WAKE-10 precedent) — that sentence is logged and skipped, the turn
 *     continues. Subsequent idx values still advance (the failed sentence's
 *     idx is consumed and never produces a chunk; renderer queue must be
 *     resilient to gaps).
 *   - SSE error: surface via console.warn; flush whatever residual was
 *     captured before the error so partial replies still get TTS'd.
 *   - Window destroyed mid-turn: skip every IPC send (renderer is gone).
 *
 * Decisions: D-01 (single source of truth chunker), D-04 (residual flush),
 * D-08 (provider-agnostic — single code path for Murf and ElevenLabs),
 * D-12 (cancelled flag guards every IPC send).
 */
import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import { SentenceChunker } from './chunker.js';
import { openChatStream } from '../sse-client.js';
import { getActiveTtsProvider } from './tts/index.js';
import type { TTSProvider } from './tts/provider.js';
import { IPC_CHANNELS, type TTSChunkPayload } from '../../shared/ipc-types.js';

export interface StreamingTurnDeps {
  /** Backend base URL (e.g. http://localhost:3000) — `/api/chat/stream` is appended. */
  backendUrl: string;
  /** Optional API key — forwarded to openChatStream (empty string if unset). */
  apiKey?: string;
  /** Live BrowserWindow (or any object with isDestroyed + webContents.send for tests). */
  mainWindow: Pick<BrowserWindow, 'isDestroyed' | 'webContents'>;
  /** Override for tests — defaults to the real openChatStream. */
  openStream?: typeof openChatStream;
  /** Override for tests — defaults to the active singleton TTS provider. */
  provider?: TTSProvider;
}

export interface StreamingTurnHandle {
  /** Stable id used in every TTS_CHUNK / TTS_END payload for this turn. */
  turnId: string;
  /** Cancel the turn — flips cancelled flag and aborts SSE consumption. Idempotent. */
  abort: () => void;
  /** Resolves when the SSE stream finishes AND all in-flight syntheses settle. */
  done: Promise<void>;
}

/**
 * Start a streaming turn. Returns synchronously with a handle so callers can
 * register barge-in / abort listeners before the first token arrives.
 */
export function runStreamingTurn(
  deps: StreamingTurnDeps,
  transcription: string,
): StreamingTurnHandle {
  const turnId = randomUUID();
  const controller = new AbortController();
  // Use a wrapper object so the closure captures a live reference to the flag,
  // not the value at closure-creation time.
  const cancelled = { value: false };
  const chunker = new SentenceChunker();
  const tts = deps.provider ?? getActiveTtsProvider();
  const openStream = deps.openStream ?? openChatStream;
  let nextIdx = 0;
  const inFlight: Array<Promise<void>> = [];

  const sendChunk = (payload: TTSChunkPayload): void => {
    if (cancelled.value) return;
    if (deps.mainWindow.isDestroyed()) return;
    deps.mainWindow.webContents.send(IPC_CHANNELS.TTS_CHUNK, payload);
  };

  const synthAndSend = async (text: string, idx: number): Promise<void> => {
    if (cancelled.value) return;
    try {
      const result = await tts.synthesize(text);
      if (cancelled.value) return;
      // TTSProvider returns 'mp3' | 'wav' | 'opus' but the IPC contract is
      // narrowed to mp3 / wav. Both real providers (Murf, ElevenLabs) return
      // mp3 today; opus would be a future provider — fall back to 'mp3' label
      // rather than break the contract. The renderer queue accepts opus bytes
      // labeled as 'mp3' transparently because it routes via Web Audio API.
      const format: 'mp3' | 'wav' = result.format === 'wav' ? 'wav' : 'mp3';
      sendChunk({
        turnId,
        idx,
        audioBase64: result.audio.toString('base64'),
        format,
        isLast: false,
      });
    } catch (err) {
      // Graceful per-sentence degrade (WAKE-10 precedent) — never abort the
      // turn for a single synthesize failure. Renderer queue must accept gaps
      // in idx sequence (Plan 02 explicitly handles this).
      console.warn(`[streaming-tts] sentence ${idx} synthesize failed:`, err);
    }
  };

  const done = (async (): Promise<void> => {
    try {
      await openStream({
        url: `${deps.backendUrl}/api/chat/stream`,
        apiKey: deps.apiKey ?? '',
        message: transcription,
        onToken: (tok: string) => {
          if (cancelled.value) return;
          for (const sentence of chunker.feed(tok)) {
            inFlight.push(synthAndSend(sentence, nextIdx++));
          }
        },
        onAction: () => {
          // LACT-* (Plan 04 / Phase 54 territory) — wired by a separate plan.
        },
        onEnd: () => {
          // Drain handled below after openStream resolves.
        },
        onError: (err: Error) => {
          if (!cancelled.value) console.warn('[streaming-tts] sse error:', err);
        },
        signal: controller.signal,
      });
    } catch (err) {
      if (!cancelled.value) console.warn('[streaming-tts] stream error:', err);
    }

    // D-04: flush residual buffer so replies without trailing punctuation
    // still produce a final TTS chunk.
    if (!cancelled.value) {
      for (const tail of chunker.flush()) {
        inFlight.push(synthAndSend(tail, nextIdx++));
      }
    }

    // Wait for every synthesis (success or failure) before signalling end.
    await Promise.allSettled(inFlight);

    if (cancelled.value) return;
    if (deps.mainWindow.isDestroyed()) return;
    deps.mainWindow.webContents.send(IPC_CHANNELS.TTS_END, { turnId });
  })();

  return {
    turnId,
    abort: (): void => {
      cancelled.value = true;
      try {
        controller.abort();
      } catch {
        // Already aborted — abort() throws on some Node versions if called
        // twice; we treat it as idempotent.
      }
    },
    done,
  };
}
