/**
 * Root Application Component
 * Phase 10: Draggable container for frameless window
 * D-13: Entire container is draggable
 * D-14: Visual cursor feedback (grab/grabbing)
 */
export default function App() {
  return (
    <div
      className="h-screen w-screen flex items-center justify-center"
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
      {/* Phase 11 will add Orb component here */}
      {/* For now, show a placeholder circle matching orb size */}
      <div
        className="w-orb h-orb rounded-full bg-orb-idle opacity-20"
        style={{ pointerEvents: 'none' }}
      />
    </div>
  );
}
