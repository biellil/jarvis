import { OrbProvider, Orb } from '@renderer/components/Orb';
import { ChatInput } from '@renderer/components/ChatInput';
import './App.css';

/**
 * Root Application Component
 * Phase 10: Draggable container for frameless window
 * Phase 11: Orb integration with context provider
 * Phase 12: ChatInput integration below orb
 * D-13: Entire container is draggable
 * D-14: Visual cursor feedback (grab/grabbing)
 */
function AppContent() {
  return (
    <div
      className="h-screen w-screen flex items-center justify-center bg-slate-900"
      style={{
        // D-13: Entire container is draggable
        WebkitAppRegion: 'drag',
        // D-14: Visual feedback for drag
        cursor: 'grab',
      }}
      onMouseDown={(e) => {
        // D-14: Change cursor to grabbing during drag
        (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
      }}
      onMouseUp={(e) => {
        (e.currentTarget as HTMLElement).style.cursor = 'grab';
      }}
    >
      <div className="app-container">
        {/* Phase 11: Real Orb component */}
        <Orb />
        {/* Phase 12: ChatInput component below orb */}
        <ChatInput />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <OrbProvider>
      <AppContent />
    </OrbProvider>
  );
}
