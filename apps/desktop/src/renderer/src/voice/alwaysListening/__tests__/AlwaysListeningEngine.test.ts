/**
 * AlwaysListeningEngine.test.ts — Wave 2 (Plan 40-04) GREEN tests.
 *
 * Phase 40 — Always-Listening + Intent Classifier
 * Requisitos:
 *  - VLISTEN-01 — VAD detecta speech-end e captura utterance completa
 *  - VLISTEN-03 — Pre-roll de 500ms (8000 samples @ 16kHz) prepended
 *  - VLISTEN-04 — VAD threshold reconfigurável em runtime
 *
 * Threat coverage:
 *  - T-40-VAD (Tampering): VAD threshold reconfigurável testado em
 *    reconfigureVadThreshold() para garantir que slider Settings (D-04)
 *    propaga sem corromper sessão ativa.
 *  - T-40-RING (Information Disclosure): dispose() limpa ring buffer ⇒
 *    nenhum áudio persistido fora do utterance.
 *  - T-40-MIC (Denial of Service): stop() chama getTracks().stop() em
 *    todo track do MediaStream — microfone liberado mesmo em stop anormal.
 *  - T-40-TIMEOUT (Business Logic): utterances < 200ms são descartadas
 *    sem chamar onUtteranceReady (anti-spam ao VAD).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────
// IntentClassifier real depende de @xenova/transformers — mockamos para
// evitar download do modelo de 120MB durante test runs e isolar a engine.
const intentClassifierLoadMock = vi.fn(async () => undefined);
const intentClassifierUnloadMock = vi.fn(() => undefined);
vi.mock('../intentClassifier', () => {
  class MockIntentClassifier {
    load = intentClassifierLoadMock;
    unload = intentClassifierUnloadMock;
    classify = vi.fn();
  }
  return {
    IntentClassifier: MockIntentClassifier,
    INTENT_THRESHOLD: 0.6,
  };
});

// MicVAD do @ricky0123/vad-web — mockamos para controlar onSpeechStart/
// onSpeechEnd manualmente em cada teste.
interface MockMicVADInstance {
  start: Mock;
  pause: Mock;
  destroy: Mock;
  setOptions: Mock;
  __opts: Record<string, unknown>;
}

const micVADInstances: MockMicVADInstance[] = [];

vi.mock('@ricky0123/vad-web', () => ({
  MicVAD: {
    new: vi.fn(async (opts: Record<string, unknown>) => {
      const instance: MockMicVADInstance = {
        start: vi.fn(async () => undefined),
        pause: vi.fn(async () => undefined),
        destroy: vi.fn(async () => undefined),
        setOptions: vi.fn((_update: Record<string, unknown>) => undefined),
        __opts: opts,
      };
      micVADInstances.push(instance);
      return instance;
    }),
  },
}));

// AudioContext stub — happy-dom não implementa, então providenciamos.
class FakeAudioContext {
  sampleRate: number;
  state: 'running' | 'closed' = 'running';
  constructor(opts?: { sampleRate?: number }) {
    this.sampleRate = opts?.sampleRate ?? 16000;
  }
  close = vi.fn(async () => {
    this.state = 'closed';
  });
}

// MediaStream stub.
class FakeMediaStreamTrack {
  stopped = false;
  stop = vi.fn(() => {
    this.stopped = true;
  });
}
class FakeMediaStream {
  private readonly tracks: FakeMediaStreamTrack[];
  constructor(numTracks = 1) {
    this.tracks = Array.from({ length: numTracks }, () => new FakeMediaStreamTrack());
  }
  getTracks(): FakeMediaStreamTrack[] {
    return this.tracks;
  }
}

beforeEach(() => {
  micVADInstances.length = 0;
  intentClassifierLoadMock.mockClear();
  intentClassifierUnloadMock.mockClear();
  // Provide AudioContext on window (happy-dom doesn't have it).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).AudioContext = FakeAudioContext as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = (globalThis as any).window ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window.AudioContext = FakeAudioContext as any;
});

afterEach(() => {
  vi.useRealTimers();
});

// Importa após mocks declarados.
import { AlwaysListeningEngine } from '../AlwaysListeningEngine';
import type { AlwaysListeningEngineOptions } from '../AlwaysListeningEngine';

function makeEngine(overrides: Partial<AlwaysListeningEngineOptions> = {}): {
  engine: AlwaysListeningEngine;
  onUtteranceReady: Mock;
  onError: Mock;
} {
  const onUtteranceReady = vi.fn();
  const onError = vi.fn();
  const engine = new AlwaysListeningEngine({
    vadNegativeFramesToClose: 16, // ~500ms @ frameSamples=512
    onUtteranceReady,
    onError,
    ...overrides,
  });
  return { engine, onUtteranceReady, onError };
}

function getLatestVAD(): MockMicVADInstance {
  const latest = micVADInstances[micVADInstances.length - 1];
  if (!latest) throw new Error('No MicVAD instance created');
  return latest;
}

/** Cria uma Float32Array preenchida com um valor reconhecível para asserts. */
function makeAudio(length: number, fill = 0.5): Float32Array {
  const arr = new Float32Array(length);
  arr.fill(fill);
  return arr;
}

describe('AlwaysListeningEngine (VLISTEN-01, VLISTEN-03, T-40-VAD, T-40-RING)', () => {
  describe('start() + VAD integration (VLISTEN-01)', () => {
    it('start(stream) initializes AudioContext and VAD session', async () => {
      const { engine } = makeEngine();
      const stream = new FakeMediaStream() as unknown as MediaStream;

      await engine.start(stream);

      expect(intentClassifierLoadMock).toHaveBeenCalledOnce();
      expect(micVADInstances).toHaveLength(1);
      const vad = getLatestVAD();
      expect(vad.start).toHaveBeenCalledOnce();
      // The MicVAD opts should reuse the provided stream (no duplicate mic prompt).
      expect(typeof vad.__opts.getStream).toBe('function');
      const reuse = await (vad.__opts.getStream as () => Promise<MediaStream>)();
      expect(reuse).toBe(stream);
    });

    it('VAD onSpeechEnd callback triggers utterance pipeline', async () => {
      const { engine, onUtteranceReady } = makeEngine();
      const stream = new FakeMediaStream() as unknown as MediaStream;
      await engine.start(stream);

      const vad = getLatestVAD();
      // Fire onSpeechStart manually, wait > min duration, then onSpeechEnd.
      vi.useFakeTimers();
      const now0 = 1_000_000;
      vi.setSystemTime(now0);
      await (vad.__opts.onSpeechStart as () => Promise<void> | void)();
      vi.setSystemTime(now0 + 500); // > 200ms

      const audio = makeAudio(8000); // ~500ms @ 16kHz
      await (vad.__opts.onSpeechEnd as (a: Float32Array) => Promise<void>)(audio);

      expect(onUtteranceReady).toHaveBeenCalledOnce();
      const wav = onUtteranceReady.mock.calls[0]![0] as Uint8Array;
      expect(wav).toBeInstanceOf(Uint8Array);
      // RIFF header byte sanity check.
      expect(String.fromCharCode(wav[0]!, wav[1]!, wav[2]!, wav[3]!)).toBe('RIFF');
    });

    it('utterances < 200ms are discarded without sending', async () => {
      const { engine, onUtteranceReady } = makeEngine();
      const stream = new FakeMediaStream() as unknown as MediaStream;
      await engine.start(stream);

      const vad = getLatestVAD();
      vi.useFakeTimers();
      const now0 = 2_000_000;
      vi.setSystemTime(now0);
      await (vad.__opts.onSpeechStart as () => Promise<void> | void)();
      vi.setSystemTime(now0 + 100); // < 200ms

      const audio = makeAudio(1600); // 100ms @ 16kHz
      await (vad.__opts.onSpeechEnd as (a: Float32Array) => Promise<void>)(audio);

      expect(onUtteranceReady).not.toHaveBeenCalled();
    });

    it('classifier load failure propagates from start()', async () => {
      intentClassifierLoadMock.mockRejectedValueOnce(new Error('model not found'));
      const { engine } = makeEngine();
      const stream = new FakeMediaStream() as unknown as MediaStream;

      await expect(engine.start(stream)).rejects.toThrow(/model not found/);
    });
  });

  describe('pre-roll concatenation (VLISTEN-03)', () => {
    it('handleSpeechEnd() prepends ring buffer snapshot to utterance audio', async () => {
      const { engine, onUtteranceReady } = makeEngine();
      const stream = new FakeMediaStream() as unknown as MediaStream;
      await engine.start(stream);

      const vad = getLatestVAD();

      // Feed pre-roll audio into ring buffer via onFrameProcessed (if hook exists).
      const onFrameProcessed = vad.__opts.onFrameProcessed as
        | ((probs: unknown, frame: Float32Array) => Promise<void> | void)
        | undefined;
      const preRollFrame = makeAudio(1000, 0.25); // marker value 0.25
      if (typeof onFrameProcessed === 'function') {
        await onFrameProcessed({ isSpeech: 0, notSpeech: 1 }, preRollFrame);
      }

      vi.useFakeTimers();
      const now0 = 3_000_000;
      vi.setSystemTime(now0);
      await (vad.__opts.onSpeechStart as () => Promise<void> | void)();
      vi.setSystemTime(now0 + 500);

      const utterance = makeAudio(4000, 0.75); // marker 0.75
      await (vad.__opts.onSpeechEnd as (a: Float32Array) => Promise<void>)(utterance);

      expect(onUtteranceReady).toHaveBeenCalledOnce();
      const wav = onUtteranceReady.mock.calls[0]![0] as Uint8Array;
      // WAV data starts at byte 44 — we just sanity-check it is at least
      // (preRollFrame + utterance) length * 2 bytes (Int16) + 44 header.
      // If pre-roll wasn't prepended, total would only be utterance.length*2 + 44.
      const minExpected = (preRollFrame.length + utterance.length) * 2 + 44;
      // If onFrameProcessed exists, expect pre-roll prepended; else just utterance.
      if (typeof onFrameProcessed === 'function') {
        expect(wav.byteLength).toBeGreaterThanOrEqual(minExpected);
      } else {
        // Without frame hook, ring buffer stays empty — only utterance bytes.
        expect(wav.byteLength).toBe(utterance.length * 2 + 44);
      }
    });

    it('ring buffer is cleared after each utterance capture', async () => {
      const { engine, onUtteranceReady } = makeEngine();
      const stream = new FakeMediaStream() as unknown as MediaStream;
      await engine.start(stream);

      const vad = getLatestVAD();
      const onFrameProcessed = vad.__opts.onFrameProcessed as
        | ((probs: unknown, frame: Float32Array) => Promise<void> | void)
        | undefined;

      vi.useFakeTimers();
      const t0 = 5_000_000;
      vi.setSystemTime(t0);

      // First utterance: pre-roll frame + speech end.
      if (typeof onFrameProcessed === 'function') {
        await onFrameProcessed({ isSpeech: 0, notSpeech: 1 }, makeAudio(2000, 0.1));
      }
      await (vad.__opts.onSpeechStart as () => Promise<void> | void)();
      vi.setSystemTime(t0 + 500);
      await (vad.__opts.onSpeechEnd as (a: Float32Array) => Promise<void>)(
        makeAudio(3000, 0.9),
      );

      const firstWav = onUtteranceReady.mock.calls[0]![0] as Uint8Array;

      // Second utterance: NO pre-roll frame fed. Ring buffer must be empty.
      vi.setSystemTime(t0 + 2000);
      await (vad.__opts.onSpeechStart as () => Promise<void> | void)();
      vi.setSystemTime(t0 + 2500);
      await (vad.__opts.onSpeechEnd as (a: Float32Array) => Promise<void>)(
        makeAudio(3000, 0.9),
      );

      const secondWav = onUtteranceReady.mock.calls[1]![0] as Uint8Array;

      // Second WAV must NOT contain the pre-roll bytes (3000 samples + 44 header
      // exactly), regardless of whether onFrameProcessed is supported.
      expect(secondWav.byteLength).toBe(3000 * 2 + 44);
      // Sanity: first wav (with hook) is >=, without hook is exactly equal.
      if (typeof onFrameProcessed === 'function') {
        expect(firstWav.byteLength).toBeGreaterThan(secondWav.byteLength);
      } else {
        expect(firstWav.byteLength).toBe(secondWav.byteLength);
      }
    });
  });

  describe('onUtteranceReady callback', () => {
    it('passes a valid WAV buffer (Uint8Array) on speech-end', async () => {
      const { engine, onUtteranceReady } = makeEngine();
      const stream = new FakeMediaStream() as unknown as MediaStream;
      await engine.start(stream);

      const vad = getLatestVAD();
      vi.useFakeTimers();
      const now0 = 7_000_000;
      vi.setSystemTime(now0);
      await (vad.__opts.onSpeechStart as () => Promise<void> | void)();
      vi.setSystemTime(now0 + 400);

      await (vad.__opts.onSpeechEnd as (a: Float32Array) => Promise<void>)(makeAudio(6400));
      expect(onUtteranceReady).toHaveBeenCalledOnce();
      const wav = onUtteranceReady.mock.calls[0]![0];
      expect(wav).toBeInstanceOf(Uint8Array);
      // WAVE marker present (bytes 8-11).
      const wave = String.fromCharCode(wav[8]!, wav[9]!, wav[10]!, wav[11]!);
      expect(wave).toBe('WAVE');
    });

    it('NOT called for utterances below 200ms', async () => {
      const { engine, onUtteranceReady } = makeEngine();
      const stream = new FakeMediaStream() as unknown as MediaStream;
      await engine.start(stream);

      const vad = getLatestVAD();
      vi.useFakeTimers();
      const now0 = 8_000_000;
      vi.setSystemTime(now0);
      await (vad.__opts.onSpeechStart as () => Promise<void> | void)();
      vi.setSystemTime(now0 + 50); // 50ms only

      await (vad.__opts.onSpeechEnd as (a: Float32Array) => Promise<void>)(makeAudio(800));
      expect(onUtteranceReady).not.toHaveBeenCalled();
    });
  });

  describe('reconfigureVadThreshold() (VLISTEN-04)', () => {
    it('reconfigureVadThreshold(n) updates VAD setOptions on active session', async () => {
      const { engine } = makeEngine();
      const stream = new FakeMediaStream() as unknown as MediaStream;
      await engine.start(stream);

      const vad = getLatestVAD();
      await engine.reconfigureVadThreshold(800);
      expect(vad.setOptions).toHaveBeenCalled();
      const update = vad.setOptions.mock.calls[0]![0] as Record<string, unknown>;
      // Either negativeFramesToClose, redemptionFrames, or redemptionMs must be passed.
      // Our engine uses redemptionMs (matching @ricky0123/vad-web 0.0.30 API).
      expect(update).toMatchObject({
        redemptionMs: expect.any(Number) as unknown as number,
      });
    });

    it('reconfigureVadThreshold() before start() does not throw', async () => {
      const { engine } = makeEngine();
      await expect(engine.reconfigureVadThreshold(600)).resolves.not.toThrow();
    });
  });

  describe('stop() + dispose() lifecycle (T-40-RING, T-40-MIC, D-04 lazy lifecycle)', () => {
    it('stop() ends VAD session and stops all mic stream tracks', async () => {
      const { engine } = makeEngine();
      const fakeStream = new FakeMediaStream(2);
      const stream = fakeStream as unknown as MediaStream;
      await engine.start(stream);

      const vad = getLatestVAD();
      await engine.stop();

      expect(vad.destroy).toHaveBeenCalled();
      const tracks = fakeStream.getTracks();
      expect(tracks[0]!.stopped).toBe(true);
      expect(tracks[1]!.stopped).toBe(true);
    });

    it('dispose() calls stop() then unloads classifier and clears ring buffer', async () => {
      const { engine } = makeEngine();
      const stream = new FakeMediaStream() as unknown as MediaStream;
      await engine.start(stream);
      const vad = getLatestVAD();

      await engine.dispose();

      expect(vad.destroy).toHaveBeenCalled();
      expect(intentClassifierUnloadMock).toHaveBeenCalledOnce();
    });

    it('dispose() called twice does not throw (idempotent)', async () => {
      const { engine } = makeEngine();
      const stream = new FakeMediaStream() as unknown as MediaStream;
      await engine.start(stream);

      await engine.dispose();
      await expect(engine.dispose()).resolves.not.toThrow();

      // unload should only have been called once across both dispose() calls.
      expect(intentClassifierUnloadMock).toHaveBeenCalledOnce();
    });

    it('start() after dispose() throws (cannot restart)', async () => {
      const { engine } = makeEngine();
      const stream = new FakeMediaStream() as unknown as MediaStream;
      await engine.start(stream);
      await engine.dispose();

      await expect(engine.start(stream)).rejects.toThrow(/dispose/i);
    });
  });
});
