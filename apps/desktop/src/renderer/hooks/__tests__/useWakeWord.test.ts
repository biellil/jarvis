/**
 * @vitest-environment happy-dom
 *
 * useWakeWord tests — Phase 22 Plan 04
 *
 * Cobre os 10 cenários do <behavior> block do PLAN 22-04:
 *   1. Boot: loadModels → loadWakeWordSessions → new WakeWordEngine → engine.start()
 *   2. onDetected + state===idle → acquire('wakeword') + setState('listening') + startRecording()
 *   3. onDetected + state===responding → IGNORADO (gate anti self-trigger)
 *   4. voiceInputManager.acquire retorna BUSY → nenhum startRecording nem setState
 *   5. VAD timeout 3000ms → stopRecording + release + setState('idle')
 *   6. state → 'responding'/'processing'/'listening' → engine.suspend()
 *   7. state → 'idle' → engine.resume()
 *   8. engine.start rejeita com NotAllowedError → status='unavailable', no throw
 *   9. unmount → engine.stop()
 *  10. registerTTSHooks: beforePlay suspende, afterPlay resume
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
      state.instances.push(this);
      state.latest = this;
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

  const state: {
    instances: MockEngineLocal[];
    latest: MockEngineLocal | null;
  } = {
    instances: [],
    latest: null,
  };

  return { state, MockEngineLocal };
});

vi.mock('../../src/voice/wakeWord/WakeWordEngine', () => ({
  WakeWordEngine: hoistedMocks.MockEngineLocal,
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

const acquireMock = vi.fn();
const releaseMock = vi.fn();
const getCurrentSourceMock = vi.fn(() => null);
vi.mock('../../src/voice/voiceInputManager', () => ({
  voiceInputManager: {
    acquire: (src: string) => acquireMock(src),
    release: (src: string) => releaseMock(src),
    getCurrentSource: () => getCurrentSourceMock(),
    subscribe: vi.fn(() => () => undefined),
  },
}));

const startRecordingMock = vi.fn().mockResolvedValue(undefined);
const stopRecordingMock = vi.fn().mockResolvedValue(null);
vi.mock('../useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    isRecording: false,
    error: null,
    startRecording: startRecordingMock,
    stopRecording: stopRecordingMock,
  }),
}));

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
  hoistedMocks.state.instances.length = 0;
  hoistedMocks.state.latest = null;
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
  startRecordingMock.mockClear();
  stopRecordingMock.mockClear();
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
    // Flush async boot (loadModels → loadWakeWordSessions → getUserMedia → start)
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return result;
}

function latest() {
  const e = hoistedMocks.state.latest;
  if (!e) throw new Error('No engine instance');
  return e;
}

describe('useWakeWord', () => {
  it('1. boot: loads models, creates engine, calls engine.start()', async () => {
    await mountHook();

    expect(loadModelsMock).toHaveBeenCalledTimes(1);
    expect(loadWakeWordSessionsMock).toHaveBeenCalledWith(loadModelsBytes);
    expect(hoistedMocks.state.instances).toHaveLength(1);
    expect(latest().startMock).toHaveBeenCalledTimes(1);
  });

  it('2. onDetected + state===idle → triggerWakeBurst + (after 350ms) acquire + setState(listening) + startRecording', async () => {
    vi.useFakeTimers();
    const result = renderHook(() => useWakeWord(), { wrapper });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    orbState = 'idle';
    // Clear spies após boot — startRecording não deve ter sido chamado pelo boot
    setOrbStateSpy.mockClear();
    triggerWakeBurstSpy.mockClear();
    startRecordingMock.mockClear();
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
    expect(startRecordingMock).not.toHaveBeenCalled();

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
    expect(startRecordingMock).toHaveBeenCalledTimes(1);

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

    await act(async () => {
      latest().__emitDetection(0.9);
    });

    expect(acquireMock).not.toHaveBeenCalled();
    expect(setOrbStateSpy).not.toHaveBeenCalledWith('listening');
    expect(startRecordingMock).not.toHaveBeenCalled();
  });

  it('4. voiceInputManager.acquire BUSY → no startRecording / no setState', async () => {
    await mountHook();
    orbState = 'idle';
    acquireMock.mockReturnValueOnce({ error: 'BUSY' });

    await act(async () => {
      latest().__emitDetection(0.8);
    });

    expect(acquireMock).toHaveBeenCalledWith('wakeword');
    expect(startRecordingMock).not.toHaveBeenCalled();
    expect(setOrbStateSpy).not.toHaveBeenCalledWith('listening');
  });

  it('5. VAD timeout 3000ms (after the 350ms burst delay) → stopRecording + release + setState(idle)', async () => {
    vi.useFakeTimers();
    const result = renderHook(() => useWakeWord(), { wrapper });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(hoistedMocks.state.instances).toHaveLength(1);
    orbState = 'idle';
    startRecordingMock.mockClear();
    stopRecordingMock.mockClear();
    releaseMock.mockClear();
    setOrbStateSpy.mockClear();

    act(() => {
      latest().__emitDetection(0.8);
    });

    // burst delay primeiro (350ms)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(startRecordingMock).toHaveBeenCalledTimes(1);
    expect(setOrbStateSpy).toHaveBeenCalledWith('listening');

    // depois os 3000ms do VAD
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(stopRecordingMock).toHaveBeenCalledTimes(1);
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
    });

    expect(hoistedMocks.state.latest).not.toBeNull();
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

  it('9. unmount → engine.stop() is called', async () => {
    const { unmount } = await mountHook();
    expect(latest().stopMock).not.toHaveBeenCalled();
    unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(latest().stopMock).toHaveBeenCalled();
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

      act(() => {
        latest().__emitDetection(0.9);
      });

      expect(acquireMock).not.toHaveBeenCalled();
      expect(triggerWakeBurstSpy).not.toHaveBeenCalled();
      expect(setOrbStateSpy).not.toHaveBeenCalledWith('listening');
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
      startRecordingMock.mockClear();

      act(() => {
        latest().__emitDetection(0.8);
      });

      // triggerWakeBurst ainda é chamado (o OrbContext internamente pode
      // ignorar a animação — é sua responsabilidade, não do hook)
      expect(triggerWakeBurstSpy).toHaveBeenCalledTimes(1);
      // MAS setState('listening') é síncrono — D-05 bypass
      expect(setOrbStateSpy).toHaveBeenCalledWith('listening');
      expect(startRecordingMock).toHaveBeenCalledTimes(1);

      result.unmount();
      vi.useRealTimers();
    });
  });
});
