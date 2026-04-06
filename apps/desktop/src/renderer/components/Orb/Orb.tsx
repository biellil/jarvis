import { useOrbContext } from './OrbContext';

// State colors per D-02 and UI-SPEC
const stateColors = {
  idle: '#06B6D4',      // cyan-500
  listening: '#F59E0B',  // amber-500
  processing: '#8B5CF6', // violet-500
  responding: '#3B82F6', // blue-500
} as const;

// Glow shadows per D-02 (always visible)
const stateShadows = {
  idle: '0 0 24px rgba(6, 182, 212, 0.6), 0 0 48px rgba(6, 182, 212, 0.4)',
  listening: '0 0 24px rgba(245, 158, 11, 0.6), 0 0 48px rgba(245, 158, 11, 0.4)',
  processing: '0 0 24px rgba(139, 92, 246, 0.6), 0 0 48px rgba(139, 92, 246, 0.4)',
  responding: '0 0 24px rgba(59, 130, 246, 0.6), 0 0 48px rgba(59, 130, 246, 0.4)',
} as const;

export function Orb() {
  const { state } = useOrbContext();

  // Debug: log state changes
  console.log('[Orb] Current state:', state);
  console.log('[Orb] Color for state:', stateColors[state]);
  console.log('[Orb] Shadow for state:', stateShadows[state]);

  // Map state to animation class
  const animationClass = {
    idle: 'animate-pulse-idle',
    listening: 'animate-pulse-listen',
    processing: 'animate-spin-process',
    responding: '', // No animation on orb itself, only ripples
  }[state];

  return (
    <div className="relative" style={{ pointerEvents: 'none' }}>
      {/* Main orb sphere - D-10 monolithic component */}
      <div
        className={`w-orb h-orb rounded-full ${animationClass}`}
        style={{
          // DEBUG: Solid color with !important
          background: `${stateColors[state]} !important`,
          // D-02 + D-03: Glow always visible + inner shadow for depth
          boxShadow: `${stateShadows[state]}, inset 0 -12px 24px rgba(0,0,0,0.2)`,
          // D-04: 300ms transition
          transition: 'all 0.3s ease-in-out',
        }}
        aria-label={`JARVIS orb in ${state} state`}
      />

      {/* D-09: Ripple rings for responding state - 3 elements with staggered delays */}
      {state === 'responding' && (
        <>
          {/* Ring 1 - immediate */}
          <div
            className="absolute inset-0 rounded-full border-2 border-orb-respond opacity-0 animate-ripple"
            style={{ animationDelay: '0s' }}
          />
          {/* Ring 2 - 0.5s delay */}
          <div
            className="absolute inset-0 rounded-full border-2 border-orb-respond opacity-0 animate-ripple"
            style={{ animationDelay: '0.5s' }}
          />
          {/* Ring 3 - 1s delay */}
          <span
            className="absolute inset-0 rounded-full border-2 border-orb-respond opacity-0 animate-ripple"
            style={{ animationDelay: '1s' }}
          />
        </>
      )}
    </div>
  );
}
