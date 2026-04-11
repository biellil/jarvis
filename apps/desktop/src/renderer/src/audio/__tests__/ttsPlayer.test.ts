/**
 * ttsPlayer tests — Phase 19.5, Plan 03
 *
 * Mock AudioContext global via vi.stubGlobal antes de cada teste.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  playTTSResponse,
  stopTTSPlayback,
  registerTTSHooks,
  __resetForTests,
} from '../ttsPlayer';

interface MockSource {
  buffer: unknown;
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
}

function createMockSource(): MockSource {
  return {
    buffer: null,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
  };
}

let ctxInstances: MockAudioContext[] = [];
let ctxConstructorCalls = 0;

class MockAudioContext {
  public state: 'running' | 'suspended' = 'running';
  public destination = {};
  public resume = vi.fn().mockResolvedValue(undefined);
  public decodeAudioData = vi.fn().mockResolvedValue({ duration: 1 });
  public sources: MockSource[] = [];
  public createBufferSource = vi.fn(() => {
    const s = createMockSource();
    this.sources.push(s);
    return s;
  });
  constructor() {
    ctxConstructorCalls++;
    ctxInstances.push(this);
  }
}

beforeEach(() => {
  __resetForTests();
  ctxInstances = [];
  ctxConstructorCalls = 0;
  vi.stubGlobal('AudioContext', MockAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// "AAAA" → 3 bytes 0,0,0
const SAMPLE_B64 = 'AAAA';

describe('ttsPlayer', () => {
  it('toca com sucesso: decodifica e chama start()', async () => {
    await playTTSResponse(SAMPLE_B64, 'mp3');

    expect(ctxInstances).toHaveLength(1);
    const ctx = ctxInstances[0];
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
    const source = ctx.sources[0];
    expect(source.connect).toHaveBeenCalledWith(ctx.destination);
    expect(source.start).toHaveBeenCalledTimes(1);
  });

  it('cancela o anterior: segundo play chama stop() no source velho', async () => {
    await playTTSResponse(SAMPLE_B64, 'mp3');
    const first = ctxInstances[0].sources[0];

    await playTTSResponse(SAMPLE_B64, 'mp3');
    expect(first.stop).toHaveBeenCalledTimes(1);
  });

  it('onended limpa currentSource', async () => {
    await playTTSResponse(SAMPLE_B64, 'mp3');
    const source = ctxInstances[0].sources[0];
    expect(source.onended).toBeTypeOf('function');
    source.onended!();

    // Após clear, stopTTSPlayback não deve tentar stopar (não crasha,
    // mas confirma que currentSource foi zerado)
    stopTTSPlayback();
    expect(source.stop).not.toHaveBeenCalled();
  });

  it('resume se AudioContext estiver suspended', async () => {
    // override próxima instância pra começar suspended
    class SuspendedCtx extends MockAudioContext {
      constructor() {
        super();
        this.state = 'suspended';
      }
    }
    vi.stubGlobal('AudioContext', SuspendedCtx);

    await playTTSResponse(SAMPLE_B64, 'mp3');
    const ctx = ctxInstances[0];
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('singleton: duas chamadas reusam o mesmo AudioContext', async () => {
    await playTTSResponse(SAMPLE_B64, 'mp3');
    await playTTSResponse(SAMPLE_B64, 'mp3');
    expect(ctxConstructorCalls).toBe(1);
  });

  it('stopTTSPlayback para source corrente e é idempotente', async () => {
    await playTTSResponse(SAMPLE_B64, 'mp3');
    const source = ctxInstances[0].sources[0];

    stopTTSPlayback();
    expect(source.stop).toHaveBeenCalledTimes(1);

    // Segunda chamada não deve explodir nem chamar stop de novo
    stopTTSPlayback();
    expect(source.stop).toHaveBeenCalledTimes(1);
  });

  it('stop em source antigo não crasha se lançar', async () => {
    await playTTSResponse(SAMPLE_B64, 'mp3');
    const first = ctxInstances[0].sources[0];
    first.stop.mockImplementation(() => {
      throw new Error('already stopped');
    });

    await expect(playTTSResponse(SAMPLE_B64, 'mp3')).resolves.toBeUndefined();
  });
});

describe('registerTTSHooks (Phase 22 Plan 04 — wake word integration)', () => {
  it('beforePlay é chamado 1x antes do source.start()', async () => {
    const beforePlay = vi.fn().mockResolvedValue(undefined);
    const afterPlay = vi.fn().mockResolvedValue(undefined);
    registerTTSHooks({ beforePlay, afterPlay });

    await playTTSResponse(SAMPLE_B64, 'mp3');

    expect(beforePlay).toHaveBeenCalledTimes(1);
    const source = ctxInstances[0].sources[0];
    // beforePlay foi resolvido antes de source.start() ser invocado.
    expect(source.start).toHaveBeenCalledTimes(1);
    // afterPlay ainda NÃO foi chamado — aguarda onended + 300ms.
    expect(afterPlay).not.toHaveBeenCalled();
  });

  it('afterPlay é chamado ~300ms após source.onended', async () => {
    vi.useFakeTimers();
    const beforePlay = vi.fn().mockResolvedValue(undefined);
    const afterPlay = vi.fn().mockResolvedValue(undefined);
    registerTTSHooks({ beforePlay, afterPlay });

    await playTTSResponse(SAMPLE_B64, 'mp3');
    const source = ctxInstances[0].sources[0];

    // Dispara onended manualmente
    expect(source.onended).toBeTypeOf('function');
    source.onended!();

    // Imediatamente após onended, afterPlay ainda não rodou.
    expect(afterPlay).not.toHaveBeenCalled();

    // Avança 300ms
    await vi.advanceTimersByTimeAsync(300);
    expect(afterPlay).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('registerTTSHooks pode ser chamado com objeto vazio para limpar hooks', async () => {
    const beforePlay = vi.fn().mockResolvedValue(undefined);
    registerTTSHooks({ beforePlay });
    await playTTSResponse(SAMPLE_B64, 'mp3');
    expect(beforePlay).toHaveBeenCalledTimes(1);

    // Limpa hooks
    registerTTSHooks({});
    beforePlay.mockClear();
    await playTTSResponse(SAMPLE_B64, 'mp3');
    expect(beforePlay).not.toHaveBeenCalled();
  });
});
