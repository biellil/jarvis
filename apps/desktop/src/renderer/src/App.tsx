import { useEffect } from 'react';
import { OrbProvider, Orb } from '@renderer/components/Orb';
import { ChatProvider } from './chat/ChatContext';
import { stopTTSPlayback } from './audio/ttsPlayer';
import { useWakeWord } from '../hooks/useWakeWord';
import { useMultiTurnWindow } from '../hooks/useMultiTurnWindow';
import './App.css';

/**
 * Root Application Component
 * v1.4: Avatar mode — 160x160 window, only the glass orb visible.
 * ChatInput/history moved to v1.4 expanded interaction design.
 *
 * Phase 22 Plan 04: useWakeWord() é montado DENTRO do OrbProvider —
 * o hook consome useOrbContext() e precisa do provider no árvore acima.
 *
 * Phase 28 Plan 02: useMultiTurnWindow() wired to VAD from useWakeWord —
 * shares MediaStream, triggers after TTS via registerTTSHooks.
 */
function AppContent() {
  // Phase 22 Plan 04: boot wake word engine (idempotent, self-degrade em fail)
  const wakeWordState = useWakeWord();

  // Phase 28 Plan 02: multi-turn follow-up window (D-01: reuses VAD from wake word)
  const multiTurnEnabled = (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const env = (import.meta as any)?.env;
      return env?.VITE_MULTI_TURN_ENABLED !== 'false';
    } catch {
      return true; // Default enabled
    }
  })();

  const windowMs = (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const env = (import.meta as any)?.env;
      const val = env?.VITE_MULTI_TURN_WINDOW_MS;
      return val ? parseInt(val, 10) : 8000;
    } catch {
      return 8000; // Default 8 seconds
    }
  })();

  useMultiTurnWindow({
    vadInstance: wakeWordState.vadInstance,
    enabled: multiTurnEnabled,
    windowMs,
  });

  useEffect(() => {
    return () => {
      stopTTSPlayback();
    };
  }, []);

  return (
    <div
      className="h-screen w-screen flex items-center justify-center"
      style={{ background: 'transparent' } as React.CSSProperties}
      onMouseEnter={() => window.jarvis.setIgnoreMouseEvents?.(false)}
      onMouseLeave={() => window.jarvis.setIgnoreMouseEvents?.(true)}
    >
      <div className="app-container">
        <div
          style={{ WebkitAppRegion: 'drag', cursor: 'grab' } as React.CSSProperties}
          onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.cursor = 'grabbing'; }}
          onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.cursor = 'grab'; }}
        >
          <Orb />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ChatProvider>
      <OrbProvider>
        <AppContent />
      </OrbProvider>
    </ChatProvider>
  );
}
