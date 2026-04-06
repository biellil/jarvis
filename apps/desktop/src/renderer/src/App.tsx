import { OrbProvider, Orb, useOrbContext } from '@renderer/components/Orb';
import { useEffect } from 'react';

/**
 * Root Application Component
 * Phase 10: Draggable container for frameless window
 * Phase 11: Orb integration with context provider
 * D-13: Entire container is draggable
 * D-14: Visual cursor feedback (grab/grabbing)
 */
function AppContent() {
  const { setState } = useOrbContext();

  // Expose setState to console for manual testing (Phase 11 verification)
  useEffect(() => {
    (window as any).__orb_setState = setState;
    return () => {
      delete (window as any).__orb_setState;
    };
  }, [setState]);

  return (
    <div
      className="h-screen w-screen flex items-center justify-center"
      style={{
        // DEBUG: white background to see color changes clearly
        backgroundColor: '#ffffff',
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
      {/* Phase 11: Real Orb component replacing placeholder */}
      <Orb />
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
