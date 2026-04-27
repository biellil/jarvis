import { useEffect } from 'react';
import { OrbProvider, Orb } from '@renderer/components/Orb';
import { ChatProvider, useChat } from './chat/ChatContext';
import { Toast } from './components/Toast';
import { stopTTSPlayback } from './audio/ttsPlayer';
import { useWakeWord } from '../hooks/useWakeWord';
import { useMultiTurnWindow } from '../hooks/useMultiTurnWindow';
import { IPC_CHANNELS } from '../../shared/ipc-types';
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

  // Phase 44 (VHARD-01, D-04): toast global do ChatContext
  const { toast, setToast } = useChat();

  // Phase 44 (VHARD-01, D-04): escuta voice-mode:switch-result para exibir toast
  // de permissão negada com botão "Abrir System Settings"
  useEffect(() => {
    const handleSwitchResult = (
      _event: unknown,
      result: { success: boolean; blockedReason?: string; settingsUrl?: string },
    ) => {
      if (!result.success && result.blockedReason === 'mic-permission-denied') {
        setToast({
          message: 'Microfone negado — abrir configurações?',
          variant: 'warning',
          action: {
            label: 'Abrir System Settings',
            onClick: () => window.jarvis.openSystemSettings?.(),
          },
        });
      }
    };

    window.jarvis?.ipcRenderer?.on(IPC_CHANNELS.VOICE_MODE_SWITCH_RESULT, handleSwitchResult);
    return () => {
      window.jarvis?.ipcRenderer?.off(IPC_CHANNELS.VOICE_MODE_SWITCH_RESULT, handleSwitchResult);
    };
  }, [setToast]);

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
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          action={toast.action}
          autoCloseMs={toast.action ? 0 : undefined}
          onClose={() => setToast(null)}
        />
      )}
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
