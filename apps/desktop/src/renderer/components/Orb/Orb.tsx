import { useOrbContext } from './OrbContext';

type OrbState = 'idle' | 'listening' | 'processing' | 'responding';

/**
 * Glass sphere gradient — deep indigo base, bright cyan top-left, violet rim.
 * Mimics refraction and subsurface scatter of a glass orb.
 */
const stateGradients: Record<OrbState, string> = {
  idle: `radial-gradient(
    circle at 33% 30%,
    #7BE8F5 0%,
    #2BA8D4 20%,
    #1560A8 45%,
    #2D1F7A 72%,
    #12103A 100%
  )`,
  listening: `radial-gradient(
    circle at 33% 30%,
    #FDE68A 0%,
    #F59E0B 20%,
    #B45309 45%,
    #78350F 72%,
    #2D1606 100%
  )`,
  processing: `radial-gradient(
    circle at 33% 30%,
    #DDD6FE 0%,
    #8B5CF6 20%,
    #6D28D9 45%,
    #3B0764 72%,
    #1A0530 100%
  )`,
  responding: `radial-gradient(
    circle at 33% 30%,
    #93C5FD 0%,
    #3B82F6 20%,
    #1D4ED8 45%,
    #1E3A8A 72%,
    #0D1B4A 100%
  )`,
};

/** Ripple ring color per state */
const rippleColor: Record<OrbState, string> = {
  idle:       '#0EA5E9',
  listening:  '#F59E0B',
  processing: '#8B5CF6',
  responding: '#3B82F6',
};

const SIZE = 128;

export function Orb() {
  const { state } = useOrbContext();

  const animationClass = {
    idle: 'animate-pulse-idle',
    listening: 'animate-pulse-listen',
    processing: 'animate-spin-process',
    responding: '',
  }[state];

  return (
    <div
      aria-label={`JARVIS orb in ${state} state`}
      style={{
        position: 'relative',
        width: SIZE,
        height: SIZE,
        pointerEvents: 'none',
      }}
    >
      {/* ── Layer 1: Glass sphere body (animated) ── */}
      <div
        className={animationClass}
        style={{
          width: SIZE,
          height: SIZE,
          borderRadius: '50%',
          background: stateGradients[state],
          /* Edge rim: thin bright border simulates refraction at glass edge */
          border: '1px solid rgba(255,255,255,0.18)',
          /* Inner shadow: darkens lower half for 3D depth */
          boxShadow: 'inset 0 -20px 40px rgba(0,0,0,0.45), inset 0 6px 12px rgba(255,255,255,0.06)',
          transition: 'background 0.4s ease-in-out, border-color 0.4s ease-in-out',
          position: 'relative',
          overflow: 'hidden',
        }}
      />

      {/* ── Layer 2: Primary specular highlight (top-left, NOT inside animated div) ──
           Stays fixed relative to the "light source" even when sphere spins */}
      <div
        style={{
          position: 'absolute',
          top: '6%',
          left: '9%',
          width: '54%',
          height: '48%',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at 38% 36%, rgba(255,255,255,0.90) 0%, rgba(255,255,255,0.55) 22%, rgba(255,255,255,0.10) 55%, transparent 75%)',
          pointerEvents: 'none',
        }}
      />

      {/* ── Layer 3: Secondary rim light (bottom-right, cool tint) ── */}
      <div
        style={{
          position: 'absolute',
          bottom: '9%',
          right: '7%',
          width: '36%',
          height: '30%',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(150,220,255,0.22) 0%, transparent 72%)',
          pointerEvents: 'none',
        }}
      />

      {/* ── Layer 4: Ripple rings (responding state only) ── */}
      {state === 'responding' && (
        <>
          {[0, 0.5, 1].map((delay) => (
            <div
              key={delay}
              className="animate-ripple"
              style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                borderRadius: '50%',
                border: `2px solid ${rippleColor[state]}`,
                opacity: 0,
                animationDelay: `${delay}s`,
              }}
            />
          ))}
        </>
      )}
    </div>
  );
}
