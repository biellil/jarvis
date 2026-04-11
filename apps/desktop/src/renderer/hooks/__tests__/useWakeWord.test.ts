/**
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
import { render, renderHook, act, waitFor } from '@testing-library/react';

// ---------------- Mocks ----------------

const mockEngineInstances: MockEngine[] = [];
let latestEngine: MockEngine | null = null;

interface MockEngineOpts {
  threshold: number;
  debounceMs: number;
  vadThreshold: number;
  onDetected: (score: number) => void;
  onSilentStream?: () => void;
}

class MockEngine {
  public opts: MockEngineOpts;
  public startMock = vi.fn().mockResolvedValue(undefined);
  public suspendMock = vi.fn().mockResolvedValue(undefined);
  public resumeMock = vi.fn().mockResolvedValue(undefined);
  public stopMock = vi.fn().mockResolvedValue(undefined);

  constructor(opts: MockEngineOpts) {
    this.opts = opts;
    mockEngineInstances.push(this);
    latestEngine = this;
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

  // Test helper — simulate detection
  __emitDetection(score: number): void {
    this.opts.onDetected(score);
  }
}

vi.mock('../../src/voice/wakeWord/WakeWordEngine', () => ({
  WakeWordEngine: MockEngine,
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

// ---------------- Global stubs ----------------

const loadModelsBytes = {
  mel: new Uint8Array([1]),
  embed: new Uint8Array([2]),
  vad: new Uint8Array([3]),
  kw: new Uint8Array([4]),
};
const loadModelsMock = vi.fn().mockResolvedValue(loadModelsBytes);

const mediaTracks = [{ stop: vi.fn() }];
const mockStream = { getTracks: () => mediaTracks };
const getUserMediaMock = vi.fn().mockResolvedValue(mockStream);

// ---------------- Test harness ----------------
// Lightweight OrbContext stand-in — avoid importing the real one because
// React setState batching + re-renders make assertions noisy. We expose a
// mutable state ref that tests can drive directly, and the hook consumes it
// via useOrbContext() (also mocked below).

let orbState: 'idle' | 'listening' | 'processing' | 'responding' = 'idle';
const setOrbStateSpy = vi.fn((s: typeof orbState) => {
  orbState = s;
});

vi.mock('../../components/Orb/OrbContext', () => ({
  useOrbContext: () => ({ state: orbState, setState: setOrbStateSpy }),
  OrbProvider: ({ children }: { children: ReactNode }) => children,
}));

function wrapper({ children }: { children: ReactNode }) {
  return React.createElement(React.Fragment, null, children);
}

beforeEach(() => {
  mockEngineInstances.length = 0;
  latestEngine = null;
  orbState = 'idle';
  setOrbStateSpy.mockClear();

  loadModelsMock.mockClear();
  loadModelsMock.mockResolvedValue(loadModelsBytes);
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
  startRecordingMock.mockClear();
  stopRecordingMock.mockClear();
  registerTTSHooksMock.mockClear();
  getUserMediaMock.mockClear();
  getUserMediaMock.mockResolvedValue(mockStream);
  mediaTracks[0].stop.mockClear();

  vi.stubGlobal('window', {
    jarvis: {
      wakeWord: {
        loadModels: loadModelsMock,
      },
    },
  });
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: getUserMediaMock,
    },
  });
  vi.stubGlobal('import', undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ---------------- Tests ----------------

// Import AFTER all mocks are defined (ESM hoisting means vi.mock is hoisted,
// but import order still matters for the real module bindings).
import { useWakeWord } from '../useWakeWord';

async function mountHook() {
  const result = renderHook(() => useWakeWord(), { wrapper });
  // Flush the async boot() inside useEffect — two microtask flushes cover
  // loadModels → loadWakeWordSessions → getUserMedia → engine.start.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return result;
}

describe('useWakeWord', () => {
  it('1. boot: loads models, creates engine, calls engine.start()', async () => {
    await mountHook();

    expect(loadModelsMock).toHaveBeenCalledTimes(1);
    expect(loadWakeWordSessionsMock).toHaveBeenCalledWith(loadModelsBytes);
    expect(mockEngineInstances).toHaveLength(1);
    expect(latestEngine!.startMock).toHaveBeenCalledTimes(1);
  });

  it('2. onDetected + state===idle → acquire + setState(listening) + startRecording', async () => {
    await mountHook();
    orbState = 'idle';

    await act(async () => {
      latestEngine!.__emitDetection(0.8);
    });

    expect(acquireMock).toHaveBeenCalledWith('wakeword');
    expect(setOrbStateSpy).toHaveBeenCalledWith('listening');
    expect(startRecordingMock).toHaveBeenCalledTimes(1);
  });

  it('3. onDetected + state===responding → IGNORED (anti self-trigger)', async () => {
    await mountHook();
    orbState = 'responding';

    await act(async () => {
      latestEngine!.__emitDetection(0.9);
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
      latestEngine!.__emitDetection(0.8);
    });

    expect(acquireMock).toHaveBeenCalledWith('wakeword');
    expect(startRecordingMock).not.toHaveBeenCalled();
    expect(setOrbStateSpy).not.toHaveBeenCalledWith('listening');
  });

  it('5. VAD timeout 3000ms → stopRecording + release + setState(idle)', async () => {
    vi.useFakeTimers();
    // mountHook needs real timers for the await Promise.resolve() loop —
    // use fake timers only AFTER boot.
    const result = renderHook(() => useWakeWord(), { wrapper });
    // Advance microtasks — with fake timers we just run all pending.
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockEngineInstances).toHaveLength(1);
    orbState = 'idle';
    startRecordingMock.mockClear();
    stopRecordingMock.mockClear();
    releaseMock.mockClear();
    setOrbStateSpy.mockClear();

    act(() => {
      latestEngine!.__emitDetection(0.8);
    });

    expect(startRecordingMock).toHaveBeenCalledTimes(1);
    expect(setOrbStateSpy).toHaveBeenCalledWith('listening');

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
    });

    expect(latestEngine).not.toBeNull();
    latestEngine!.suspendMock.mockClear();
    latestEngine!.resumeMock.mockClear();

    orbState = 'processing';
    result.rerender();
    await act(async () => {
      await Promise.resolve();
    });

    expect(latestEngine!.suspendMock).toHaveBeenCalled();
  });

  it('7. state back to idle → engine.resume()', async () => {
    orbState = 'responding';
    const result = renderHook(() => useWakeWord(), { wrapper });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    latestEngine!.resumeMock.mockClear();

    orbState = 'idle';
    result.rerender();
    await act(async () => {
      await Promise.resolve();
    });

    expect(latestEngine!.resumeMock).toHaveBeenCalled();
  });

  it('8. engine.start() rejects with NotAllowedError → status=unavailable, no throw', async () => {
    // Make getUserMedia reject
    const err = new Error('Permission denied');
    err.name = 'NotAllowedError';
    getUserMediaMock.mockRejectedValueOnce(err);

    const { result } = await mountHook();

    expect(result.current.status).toBe('unavailable');
    expect(result.current.error).toContain('Permission denied');
  });

  it('9. unmount → engine.stop() is called', async () => {
    const { unmount } = await mountHook();
    expect(latestEngine!.stopMock).not.toHaveBeenCalled();
    unmount();
    // Cleanup runs microtasks — give it a tick.
    await act(async () => {
      await Promise.resolve();
    });
    expect(latestEngine!.stopMock).toHaveBeenCalled();
  });

  it('10. registerTTSHooks: beforePlay suspends, afterPlay resumes', async () => {
    await mountHook();
    expect(registerTTSHooksMock).toHaveBeenCalled();
    const lastCall = registerTTSHooksMock.mock.calls.at(-1)!;
    const hooks = lastCall[0] as {
      beforePlay?: () => Promise<void> | void;
      afterPlay?: () => Promise<void> | void;
    };
    expect(hooks.beforePlay).toBeTypeOf('function');
    expect(hooks.afterPlay).toBeTypeOf('function');

    latestEngine!.suspendMock.mockClear();
    latestEngine!.resumeMock.mockClear();

    await hooks.beforePlay!();
    expect(latestEngine!.suspendMock).toHaveBeenCalled();

    await hooks.afterPlay!();
    expect(latestEngine!.resumeMock).toHaveBeenCalled();
  });
});
