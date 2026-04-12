/**
 * @vitest-environment happy-dom
 *
 * useWakeWord tests — Phase 22 Plan 04 + Phase 23 Plan 02 + Phase 24 Plan 04
 *
 * Phase 22 baseline (10 cenários):
 *   1. Boot: loadModels → loadWakeWordSessions → new WakeWordEngine → engine.start()
 *   2. onDetected + state===idle → burst → (after 350ms) acquire + setState(listening) + vad.start()
 *   3. onDetected + state===responding → IGNORADO (gate anti self-trigger)
 *   4. voiceInputManager.acquire retorna BUSY → nenhum setState nem vad.start
 *   5. 6s absolute fallback (Phase 24 — substitui o timeout fixo de 3s) → toast + release + idle
 *   6. state → 'responding'/'processing'/'listening' → engine.suspend()
 *   7. state → 'idle' → engine.resume()
 *   8. getUserMedia rejeita com NotAllowedError → status='unavailable', no throw
 *   9. unmount → engine.stop() + vad.pause()
 *  10. registerTTSHooks: beforePlay suspende, afterPlay resume
 *
 * Phase 23 Plan 02 (D-02, D-05, D-06): 8 cenários adicionais (pause toggle, burst ordering, reduced motion).
 *
 * Phase 24 — VAD integration: 10 cenários novos cobrindo MicVAD wiring,
 * onSpeechEnd → sendAudioAndHandle, fallback clearing, cleanup.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import React from 'react';
import { renderHook, act } from '@testing-library/react';

// ---------------- Mocks ----------------
// vi.mock() é hoisted para o topo do arquivo — variáveis top-level usadas
// dentro da factory precisam ser acessadas via lazy getters. Usamos uma
// abordagem onde o MockEngine é definido DENTRO do factory do vi.mock e
// expomos um acessor compartilhado via vi.hoisted.

const hoistedMocks = vi.hoisted(() => {
  interface MockEngineOptsLocal {
    threshold: number;
    debounceMs: number;
    vadThreshold: number;
    onDetected: (score: number) => void;
    onSilentStream?: () => void;
  }

  class MockEngineLocal {
    public opts: MockEngineOptsLocal;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public startMock: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public suspendMock: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public resumeMock: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public stopMock: any;

    constructor(opts: MockEngineOptsLocal) {
      this.opts = opts;
      // vi is available after hoisting — referenced lazily at instance time.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = (globalThis as any).vi ?? require('vitest').vi;
      this.startMock = v.fn().mockResolvedValue(undefined);
      this.suspendMock = v.fn().mockResolvedValue(undefined);
      this.resumeMock = v.fn().mockResolvedValue(undefined);
      this.stopMock = v.fn().mockResolvedValue(undefined);
      engineState.instances.push(this);
      engineState.latest = this;
    }

    start(...args: unknown[]): Promise<void> {
      return this.startMock(...args);
    }
    suspend(): Promise<void> {
      return this.suspendMock();
    }
    resume(): Promise<void> {
      return this.resumeMock();
    }
    stop(): Promise<void> {
      return this.stopMock();
    }
    __emitDetection(score: number): void {
      this.opts.onDetected(score);
    }
    __emitSilent(): void {
      this.opts.onSilentStream?.();
    }
  }

  const engineState: {
    instances: MockEngineLocal[];
    latest: MockEngineLocal | null;
  } = {
    instances: [],
    latest: null,
  };

  // Phase 24 Plan 04 — MicVAD mock
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyFn = any;
  class MockMicVADLocal {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public opts: any;
    public startMock: AnyFn;
    public pauseMock: AnyFn;
    public destroyMock: AnyFn;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(opts: any) {
      this.opts = opts;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = (globalThis as any).vi ?? require('vitest').vi;
      this.startMock = v.fn().mockResolvedValue(undefined);
      this.pauseMock = v.fn().mockResolvedValue(undefined);
      this.destroyMock = v.fn().mockResolvedValue(undefined);
      vadState.instances.push(this);
      vadState.latest = this;
    }

    start(): Promise<void> {
      return this.startMock();
    }
    pause(): Promise<void> {
      return this.pauseMock();
    }
    destroy(): Promise<void> {
      return this.destroyMock();
    }
    async __emitSpeechEnd(audio: Float32Array): Promise<void> {
      await this.opts.onSpeechEnd?.(audio);
    }
    __emitSpeechStart(): void {
      this.opts.onSpeechStart?.();
    }
    __emitMisfire(): void {
      this.opts.onVADMisfire?.();
    }
  }

  const vadState: {
    instances: MockMicVADLocal[];
    latest: MockMicVADLocal | null;
  } = {
    instances: [],
    latest: null,
  };

  return { engineState, MockEngineLocal, vadState, MockMicVADLocal };
});

vi.mock('../../src/voice/wakeWord/WakeWordEngine', () => ({
  WakeWordEngine: hoistedMocks.MockEngineLocal,
}));

// Phase 24 Plan 04 — mock do @ricky0123/vad-web
vi.mock('@ricky0123/vad-web', () => ({
  MicVAD: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new: vi.fn(async (opts: any) => new hoistedMocks.MockMicVADLocal(opts)),
  },
}));

const loadWakeWordSessionsMock = vi.fn().mockResolvedValue({
  mel: {},
  embed: {},
  vad: {},
  kw: {},
});
vi.mock('../../src/voice/wakeWord/modelLoader', () => ({
  loadWakeWordSessions: (bytes: unknown) => loadWakeWordSessionsMock(bytes),
}));

type WakeSource = 'wakeword' | 'ptt' | null;
const acquireMock = vi.fn();
const releaseMock = vi.fn();
const getCurrentSourceMock = vi.fn<() => WakeSource>(() => null);
vi.mock('../../src/voice/voiceInputManager', () => ({
  voiceInputManager: {
    acquire: (src: string) => acquireMock(src),
    release: (src: string) => releaseMock(src),
    getCurrentSource: () => getCurrentSourceMock(),
    subscribe: vi.fn(() => () => undefined),
  },
}));

// Phase 24 Plan 04 — mock do sendAudioAndHandle (evita IPC real nos testes).
const sendAudioAndHandleMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/voice/sendAudioAndHandle', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendAudioAndHandle: (bytes: Uint8Array, deps: any) =>
    sendAudioAndHandleMock(bytes, deps),
}));

// encodeFloat32ToWav é PURO — não é mockado, usamos o real. A assertion
// sobre o payload entregue a sendAudioAndHandle valida que o pipeline
// Float32 → WAV → Uint8Array está rodando ponta-a-ponta nos tests.

const registerTTSHooksMock = vi.fn();
vi.mock('../../src/audio/ttsPlayer', () => ({
  registerTTSHooks: (h: unknown) => registerTTSHooksMock(h),
}));

// OrbContext lightweight stand-in — a real OrbProvider exige React setState
// batching que polui os asserts. Aqui expomos um state mutável direto.
// Phase 23 Plan 02: adiciona wakeWordPaused + setWakeWordPaused + triggerWakeBurst.
let orbState: 'idle' | 'listening' | 'processing' | 'responding' = 'idle';
let orbWakeWordPaused = false;
const setOrbStateSpy = vi.fn((s: typeof orbState) => {
  orbState = s;
});
const setWakeWordPausedSpy = vi.fn((p: boolean) => {
  orbWakeWordPaused = p;
});
const triggerWakeBurstSpy = vi.fn();
vi.mock('../../components/Orb/OrbContext', () => ({
  useOrbContext: () => ({
    state: orbState,
    setState: setOrbStateSpy,
    wakeWordPaused: orbWakeWordPaused,
    setWakeWordPaused: setWakeWordPausedSpy,
    burstActive: false,
    triggerWakeBurst: triggerWakeBurstSpy,
  }),
  OrbProvider: ({ children }: { children: ReactNode }) => children,
}));

// Phase 24 Plan 04 — ChatContext mock (substitui a dependência real no hook).
const addHumanMessageSpy = vi.fn();
const addAgentMessageSpy = vi.fn();
const setToastSpy = vi.fn();
vi.mock('../../src/chat/ChatContext', () => ({
  useChat: () => ({
    messages: [],
    addHumanMessage: addHumanMessageSpy,
    addAgentMessage: addAgentMessageSpy,
    toast: null,
    setToast: setToastSpy,
  }),
}));

// ---------------- Global stubs ----------------

const loadModelsBytes = {
  mel: new Uint8Array([1]),
  embed: new Uint8Array([2]),
  vad: new Uint8Array([3]),
  kw: new Uint8Array([4]),
};
const loadModelsMock = vi.fn().mockResolvedValue(loadModelsBytes);

// Phase 23 Plan 02 — mocks das novas APIs do WakeWordApi
const getPausedMock = vi.fn().mockResolvedValue(false);
const onPauseToggleUnsubscribeMock = vi.fn();
const onPauseToggleMock = vi.fn(
  (_cb: (paused: boolean) => void) => onPauseToggleUnsubscribeMock
);

const mediaTracks = [{ stop: vi.fn(), readyState: 'live', muted: false, label: 'mic', getSettings: () => ({}) }];
const mockStream = {
  getTracks: () => mediaTracks,
  getAudioTracks: () => mediaTracks,
};
const getUserMediaMock = vi.fn().mockResolvedValue(mockStream);

function wrapper({ children }: { children: ReactNode }) {
  return React.createElement(React.Fragment, null, children);
}

beforeEach(() => {
  hoistedMocks.engineState.instances.length = 0;
  hoistedMocks.engineState.latest = null;
  hoistedMocks.vadState.instances.length = 0;
  hoistedMocks.vadState.latest = null;
  orbState = 'idle';
  orbWakeWordPaused = false;
  setOrbStateSpy.mockClear();
  setWakeWordPausedSpy.mockClear();
  triggerWakeBurstSpy.mockClear();

  loadModelsMock.mockClear();
  loadModelsMock.mockResolvedValue(loadModelsBytes);
  getPausedMock.mockClear();
  getPausedMock.mockResolvedValue(false);
  onPauseToggleMock.mockClear();
  onPauseToggleMock.mockImplementation(() => onPauseToggleUnsubscribeMock);
  onPauseToggleUnsubscribeMock.mockClear();
  loadWakeWordSessionsMock.mockClear();
  loadWakeWordSessionsMock.mockResolvedValue({ mel: {}, embed: {}, vad: {}, kw: {} });
  acquireMock.mockReset();
  acquireMock.mockImplementation(() => ({
    source: 'wakeword',
    releasedPreviousSource: null,
    startedAt: Date.now(),
  }));
  releaseMock.mockClear();
  getCurrentSourceMock.mockClear();
  getCurrentSourceMock.mockReturnValue('wakeword');
  sendAudioAndHandleMock.mockClear();
  sendAudioAndHandleMock.mockResolvedValue(undefined);
  addHumanMessageSpy.mockClear();
  addAgentMessageSpy.mockClear();
  setToastSpy.mockClear();
  registerTTSHooksMock.mockClear();
  getUserMediaMock.mockClear();
  getUserMediaMock.mockResolvedValue(mockStream);
  mediaTracks[0].stop.mockClear();

  // Stub only the jarvis property on the existing happy-dom window —
  // NÃO substituir o objeto window inteiro (isso aniquila document).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window.jarvis = {
    wakeWord: {
      loadModels: loadModelsMock,
      getPaused: getPausedMock,
      onPauseToggle: onPauseToggleMock,
    },
  };
  // Default matchMedia mock: prefers-reduced-motion = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false,
    media: '',
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  // Same for navigator — patch property, keep the DOM intact.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Object.defineProperty((globalThis as any).navigator ?? {}, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: getUserMediaMock },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ---------------- Tests ----------------

import { useWakeWord } from '../useWakeWord';

async function mountHook() {
  const result = renderHook(() => useWakeWord(), { wrapper });
  await act(async () => {
    // Flush async boot (loadModels → loadWakeWordSessions → getUserMedia → start → MicVAD.new)
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return result;
}

function latest() {
  const e = hoistedMocks.engineState.latest;
  if (!e) throw new Error('No engine instance');
  return e;
}

function latestVad() {
  const v = hoistedMocks.vadState.latest;
  if (!v) throw new Error('No VAD instance');
  return v;
}

describe('useWakeWord', () => {
  it('1. boot: loads models, creates engine, calls engine.start()', async () => {
    await mountHook();

    expect(loadModelsMock).toHaveBeenCalledTimes(1);
    expect(loadWakeWordSessionsMock).toHaveBeenCalledWith(loadModelsBytes);
    expect(hoistedMocks.engineState.instances).toHaveLength(1);
    expect(latest().startMock).toHaveBeenCalledTimes(1);
  });

  it('2. onDetected + state===idle → triggerWakeBurst + (after 350ms) acquire + setState(listening) + vad.start()', async () => {
    vi.useFakeTimers();
    const result = renderHook(() => useWakeWord(), { wrapper });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    orbState = 'idle';
    // Clear spies após boot — vad.start não deve ter sido chamado pelo boot
    setOrbStateSpy.mockClear();
    triggerWakeBurstSpy.mockClear();
    latestVad().startMock.mockClear();
    acquireMock.mockClear();

    act(() => {
      latest().__emitDetection(0.8);
    });

    // D-02: triggerWakeBurst é chamado imediatamente
    expect(triggerWakeBurstSpy).toHaveBeenCalledTimes(1);
    // acquire é chamado imediatamente também (dentro do onDetected)
    expect(acquireMock).toHaveBeenCalledWith('wakeword');
    // Mas setState('listening') só depois do delay 350ms
    expect(setOrbStateSpy).not.toHaveBeenCalledWith('listening');
    expect(latestVad().startMock).not.toHaveBeenCalled();

    // Avança 349ms — ainda não transicionou
    await act(async () => {
      await vi.advanceTimersByTimeAsync(349);
    });
    expect(setOrbStateSpy).not.toHaveBeenCalledWith('listening');

    // 1ms a mais → cruza o 350ms
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(setOrbStateSpy).toHaveBeenCalledWith('listening');
    expect(latestVad().startMock).toHaveBeenCalledTimes(1);

    result.unmount();
    vi.useRealTimers();
  });

  it('3. onDetected + state===responding → IGNORED (anti self-trigger)', async () => {
    const result = await mountHook();
    orbState = 'responding';
    // Forçar re-render para o hook capturar o novo state no stateRef
    result.rerender();
    await act(async () => {
      await Promise.resolve();
    });

    latestVad().startMock.mockClear();

    await act(async () => {
      latest().__emitDetection(0.9);
    });

    expect(acquireMock).not.toHaveBeenCalled();
    expect(setOrbStateSpy).not.toHaveBeenCalledWith('listening');
    expect(latestVad().startMock).not.toHaveBeenCalled();
  });

  it('4. voiceInputManager.acquire BUSY → no vad.start / no setState', async () => {
    await mountHook();
    orbState = 'idle';
    acquireMock.mockReturnValueOnce({ error: 'BUSY' });
    latestVad().startMock.mockClear();

    await act(async () => {
      latest().__emitDetection(0.8);
    });

    expect(acquireMock).toHaveBeenCalledWith('wakeword');
    expect(latestVad().startMock).not.toHaveBeenCalled();
    expect(setOrbStateSpy).not.toHaveBeenCalledWith('listening');
  });

  it('5. 6s absolute fallback (Phase 24 D-03): no speech → toast "Não ouvi nada" + release + setState(idle)', async () => {
    vi.useFakeTimers();
    const result = renderHook(() => useWakeWord(), { wrapper });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(hoistedMocks.engineState.instances).toHaveLength(1);
    orbState = 'idle';
    releaseMock.mockClear();
    setOrbStateSpy.mockClear();
    setToastSpy.mockClear();
    latestVad().startMock.mockClear();
    latestVad().pauseMock.mockClear();

    act(() => {
      latest().__emitDetection(0.8);
    });

    // burst delay primeiro (350ms)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(latestVad().startMock).toHaveBeenCalledTimes(1);
    expect(setOrbStateSpy).toHaveBeenCalledWith('listening');

    // depois os 6000ms do VAD max fallback
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(setToastSpy).toHaveBeenCalledWith({
      message: 'Não ouvi nada. Diga Hey JARVIS de novo.',
      variant: 'warning',
    });
    expect(latestVad().pauseMock).toHaveBeenCalled();
    expect(releaseMock).toHaveBeenCalledWith('wakeword');
    expect(setOrbStateSpy).toHaveBeenCalledWith('idle');

    result.unmount();
    vi.useRealTimers();
  });

  it('6. state change to non-idle → engine.suspend()', async () => {
    const result = renderHook(() => useWakeWord(), { wrapper });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hoistedMocks.engineState.latest).not.toBeNull();
    latest().suspendMock.mockClear();
    latest().resumeMock.mockClear();

    orbState = 'processing';
    result.rerender();
    await act(async () => {
      await Promise.resolve();
    });

    expect(latest().suspendMock).toHaveBeenCalled();
  });

  it('7. state back to idle → engine.resume()', async () => {
    orbState = 'responding';
    const result = renderHook(() => useWakeWord(), { wrapper });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    latest().resumeMock.mockClear();

    orbState = 'idle';
    result.rerender();
    await act(async () => {
      await Promise.resolve();
    });

    expect(latest().resumeMock).toHaveBeenCalled();
  });

  it('8. getUserMedia rejects with NotAllowedError → status=unavailable, no throw', async () => {
    const err = new Error('Permission denied');
    err.name = 'NotAllowedError';
    getUserMediaMock.mockRejectedValueOnce(err);

    const { result } = await mountHook();

    expect(result.current.status).toBe('unavailable');
    expect(result.current.error).toContain('Permission denied');
  });

  it('9. unmount → engine.stop() + vad.pause()', async () => {
    const { unmount } = await mountHook();
    const vadInstance = latestVad();
    expect(latest().stopMock).not.toHaveBeenCalled();
    // Phase 24: boot already calls pause() once to start in standby.
    const pauseCallsBeforeUnmount = vadInstance.pauseMock.mock.calls.length;
    unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(latest().stopMock).toHaveBeenCalled();
    expect(vadInstance.pauseMock.mock.calls.length).toBeGreaterThan(
      pauseCallsBeforeUnmount,
    );
  });

  it('10. registerTTSHooks: beforePlay suspends, afterPlay resumes', async () => {
    await mountHook();
    expect(registerTTSHooksMock).toHaveBeenCalled();
    // Last call with non-empty hooks (the cleanup call will be {} — pegamos
    // a primeira chamada com beforePlay definido).
    const callWithHooks = registerTTSHooksMock.mock.calls.find((c) => {
      const h = c[0] as { beforePlay?: unknown };
      return typeof h?.beforePlay === 'function';
    });
    expect(callWithHooks).toBeDefined();
    const hooks = callWithHooks![0] as {
      beforePlay?: () => Promise<void> | void;
      afterPlay?: () => Promise<void> | void;
    };
    expect(hooks.beforePlay).toBeTypeOf('function');
    expect(hooks.afterPlay).toBeTypeOf('function');

    latest().suspendMock.mockClear();
    latest().resumeMock.mockClear();

    await hooks.beforePlay!();
    expect(latest().suspendMock).toHaveBeenCalled();

    await hooks.afterPlay!();
    expect(latest().resumeMock).toHaveBeenCalled();
  });

  // ======================================================================
  // Phase 23 Plan 02 — Novos cenários (D-02, D-05, D-06)
  // ======================================================================

  describe('Phase 23 Plan 02 — D-06 pause/resume via tray', () => {
    it('11. boot: reads initialPaused via window.jarvis.wakeWord.getPaused()', async () => {
      getPausedMock.mockResolvedValueOnce(true);
      await mountHook();
      expect(getPausedMock).toHaveBeenCalledTimes(1);
      // Propaga o valor inicial para OrbContext.setWakeWordPaused
      expect(setWakeWordPausedSpy).toHaveBeenCalledWith(true);
    });

    it('12. boot: initialPaused=true → engine.suspend() imediato após start', async () => {
      getPausedMock.mockResolvedValueOnce(true);
      await mountHook();
      expect(latest().suspendMock).toHaveBeenCalled();
    });

    it('13. registers onPauseToggle listener and unsubscribes on unmount', async () => {
      const { unmount } = await mountHook();
      expect(onPauseToggleMock).toHaveBeenCalledTimes(1);
      unmount();
      await act(async () => {
        await Promise.resolve();
      });
      expect(onPauseToggleUnsubscribeMock).toHaveBeenCalled();
    });

    it('14. onPauseToggle callback com paused=true → setWakeWordPaused(true) + engine.suspend()', async () => {
      await mountHook();
      latest().suspendMock.mockClear();
      setWakeWordPausedSpy.mockClear();

      const cb = onPauseToggleMock.mock.calls[0][0] as (p: boolean) => void;
      await act(async () => {
        cb(true);
        await Promise.resolve();
      });

      expect(setWakeWordPausedSpy).toHaveBeenCalledWith(true);
      expect(latest().suspendMock).toHaveBeenCalled();
    });

    it('15. onPauseToggle callback com paused=false + state=idle → setWakeWordPaused(false) + engine.resume()', async () => {
      // Boot com paused=true
      getPausedMock.mockResolvedValueOnce(true);
      await mountHook();
      latest().resumeMock.mockClear();
      setWakeWordPausedSpy.mockClear();
      orbState = 'idle';

      const cb = onPauseToggleMock.mock.calls[0][0] as (p: boolean) => void;
      await act(async () => {
        cb(false);
        await Promise.resolve();
      });

      expect(setWakeWordPausedSpy).toHaveBeenCalledWith(false);
      expect(latest().resumeMock).toHaveBeenCalled();
    });

    it('16. onDetected ignored quando wakeWordPaused=true (gate do ref)', async () => {
      // Boot com paused=true
      getPausedMock.mockResolvedValueOnce(true);
      orbWakeWordPaused = true;
      await mountHook();

      orbState = 'idle';
      acquireMock.mockClear();
      triggerWakeBurstSpy.mockClear();
      setOrbStateSpy.mockClear();
      latestVad().startMock.mockClear();

      act(() => {
        latest().__emitDetection(0.9);
      });

      expect(acquireMock).not.toHaveBeenCalled();
      expect(triggerWakeBurstSpy).not.toHaveBeenCalled();
      expect(setOrbStateSpy).not.toHaveBeenCalledWith('listening');
      expect(latestVad().startMock).not.toHaveBeenCalled();
    });
  });

  describe('Phase 23 Plan 02 — D-02 triggerWakeBurst precede setState', () => {
    it('17. triggerWakeBurst chamado ANTES de setState(listening) no onDetected', async () => {
      vi.useFakeTimers();
      const result = renderHook(() => useWakeWord(), { wrapper });
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      orbState = 'idle';
      triggerWakeBurstSpy.mockClear();
      setOrbStateSpy.mockClear();

      act(() => {
        latest().__emitDetection(0.8);
      });

      // triggerWakeBurst é síncrono, setState('listening') ainda não
      expect(triggerWakeBurstSpy).toHaveBeenCalledTimes(1);
      expect(setOrbStateSpy).not.toHaveBeenCalledWith('listening');

      // Após o delay, setState rola
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
      expect(setOrbStateSpy).toHaveBeenCalledWith('listening');

      result.unmount();
      vi.useRealTimers();
    });
  });

  describe('Phase 23 Plan 02 — D-05 reduced-motion bypass', () => {
    it('18. onDetected com prefers-reduced-motion=true → setState(listening) imediato (sem 350ms)', async () => {
      // Stub matchMedia to return matches=true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).window.matchMedia = vi.fn().mockImplementation(() => ({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      vi.useFakeTimers();
      const result = renderHook(() => useWakeWord(), { wrapper });
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      orbState = 'idle';
      triggerWakeBurstSpy.mockClear();
      setOrbStateSpy.mockClear();
      latestVad().startMock.mockClear();

      act(() => {
        latest().__emitDetection(0.8);
      });

      // triggerWakeBurst ainda é chamado (o OrbContext internamente pode
      // ignorar a animação — é sua responsabilidade, não do hook)
      expect(triggerWakeBurstSpy).toHaveBeenCalledTimes(1);
      // MAS setState('listening') é síncrono — D-05 bypass
      expect(setOrbStateSpy).toHaveBeenCalledWith('listening');
      expect(latestVad().startMock).toHaveBeenCalledTimes(1);

      result.unmount();
      vi.useRealTimers();
    });
  });

  // ======================================================================
  // Phase 24 Plan 04 — VAD integration (fecha o gap do byte-discard)
  // ======================================================================

  describe('Phase 24 — VAD integration', () => {
    it('24-01. boot: instantiates MicVAD with baseAssetPath /vad/, onnxWASMBasePath /ort/, model legacy', async () => {
      await mountHook();
      expect(hoistedMocks.vadState.instances).toHaveLength(1);
      const opts = hoistedMocks.vadState.latest!.opts;
      expect(opts.baseAssetPath).toBe('/vad/');
      expect(opts.onnxWASMBasePath).toBe('/ort/');
      expect(opts.model).toBe('legacy');
      // A6: getStream é uma função — deve ser possível chamar sem re-prompt
      expect(typeof opts.getStream).toBe('function');
      // O stream retornado por getStream deve ser o mesmo mockStream do boot.
      const reused = await opts.getStream();
      expect(reused).toBe(mockStream);
    });

    it('24-02. boot: calls vad.pause() after construction (starts in standby)', async () => {
      await mountHook();
      // pause foi chamado pelo boot para iniciar em standby
      expect(latestVad().pauseMock).toHaveBeenCalled();
    });

    it('24-03. boot: overrides pauseStream to no-op (não mata o MediaStream compartilhado)', async () => {
      await mountHook();
      const opts = hoistedMocks.vadState.latest!.opts;
      expect(typeof opts.pauseStream).toBe('function');
      // Chamar pauseStream NÃO deve tocar os tracks do stream compartilhado.
      await opts.pauseStream(mockStream);
      expect(mediaTracks[0].stop).not.toHaveBeenCalled();
    });

    it('24-04. onDetected (state=idle): calls vad.start() after burst delay (not startRecording)', async () => {
      vi.useFakeTimers();
      const result = renderHook(() => useWakeWord(), { wrapper });
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      orbState = 'idle';
      latestVad().startMock.mockClear();

      act(() => {
        latest().__emitDetection(0.8);
      });
      // Não chamou antes do delay...
      expect(latestVad().startMock).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
      // ...chamou depois.
      expect(latestVad().startMock).toHaveBeenCalledTimes(1);

      result.unmount();
      vi.useRealTimers();
    });

    it('24-05. vad.onSpeechEnd: encodes Float32 → WAV → sendAudioAndHandle com os bytes + deps', async () => {
      await mountHook();
      orbState = 'idle';

      // Emit detection + proceed (skip burst delay por simplicidade — usa reduced motion)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).window.matchMedia = vi.fn().mockImplementation(() => ({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      // Re-mount to pick up reduced motion
      const result2 = renderHook(() => useWakeWord(), { wrapper });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      orbState = 'idle';

      act(() => {
        latest().__emitDetection(0.9);
      });
      // proceed() roda sync pelo bypass reduced-motion
      expect(latestVad().startMock).toHaveBeenCalled();

      // Emite speech end com um Float32Array conhecido.
      const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
      await act(async () => {
        await latestVad().__emitSpeechEnd(samples);
      });

      expect(sendAudioAndHandleMock).toHaveBeenCalledTimes(1);
      const [bytes, deps] = sendAudioAndHandleMock.mock.calls[0];
      // Bytes devem ser Uint8Array e ter 44 + 5*2 = 54 bytes (header + 10 bytes PCM)
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.byteLength).toBe(44 + samples.length * 2);
      // Header RIFF
      expect(
        String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]),
      ).toBe('RIFF');
      // Deps shape
      expect(typeof deps.setState).toBe('function');
      expect(typeof deps.setToast).toBe('function');
      expect(typeof deps.addHumanMessage).toBe('function');
      expect(typeof deps.addAgentMessage).toBe('function');

      result2.unmount();
    });

    it('24-06. vad.onSpeechEnd: calls vad.pause() BEFORE awaiting sendAudioAndHandle (release CPU asap)', async () => {
      // Resolver explícito controlado para observar a ordem das chamadas.
      let resolveSend!: () => void;
      sendAudioAndHandleMock.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveSend = resolve;
          }),
      );

      await mountHook();
      const vadInstance = latestVad();
      vadInstance.pauseMock.mockClear();

      const samples = new Float32Array([0, 0.5]);
      // Dispara o onSpeechEnd SEM aguardar (vamos observar que pause rodou
      // antes de sendAudioAndHandle resolver).
      let speechEndSettled = false;
      const p = vadInstance
        .__emitSpeechEnd(samples)
        .then(() => {
          speechEndSettled = true;
        });
      // Deixa o microtask do onSpeechEnd rodar até o primeiro await.
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      // pause DEVE ter sido chamado já — mesmo com sendAudioAndHandle ainda pendente.
      expect(vadInstance.pauseMock).toHaveBeenCalled();
      expect(sendAudioAndHandleMock).toHaveBeenCalledTimes(1);
      expect(speechEndSettled).toBe(false);

      // Libera o sendAudioAndHandle pra fechar o test cleanly.
      resolveSend();
      await act(async () => {
        await p;
      });
    });

    it('24-07. vad.onSpeechEnd: releases voiceInputManager após sendAudioAndHandle completar', async () => {
      await mountHook();
      releaseMock.mockClear();
      orbState = 'idle';

      await act(async () => {
        await latestVad().__emitSpeechEnd(new Float32Array([0.1]));
      });

      expect(sendAudioAndHandleMock).toHaveBeenCalledTimes(1);
      expect(releaseMock).toHaveBeenCalledWith('wakeword');
    });

    it('24-08. 6s max fallback: cleared when onSpeechEnd fires first (no false toast)', async () => {
      vi.useFakeTimers();
      const result = renderHook(() => useWakeWord(), { wrapper });
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      orbState = 'idle';
      setToastSpy.mockClear();

      act(() => {
        latest().__emitDetection(0.8);
      });
      // burst delay
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
      // 3s depois do start, emit speech end — deve cancelar o fallback
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      await act(async () => {
        await latestVad().__emitSpeechEnd(new Float32Array([0.1]));
      });
      // Avança MAIS 6s — se o fallback não tivesse sido limpo, o toast seria emitido aqui
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });

      // Toast "Não ouvi nada" NÃO deve ter sido emitido — speech end limpou o fallback.
      const calledWithSilentToast = setToastSpy.mock.calls.some((call) => {
        const arg = call[0] as { message?: string } | null;
        return (
          arg?.message === 'Não ouvi nada. Diga Hey JARVIS de novo.'
        );
      });
      expect(calledWithSilentToast).toBe(false);

      result.unmount();
      vi.useRealTimers();
    });

    it('24-09. unmount limpa o vadMaxTimeoutRef e chama vad.pause() (belt and braces)', async () => {
      vi.useFakeTimers();
      const result = renderHook(() => useWakeWord(), { wrapper });
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      orbState = 'idle';

      // Dispara detection pra armar o 6s fallback
      act(() => {
        latest().__emitDetection(0.8);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });

      const vadInstance = latestVad();
      const pauseCallsBefore = vadInstance.pauseMock.mock.calls.length;

      result.unmount();
      await act(async () => {
        await Promise.resolve();
      });

      // pause foi chamado pelo cleanup (uma a mais do que antes do unmount)
      expect(vadInstance.pauseMock.mock.calls.length).toBeGreaterThan(
        pauseCallsBefore,
      );

      // Avança além do 6s — o setTimeout já foi limpo no cleanup, o toast não rola.
      setToastSpy.mockClear();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6100);
      });
      expect(setToastSpy).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('24-10. useWakeWord NÃO importa useAudioRecorder (byte-discard gap closed)', async () => {
      // Regression guard — este teste existe pra travar o contrato de
      // "VAD owns recording, useAudioRecorder deixou de ser wireado no
      // fluxo wake word" (PTT continua usando via ChatInput).
      const source = await import('../useWakeWord');
      const fnSource = source.useWakeWord.toString();
      // O código transpilado do hook não deve referenciar useAudioRecorder
      // nem stopRecording/startRecording (VAD owns the stream agora).
      expect(fnSource).not.toMatch(/audioRecorder\.(start|stop)Recording/);
      expect(fnSource).not.toMatch(/useAudioRecorder/);
    });
  });
});
