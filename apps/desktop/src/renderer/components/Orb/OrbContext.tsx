import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { VoiceMode } from '../../../shared/ipc-types';

// Type per D-11 in CONTEXT.md (original v1.2)
// Phase 28 extends to 5 states (D-09): adds 'awaiting-followup' for post-TTS listening window
export type OrbState = 'idle' | 'listening' | 'processing' | 'responding' | 'awaiting-followup';

/**
 * OrbContext value surface.
 *
 * Phase 23 extends the original state/setState pair with two new concerns
 * (see .planning/phases/23-orb-ux-polish/23-CONTEXT.md):
 *
 *   D-01  wakeWordPaused — toggled by the tray kill switch. When true AND
 *         the orb is idle, Orb.tsx renders a subdued paused visual
 *         (opacity 0.6, smaller/softer glow, muted inner border).
 *         `wakeWordPaused` is IGNORED when state !== 'idle' — during
 *         listening/processing/responding the normal visuals win.
 *
 *   D-02  burstActive + triggerWakeBurst() — a 350 ms one-shot pulse that
 *         drives the `animate-wake-burst` class on the orb root plus an
 *         amber ring overlay. Calling triggerWakeBurst() re-arms the
 *         timeout (useful if two wake word hits arrive back-to-back), and
 *         the pending timeout is cleared on unmount so no setState fires
 *         on a dead component.
 */
interface OrbContextValue {
  state: OrbState;
  setState: (newState: OrbState) => void;
  wakeWordPaused: boolean;
  setWakeWordPaused: (paused: boolean) => void;
  burstActive: boolean;
  triggerWakeBurst: () => void;
  // Phase 42 (VUI-02, VUI-03): current voice mode — drives idle color and badge
  voiceMode: VoiceMode;
  setVoiceMode: (mode: VoiceMode) => void;
}

const OrbContext = createContext<OrbContextValue | undefined>(undefined);

const BURST_DURATION_MS = 350;

export function OrbProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OrbState>('idle');
  const [wakeWordPaused, setWakeWordPaused] = useState<boolean>(false); // D-04 default
  const [burstActive, setBurstActive] = useState<boolean>(false);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('wake-word');

  const burstTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerWakeBurst = useCallback(() => {
    if (burstTimeoutRef.current !== null) {
      clearTimeout(burstTimeoutRef.current);
    }
    setBurstActive(true);
    burstTimeoutRef.current = setTimeout(() => {
      setBurstActive(false);
      burstTimeoutRef.current = null;
    }, BURST_DURATION_MS);
  }, []);

  // Cleanup pending timeout on unmount so we never setState on a dead tree.
  useEffect(() => {
    return () => {
      if (burstTimeoutRef.current !== null) {
        clearTimeout(burstTimeoutRef.current);
        burstTimeoutRef.current = null;
      }
    };
  }, []);

  // Phase 42 (VUI-02, VUI-03): subscribe to voice mode changes from main process
  useEffect(() => {
    void window.jarvis?.voiceMode?.getMode().then((m) => {
      if (m) setVoiceMode(m);
    });
    const unsub = window.jarvis?.voiceMode?.onChange((evt) => {
      setVoiceMode(evt.newMode);
    });
    return () => {
      unsub?.();
    };
  }, []);

  return (
    <OrbContext.Provider
      value={{
        state,
        setState,
        wakeWordPaused,
        setWakeWordPaused,
        burstActive,
        triggerWakeBurst,
        voiceMode,
        setVoiceMode,
      }}
    >
      {children}
    </OrbContext.Provider>
  );
}

export function useOrbContext() {
  const context = useContext(OrbContext);
  if (context === undefined) {
    throw new Error('useOrbContext must be used within OrbProvider');
  }
  return context;
}
