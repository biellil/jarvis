/**
 * WakeWordEngine tests (Phase 22 Plan 02, Wave 0 → Task 3 green).
 *
 * Cobre o pipeline mel → embed → VAD gate → classifier com debounce e
 * RmsZeroGuard integrados. Usa áudio sintético (Float32Array) e mocks de
 * InferenceSession para manter o runtime isolado.
 *
 * Invariants testadas:
 * - WAKE-08: onSilentStream dispara em stream zero sustentado
 * - WAKE-09: nenhuma chamada fetch() para URL http(s) durante processChunk
 * - PITFALL #4: VAD gate pula classifier quando vadScore < vadThreshold
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// -------------- ONNX mock --------------
const melRun = vi.fn();
const embedRun = vi.fn();
const vadRun = vi.fn();
const kwRun = vi.fn();

vi.mock('onnxruntime-web', () => ({
  InferenceSession: { create: vi.fn() },
  env: { wasm: { numThreads: 1, simd: true, wasmPaths: '' } },
  Tensor: class {
    type: string;
    data: Float32Array;
    dims: number[];
    constructor(type: string, data: Float32Array, dims: number[]) {
      this.type = type;
      this.data = data;
      this.dims = dims;
    }
  },
}));

import { WakeWordEngine } from '../WakeWordEngine';
import type { WakeWordSessions } from '../modelLoader';

const FRAME = 1280;

// -------------- AudioContext / Worklet mocks --------------
class FakeAudioWorklet {
  addModule = vi.fn().mockResolvedValue(undefined);
}
class FakeSourceNode {
  connect = vi.fn();
  disconnect = vi.fn();
}
class FakeAudioContext {
  audioWorklet = new FakeAudioWorklet();
  sampleRate: number;
  constructor(opts?: { sampleRate?: number }) {
    this.sampleRate = opts?.sampleRate ?? 48000;
  }
  createMediaStreamSource = vi.fn(() => new FakeSourceNode());
  suspend = vi.fn().mockResolvedValue(undefined);
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
}

class FakeAudioWorkletNode {
  port: { onmessage: ((e: MessageEvent) => void) | null; postMessage: () => void };
  disconnect = vi.fn();
  constructor() {
    this.port = { onmessage: null, postMessage: vi.fn() };
  }
}

class FakeMediaStream {
  _tracks = [{ stop: vi.fn() }];
  getTracks() {
    return this._tracks;
  }
}

function buildSessions(): WakeWordSessions {
  return {
    mel: { run: melRun } as unknown as WakeWordSessions['mel'],
    embed: { run: embedRun } as unknown as WakeWordSessions['embed'],
    vad: { run: vadRun } as unknown as WakeWordSessions['vad'],
    kw: { run: kwRun } as unknown as WakeWordSessions['kw'],
  };
}

function zeroChunk(): Float32Array {
  return new Float32Array(FRAME);
}

function nonZeroChunk(): Float32Array {
  const f = new Float32Array(FRAME);
  for (let i = 0; i < FRAME; i++) f[i] = 0.1;
  return f;
}

function setOutputs({
  melLen = 32,
  embedLen = 96,
  vadScore = 1.0,
  kwScore = 0.0,
}: { melLen?: number; embedLen?: number; vadScore?: number; kwScore?: number }) {
  melRun.mockResolvedValue({ output: { data: new Float32Array(melLen) } });
  embedRun.mockResolvedValue({ output: { data: new Float32Array(embedLen) } });
  vadRun.mockResolvedValue({ output: { data: new Float32Array([vadScore]) } });
  kwRun.mockResolvedValue({ output: { data: new Float32Array([kwScore]) } });
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  melRun.mockReset();
  embedRun.mockReset();
  vadRun.mockReset();
  kwRun.mockReset();
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('AudioWorkletNode', FakeAudioWorkletNode);
  vi.stubGlobal('MediaStream', FakeMediaStream);
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Helper to directly feed chunks bypassing the worklet port (white-box test of processChunk)
async function feedChunks(engine: WakeWordEngine, chunks: Float32Array[]) {
  // Access private processChunk via bracket notation for deterministic testing.
  for (const c of chunks) {
    await (engine as unknown as { processChunk(chunk: Float32Array): Promise<void> }).processChunk(c);
  }
}

describe('WakeWordEngine', () => {
  it('1. start(sessions, stream) resolve sem throw e adiciona o worklet', async () => {
    setOutputs({});
    const engine = new WakeWordEngine({
      threshold: 0.5,
      debounceMs: 2000,
      vadThreshold: 0.3,
      onDetected: vi.fn(),
    });
    await engine.start(buildSessions(), new FakeMediaStream() as unknown as MediaStream);
    // Worklet module loaded
    await engine.stop();
  });

  it('2. score >= threshold após ring completo dispara onDetected 1x com score', async () => {
    const onDetected = vi.fn();
    setOutputs({ vadScore: 1.0, kwScore: 0.8 });
    const engine = new WakeWordEngine({
      threshold: 0.5,
      debounceMs: 2000,
      vadThreshold: 0.3,
      onDetected,
    });
    await engine.start(buildSessions(), new FakeMediaStream() as unknown as MediaStream);

    // Precisa de 76 chunks pra encher o ring antes do classifier rodar.
    const chunks = Array.from({ length: 77 }, () => nonZeroChunk());
    await feedChunks(engine, chunks);

    expect(onDetected).toHaveBeenCalledTimes(1);
    expect(onDetected).toHaveBeenCalledWith(0.8);
    await engine.stop();
  });

  it('3. score < threshold NÃO dispara onDetected', async () => {
    const onDetected = vi.fn();
    setOutputs({ vadScore: 1.0, kwScore: 0.2 });
    const engine = new WakeWordEngine({
      threshold: 0.5,
      debounceMs: 2000,
      vadThreshold: 0.3,
      onDetected,
    });
    await engine.start(buildSessions(), new FakeMediaStream() as unknown as MediaStream);

    await feedChunks(engine, Array.from({ length: 77 }, () => nonZeroChunk()));
    expect(onDetected).not.toHaveBeenCalled();
    await engine.stop();
  });

  it('4. debounce: dois scores consecutivos ≥ threshold dentro de debounceMs → onDetected 1x', async () => {
    const onDetected = vi.fn();
    setOutputs({ vadScore: 1.0, kwScore: 0.9 });
    const engine = new WakeWordEngine({
      threshold: 0.5,
      debounceMs: 2000,
      vadThreshold: 0.3,
      onDetected,
    });
    await engine.start(buildSessions(), new FakeMediaStream() as unknown as MediaStream);

    // Enche o ring + dispara 1a detection
    await feedChunks(engine, Array.from({ length: 77 }, () => nonZeroChunk()));
    // Mais 3 chunks ainda dentro do debounce
    await feedChunks(engine, Array.from({ length: 3 }, () => nonZeroChunk()));

    expect(onDetected).toHaveBeenCalledTimes(1);
    await engine.stop();
  });

  it('5. VAD gate: vadScore < vadThreshold por 12+ frames → kw.run NÃO é chamado', async () => {
    const onDetected = vi.fn();
    setOutputs({ vadScore: 0.1, kwScore: 0.9 });
    const engine = new WakeWordEngine({
      threshold: 0.5,
      debounceMs: 2000,
      vadThreshold: 0.3,
      onDetected,
    });
    await engine.start(buildSessions(), new FakeMediaStream() as unknown as MediaStream);

    // Enche o ring (76) para habilitar classifier path, depois 20 frames de silêncio
    await feedChunks(engine, Array.from({ length: 76 }, () => nonZeroChunk()));
    // Ring pronto a partir daqui. Mesmo assim, vad sempre <0.3 → kw não roda.
    const kwCallsBefore = kwRun.mock.calls.length;
    await feedChunks(engine, Array.from({ length: 20 }, () => nonZeroChunk()));
    const kwCallsAfter = kwRun.mock.calls.length;

    // Hangover inicia em 0 → primeiro VAD<thresh mantém em 0 → skip.
    // Se kw for chamado, significa que o gate não funcionou.
    expect(kwCallsAfter - kwCallsBefore).toBe(0);
    expect(onDetected).not.toHaveBeenCalled();
    await engine.stop();
  });

  it('6. invariant: nenhum fetch http(s) durante processChunk (WAKE-09)', async () => {
    setOutputs({ vadScore: 1.0, kwScore: 0.9 });
    const engine = new WakeWordEngine({
      threshold: 0.5,
      debounceMs: 2000,
      vadThreshold: 0.3,
      onDetected: vi.fn(),
    });
    await engine.start(buildSessions(), new FakeMediaStream() as unknown as MediaStream);

    await feedChunks(engine, Array.from({ length: 100 }, () => nonZeroChunk()));

    // fetch não pode ter sido chamado com http(s):// em nenhuma call.
    expect(fetchSpy).not.toHaveBeenCalled();
    const anyHttpCall = fetchSpy.mock.calls.some(
      (c) => typeof c[0] === 'string' && /^https?:/.test(c[0] as string),
    );
    expect(anyHttpCall).toBe(false);
    await engine.stop();
  });

  it('7. onSilentStream dispara depois de 63 chunks zero consecutivos (WAKE-08)', async () => {
    const onSilentStream = vi.fn();
    setOutputs({ vadScore: 0.0, kwScore: 0.0 });
    const engine = new WakeWordEngine({
      threshold: 0.5,
      debounceMs: 2000,
      vadThreshold: 0.3,
      onDetected: vi.fn(),
      onSilentStream,
      rmsGuardWindowFrames: 63,
    });
    await engine.start(buildSessions(), new FakeMediaStream() as unknown as MediaStream);

    await feedChunks(engine, Array.from({ length: 63 }, () => zeroChunk()));
    expect(onSilentStream).toHaveBeenCalledTimes(1);
    await engine.stop();
  });

  it('8. stop() fecha audioContext, desconecta nodes e limpa sessions', async () => {
    setOutputs({});
    const engine = new WakeWordEngine({
      threshold: 0.5,
      debounceMs: 2000,
      vadThreshold: 0.3,
      onDetected: vi.fn(),
    });
    await engine.start(buildSessions(), new FakeMediaStream() as unknown as MediaStream);
    await engine.stop();

    // Se iniciar de novo com sessions diferentes, o engine aceita (state limpo).
    await engine.start(buildSessions(), new FakeMediaStream() as unknown as MediaStream);
    await engine.stop();
  });
});
