import { useEffect, useState } from 'react';
import { OrbProvider, Orb } from '@renderer/components/Orb';
import { ChatProvider, useChat } from './chat/ChatContext';
import { Toast } from './components/Toast';
import { stopTTSPlayback } from './audio/ttsPlayer';
import { wireStreamingTtsListeners } from './audio/streamingTtsPlayer';
import { useWakeWord } from '../hooks/useWakeWord';
import { useMultiTurnWindow } from '../hooks/useMultiTurnWindow';
import { usePttHandler } from '../hooks/usePttHandler';
import { useActionConfirmation } from './hooks/useActionConfirmation';
import { IPC_CHANNELS, type VoiceMode, type VoiceModeSwitchResult } from '../../shared/ipc-types';
import './App.css';

// ============================================================
// ActionConfirmationToast — Phase 54 (LACT-06)
// Exported for renderer tests (confirmation-toast.test.tsx).
// ============================================================

interface ActionConfirmationToastProps {
  action: string;
  path: string;
  requestId: string;
  onConfirm: () => void;
  onDeny: () => void;
  onTimeout: () => void;
}

export function ActionConfirmationToast({
  action,
  path,
  onConfirm,
  onDeny,
  onTimeout,
}: ActionConfirmationToastProps) {
  useEffect(() => {
    const t = setTimeout(onTimeout, 10_000); // D-12: 10s timeout
    return () => clearTimeout(t);
  }, [onTimeout]);

  const label =
    action === 'openFolder' ? 'abrir pasta'
    : action === 'openFile' ? 'abrir arquivo'
    : action === 'closeFile' ? 'fechar'
    : action === 'deleteFile' ? 'deletar'
    : action === 'moveFile' ? 'mover'
    : action === 'renameFile' ? 'renomear'
    : 'ver conteúdo de';

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '12px 20px',
        borderRadius: 8,
        background: '#1e40af',
        color: 'white',
        zIndex: 9999,
        maxWidth: 440,
        fontSize: 14,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
    >
      <div>
        JARVIS quer {label}: <strong>{path}</strong>
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button
          onClick={onConfirm}
          style={{
            padding: '4px 12px',
            background: '#22c55e',
            border: 'none',
            borderRadius: 4,
            color: 'white',
            cursor: 'pointer',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
        >
          Permitir
        </button>
        <button
          onClick={onDeny}
          style={{
            padding: '4px 12px',
            background: '#ef4444',
            border: 'none',
            borderRadius: 4,
            color: 'white',
            cursor: 'pointer',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
        >
          Negar
        </button>
      </div>
    </div>
  );
}

/**
 * 260427-qzg fix bug 2: wake word + multi-turn só rodam em mode 'wake-word'.
 * Em ptt-only ou always-listening, este componente NÃO é renderizado, então
 * useWakeWord/useMultiTurnWindow nunca chamam getUserMedia nem registram
 * afterPlay no ttsPlayer — eliminando o " e aí" fantasma após resposta PTT.
 */
function WakeWordFeatures({
  multiTurnEnabled,
  windowMs,
}: {
  multiTurnEnabled: boolean;
  windowMs: number;
}): null {
  const wakeWordState = useWakeWord();
  useMultiTurnWindow({
    vadInstance: wakeWordState.vadInstance,
    enabled: multiTurnEnabled,
    windowMs,
  });
  return null;
}

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
  // PTT: listener global para ptt:action (ChatInput não está montado no App)
  // 260427-qzg: usePttHandler continua montado em todos os modos — PTT
  // funciona inclusive durante o boot quando voiceMode === null.
  usePttHandler();

  // Phase 54 (LACT-06) + Phase 55 (LACT-01..05): action confirmation hook
  // Phase 55 Plan 05: executeAndAck = Execute→ACK flow (D-12); confirmAction kept for compat
  const { pendingAction, executeAndAck, denyAction } = useActionConfirmation();

  // Phase 44 (VHARD-01, D-04): toast global do ChatContext
  const { toast, setToast } = useChat();

  // Quick 260427-qzg: lê voice mode atual para gatear hooks de wake word/multi-turn.
  // Em ptt-only ou always-listening, <WakeWordFeatures /> NÃO é renderizado,
  // então useWakeWord nunca chama getUserMedia nem registra afterPlay no ttsPlayer.
  const [voiceMode, setVoiceMode] = useState<VoiceMode | null>(null);
  useEffect(() => {
    let cancelled = false;
    void window.jarvis.voiceMode?.getMode().then((m) => {
      if (!cancelled) setVoiceMode(m);
    });
    const unsub = window.jarvis.voiceMode?.onChange((evt) => {
      setVoiceMode(evt.newMode);
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  const wakeFeaturesEnabled = voiceMode === 'wake-word';

  // Phase 44 (VHARD-01, D-04): escuta voice-mode:switch-result para exibir toast
  // de permissão negada com botão "Abrir System Settings"
  useEffect(() => {
    const handleSwitchResult = (
      _event: unknown,
      result: VoiceModeSwitchResult,
    ) => {
      if (result.success && result.label) {
        setToast({
          message: `Modo: ${result.label}`,
          variant: 'info',
        });
      } else if (!result.success && result.blockedReason === 'mic-permission-denied') {
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

  useEffect(() => {
    return () => {
      stopTTSPlayback();
    };
  }, []);

  // Phase 53 Plan 02 (STTS-01): subscribe to tts:chunk/end/stop IPC events
  // so the renderer streaming queue starts decoding/scheduling chunks as soon
  // as the main process emits them.
  useEffect(() => {
    const unsubscribe = wireStreamingTtsListeners();
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div
      className="h-screen w-screen flex items-center justify-center"
      style={{ background: 'transparent' } as React.CSSProperties}
      onMouseEnter={() => window.jarvis.setIgnoreMouseEvents?.(false)}
      onMouseLeave={() => window.jarvis.setIgnoreMouseEvents?.(true)}
    >
      {/* Quick 260427-qzg: useWakeWord + useMultiTurnWindow só montam em mode 'wake-word'. */}
      {wakeFeaturesEnabled && (
        <WakeWordFeatures multiTurnEnabled={multiTurnEnabled} windowMs={windowMs} />
      )}
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
          autoCloseMs={toast.action ? 0 : 2000}
          onClose={() => setToast(null)}
        />
      )}
      {pendingAction && (
        <ActionConfirmationToast
          action={pendingAction.action}
          path={pendingAction.path}
          requestId={pendingAction.requestId}
          onConfirm={() => void executeAndAck(pendingAction.requestId)}
          onDeny={() => void denyAction(pendingAction.requestId, 'denied')}
          onTimeout={() => void denyAction(pendingAction.requestId, 'timeout')}
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
