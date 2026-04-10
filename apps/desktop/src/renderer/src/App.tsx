import { useEffect } from 'react';
import { OrbProvider, Orb } from '@renderer/components/Orb';
import { ChatInput } from '@renderer/components/ChatInput';
import { ChatProvider, useChat } from './chat/ChatContext';
import { Toast } from './components/Toast';
import { stopTTSPlayback } from './audio/ttsPlayer';
import './App.css';

/**
 * Root Application Component
 * Phase 10: Draggable container for frameless window
 * Phase 11: Orb integration with context provider
 * Phase 12: ChatInput integration below orb
 * Phase 19.5 Plan 04: Chat history + Toast + TTS cleanup on unmount
 */
function AppContent() {
  const { messages, toast, setToast } = useChat();

  // Plano 19_5-04: parar qualquer playback TTS no unmount do app
  useEffect(() => {
    return () => {
      stopTTSPlayback();
    };
  }, []);

  return (
    <div
      className="h-screen w-screen flex items-center justify-center"
      style={{
        background: 'transparent',
        WebkitAppRegion: 'drag',
        cursor: 'grab',
      } as React.CSSProperties}
      onMouseDown={(e) => {
        (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
      }}
      onMouseUp={(e) => {
        (e.currentTarget as HTMLElement).style.cursor = 'grab';
      }}
    >
      <div className="app-container">
        <Orb />
        <ChatInput />
        {messages.length > 0 && (
          <div
            className="chat-history"
            style={{
              marginTop: 12,
              maxHeight: 200,
              overflowY: 'auto',
              fontSize: 12,
              color: 'white',
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties}
          >
            {messages.map((m) => (
              <div
                key={m.id}
                data-role={m.role}
                style={{
                  margin: '4px 0',
                  textAlign: m.role === 'human' ? 'right' : 'left',
                  opacity: m.role === 'human' ? 0.8 : 1,
                }}
              >
                <strong>{m.role === 'human' ? 'Você: ' : 'JARVIS: '}</strong>
                {m.text}
              </div>
            ))}
          </div>
        )}
      </div>
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
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
