/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { OrbProvider, useOrbContext } from '../OrbContext';
import type { ReactNode } from 'react';
import type { VoiceMode } from '../../../../../shared/ipc-types';

describe('OrbContext', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <OrbProvider>{children}</OrbProvider>
  );

  beforeEach(() => {
    vi.stubGlobal('jarvis', {
      voiceMode: {
        getMode: vi.fn().mockResolvedValue('wake-word'),
        onChange: vi.fn().mockReturnValue(() => {}),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ─── Pre-existing state coverage (v1.2 regression) ────────────────────

  it('initializes with idle state (ORB-01)', () => {
    const { result } = renderHook(() => useOrbContext(), { wrapper });
    expect(result.current.state).toBe('idle');
  });

  it('transitions to listening state (ORB-02)', () => {
    const { result } = renderHook(() => useOrbContext(), { wrapper });

    act(() => {
      result.current.setState('listening');
    });

    expect(result.current.state).toBe('listening');
  });

  it('transitions to processing state (ORB-03)', () => {
    const { result } = renderHook(() => useOrbContext(), { wrapper });

    act(() => {
      result.current.setState('processing');
    });

    expect(result.current.state).toBe('processing');
  });

  it('transitions to responding state (ORB-04)', () => {
    const { result } = renderHook(() => useOrbContext(), { wrapper });

    act(() => {
      result.current.setState('responding');
    });

    expect(result.current.state).toBe('responding');
  });

  it('throws error when useOrbContext is used outside provider', () => {
    // Suppress console.error for this test
    const originalError = console.error;
    console.error = () => {};

    expect(() => {
      renderHook(() => useOrbContext());
    }).toThrow('useOrbContext must be used within OrbProvider');

    console.error = originalError;
  });

  it('maintains state across multiple consumers', () => {
    const { result: result1 } = renderHook(() => useOrbContext(), { wrapper });
    const { result: result2 } = renderHook(() => useOrbContext(), { wrapper });

    act(() => {
      result1.current.setState('processing');
    });

    expect(result1.current.state).toBe('processing');
    expect(result2.current.state).toBe('idle'); // Different wrapper instances
  });

  // ─── Phase 23 — wakeWordPaused (D-01 + D-04) ──────────────────────────

  describe('wakeWordPaused (D-01 + D-04)', () => {
    it('default value of wakeWordPaused is false (D-04)', () => {
      const { result } = renderHook(() => useOrbContext(), { wrapper });
      expect(result.current.wakeWordPaused).toBe(false);
    });

    it('setWakeWordPaused(true) flips the flag', () => {
      const { result } = renderHook(() => useOrbContext(), { wrapper });

      act(() => {
        result.current.setWakeWordPaused(true);
      });

      expect(result.current.wakeWordPaused).toBe(true);
    });

    it('setWakeWordPaused accepts false back (bidirectional toggle)', () => {
      const { result } = renderHook(() => useOrbContext(), { wrapper });

      act(() => {
        result.current.setWakeWordPaused(true);
      });
      expect(result.current.wakeWordPaused).toBe(true);

      act(() => {
        result.current.setWakeWordPaused(false);
      });
      expect(result.current.wakeWordPaused).toBe(false);
    });
  });

  // ─── Phase 23 — burst lifecycle (D-02) ────────────────────────────────

  describe('triggerWakeBurst (D-02)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('default value of burstActive is false', () => {
      const { result } = renderHook(() => useOrbContext(), { wrapper });
      expect(result.current.burstActive).toBe(false);
    });

    it('triggerWakeBurst() sets burstActive=true immediately', () => {
      const { result } = renderHook(() => useOrbContext(), { wrapper });

      act(() => {
        result.current.triggerWakeBurst();
      });

      expect(result.current.burstActive).toBe(true);
    });

    it('triggerWakeBurst() clears burstActive after 350ms', () => {
      const { result } = renderHook(() => useOrbContext(), { wrapper });

      act(() => {
        result.current.triggerWakeBurst();
      });
      expect(result.current.burstActive).toBe(true);

      act(() => {
        vi.advanceTimersByTime(350);
      });

      expect(result.current.burstActive).toBe(false);
    });

    it('burst still active just before 350ms cutoff', () => {
      const { result } = renderHook(() => useOrbContext(), { wrapper });

      act(() => {
        result.current.triggerWakeBurst();
      });

      act(() => {
        vi.advanceTimersByTime(349);
      });

      expect(result.current.burstActive).toBe(true);
    });

    it('re-triggering within 350ms cancels previous timeout and extends window', () => {
      const { result } = renderHook(() => useOrbContext(), { wrapper });

      act(() => {
        result.current.triggerWakeBurst();
      });

      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(result.current.burstActive).toBe(true);

      // Re-trigger — old timeout must be cleared, new 350ms window starts here
      act(() => {
        result.current.triggerWakeBurst();
      });

      // After another 200ms we're at total=400ms but only 200ms since re-trigger
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(result.current.burstActive).toBe(true);

      // And after another 150ms (350ms since re-trigger) it clears
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(result.current.burstActive).toBe(false);
    });

    it('unmount clears pending timeout (no state update after unmount)', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result, unmount } = renderHook(() => useOrbContext(), { wrapper });

      act(() => {
        result.current.triggerWakeBurst();
      });

      unmount();

      // If cleanup is missing, advancing timers would fire setState on
      // unmounted component and React would log an error.
      act(() => {
        vi.advanceTimersByTime(350);
      });

      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  // ─── Phase 42 — voiceMode (VUI-02, VUI-03) ────────────────────────────

  describe('voiceMode (VUI-02, VUI-03)', () => {
    it('exposes voiceMode default as wake-word before getMode resolves', () => {
      const { result } = renderHook(() => useOrbContext(), { wrapper });
      // Synchronous check before the async getMode promise resolves
      expect(result.current.voiceMode).toBe('wake-word');
    });

    it('calls window.jarvis.voiceMode.getMode() on mount', async () => {
      renderHook(() => useOrbContext(), { wrapper });
      await act(async () => {});
      expect(window.jarvis.voiceMode.getMode).toHaveBeenCalledOnce();
    });

    it('updates voiceMode when getMode() resolves to always-listening', async () => {
      (window.jarvis.voiceMode.getMode as ReturnType<typeof vi.fn>).mockResolvedValue('always-listening');
      const { result } = renderHook(() => useOrbContext(), { wrapper });
      await act(async () => {});
      expect(result.current.voiceMode).toBe('always-listening');
    });

    it('subscribes to onChange on mount', async () => {
      renderHook(() => useOrbContext(), { wrapper });
      await act(async () => {});
      expect(window.jarvis.voiceMode.onChange).toHaveBeenCalledOnce();
    });

    it('updates voiceMode when onChange fires with ptt-only', async () => {
      let capturedCb: ((evt: { oldMode: string; newMode: string }) => void) | undefined;
      (window.jarvis.voiceMode.onChange as ReturnType<typeof vi.fn>).mockImplementation((cb: (evt: { oldMode: string; newMode: string }) => void) => {
        capturedCb = cb;
        return () => {};
      });

      const { result } = renderHook(() => useOrbContext(), { wrapper });
      await act(async () => {});

      act(() => {
        capturedCb?.({ oldMode: 'wake-word', newMode: 'ptt-only' });
      });

      expect(result.current.voiceMode).toBe('ptt-only');
    });

    it('calls the unsub function returned by onChange on unmount', async () => {
      const unsubMock = vi.fn();
      (window.jarvis.voiceMode.onChange as ReturnType<typeof vi.fn>).mockReturnValue(unsubMock);

      const { unmount } = renderHook(() => useOrbContext(), { wrapper });
      await act(async () => {});

      unmount();
      expect(unsubMock).toHaveBeenCalledOnce();
    });
  });
});
