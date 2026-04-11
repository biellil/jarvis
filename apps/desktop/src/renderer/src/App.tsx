import { useEffect } from 'react';
import { OrbProvider, Orb } from '@renderer/components/Orb';
import { ChatProvider } from './chat/ChatContext';
import { stopTTSPlayback } from './audio/ttsPlayer';
import { useWakeWord } from '../hooks/useWakeWord';
import './App.css';

/**
 * Root Application Component
 * v1.4: Avatar mode — 160x160 window, only the glass orb visible.
 * ChatInput/history moved to v1.4 expanded interaction design.
 *
 * Phase 22 Plan 04: useWakeWord() é montado DENTRO do OrbProvider —
 * o hook consome useOrbContext() e precisa do provider no árvore acima.
 */
function AppContent() {
  // Phase 22 Plan 04: boot wake word engine (idempotent, self-degrade em fail)
  useWakeWord();

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
