/**
 * modelLoader tests (Phase 22 Plan 02, Wave 0).
 *
 * Cobre contrato loadWakeWordSessions({mel, embed, vad, kw: Uint8Array}):
 * - cria 4 InferenceSessions em paralelo
 * - propaga erro se qualquer create() rejeitar
 *
 * Mock completo de 'onnxruntime-web' para não depender de wasm runtime em
 * vitest (happy-dom não consegue instanciar ort real).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createMock = vi.fn();
const releaseMock = vi.fn();

vi.mock('onnxruntime-web', () => ({
  InferenceSession: {
    create: (...args: unknown[]) => createMock(...args),
  },
  env: { wasm: { numThreads: 1, simd: true, wasmPaths: '' } },
  Tensor: vi.fn(),
}));

import { loadWakeWordSessions } from '../modelLoader';

function bytes(len = 4): Uint8Array {
  return new Uint8Array(len);
}

describe('loadWakeWordSessions', () => {
  beforeEach(() => {
    createMock.mockReset();
    releaseMock.mockReset();
  });

  it('1. cria 4 InferenceSessions em paralelo (Promise.all), 1 chamada por modelo', async () => {
    createMock.mockResolvedValue({ __mock: 'session', release: releaseMock });
    const modelBytes = { mel: bytes(), embed: bytes(), vad: bytes(), kw: bytes() };

    const sessions = await loadWakeWordSessions(modelBytes);

    expect(createMock).toHaveBeenCalledTimes(4);
    expect(sessions).toHaveProperty('mel');
    expect(sessions).toHaveProperty('embed');
    expect(sessions).toHaveProperty('vad');
    expect(sessions).toHaveProperty('kw');
  });

  it('2. passa os bytes corretos para cada create (mel/embed/vad/kw)', async () => {
    createMock.mockResolvedValue({ __mock: 'session' });
    const modelBytes = {
      mel: new Uint8Array([1]),
      embed: new Uint8Array([2]),
      vad: new Uint8Array([3]),
      kw: new Uint8Array([4]),
    };
    await loadWakeWordSessions(modelBytes);

    const callArgs = createMock.mock.calls.map((c) => c[0] as Uint8Array);
    expect(callArgs).toContainEqual(modelBytes.mel);
    expect(callArgs).toContainEqual(modelBytes.embed);
    expect(callArgs).toContainEqual(modelBytes.vad);
    expect(callArgs).toContainEqual(modelBytes.kw);
  });

  it('3. se qualquer create rejeitar, a função rejeita com o erro original', async () => {
    createMock
      .mockResolvedValueOnce({ __mock: 'mel' })
      .mockResolvedValueOnce({ __mock: 'embed' })
      .mockRejectedValueOnce(new Error('vad model corrupted'))
      .mockResolvedValueOnce({ __mock: 'kw' });

    await expect(
      loadWakeWordSessions({ mel: bytes(), embed: bytes(), vad: bytes(), kw: bytes() }),
    ).rejects.toThrow('vad model corrupted');
  });

  it('4. sincroniza com ort.env.wasm.numThreads === 1 (import-time side effect)', async () => {
    const ort = await import('onnxruntime-web');
    expect(ort.env.wasm.numThreads).toBe(1);
  });
});
