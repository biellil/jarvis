import { useRef, useState, useEffect } from 'react';
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

/**
 * Outer glow color (drop-shadow) per state — matches gradient hue.
 * Applied via `filter: drop-shadow(...)` on the root div so it spills
 * outside the sphere's overflow:hidden (which box-shadow cannot escape).
 * 260410-td5: viável agora que a janela Electron tem 240x240 (56px de respiro).
 */
const stateGlow: Record<OrbState, string> = {
  idle:       'rgba(43,168,212,0.55)',   // cyan-teal (matches #2BA8D4)
  listening:  'rgba(245,158,11,0.55)',   // amber (#F59E0B)
  processing: 'rgba(139,92,246,0.55)',   // violet (#8B5CF6)
  responding: 'rgba(59,130,246,0.55)',   // blue (#3B82F6)
};

const SIZE = 128;

export function Orb() {
  const { state, wakeWordPaused, burstActive } = useOrbContext();

  // ── Phase 23 derived visual state ─────────────────────────────────────
  // D-01 + WAKE-04: "paused" visual only applies to idle. During
  // listening/processing/responding the normal rendering wins — we
  // intentionally IGNORE wakeWordPaused outside idle so the user always
  // gets full feedback while the assistant is actually working.
  const isPausedVisual = state === 'idle' && wakeWordPaused;

  const baseAnimationClass = {
    idle: 'animate-pulse-idle',
    listening: 'animate-pulse-listen',
    processing: 'animate-spin-process',
    responding: '',
  }[state];

  // ORB-POL-03: idle breathing com hue drift ±10°.
  // Condições para ativar:
  //   1. state === 'idle' (outros estados têm sua própria animação com semântica clara)
  //   2. !isPausedVisual — paused deve parecer quieto/adormecido, não "vivo"
  // A classe compõe com animate-pulse-idle no mesmo elemento —
  // pulse-idle anima `transform: scale`, idle-breath anima `filter: hue-rotate`.
  // CSS animations em propriedades diferentes compõem em paralelo sem conflito.
  const animationClass = (state === 'idle' && !isPausedVisual)
    ? `${baseAnimationClass} animate-idle-breath`
    : baseAnimationClass;

  const glowRadius = isPausedVisual ? 12 : 24;
  // Cyan glow with reduced alpha per D-01 when paused; otherwise the
  // state-colored glow with full 0.55 alpha.
  const glowRgba = isPausedVisual ? 'rgba(43,168,212,0.28)' : stateGlow[state];
  const innerBorder = isPausedVisual
    ? 'rgba(180,180,180,0.22)'
    : 'rgba(255,255,255,0.18)';
  const rootOpacity = isPausedVisual ? 0.6 : 1;

  // D-02: burstActive applies the `animate-wake-burst` keyframe to the
  // ROOT (not the inner animated sphere — which is already running
  // pulse-idle / pulse-listen / spin-process). The root keyframe only
  // touches `transform: scale()`, so it composes cleanly with the inner
  // layer's own animation.
  const rootClassName = burstActive ? 'animate-wake-burst' : undefined;

  // ── ORB-POL-05: drag-to-reposition ────────────────────────────────────
  // draggingRef: true durante mousedown → mouseup
  // lastPosRef: posição do mouse no último mousemove — usado para calcular delta
  const draggingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    // Só captura botão esquerdo
    if (e.button !== 0) return;
    draggingRef.current = true;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    // Desabilita click-through para capturar mouse events durante drag
    window.jarvis.setIgnoreMouseEvents(false);
    // Previne seleção de texto acidental
    e.preventDefault();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - lastPosRef.current.x;
    const dy = e.clientY - lastPosRef.current.y;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    // Envia delta para main mover a janela
    window.jarvis.moveWindow(dx, dy);
  };

  const handleMouseUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    // Persiste posição final
    window.jarvis.saveOrbPosition();
    // Restaura click-through em áreas transparentes
    window.jarvis.setIgnoreMouseEvents(true);
  };

  // ── Crossfade state tracking (ORB-POL-04) ────────────────────────────
  // Two overlapping sublayers: "from" fades out, "to" stays at opacity 1.
  // useRef tracks the previous state without causing re-renders.
  // CSS `transition: opacity 400ms` on the "from" layer does the actual work.
  const prevStateRef = useRef<OrbState>(state);
  const [displayedGradients, setDisplayedGradients] = useState({
    from: stateGradients[state],
    to: stateGradients[state],
    transitioning: false,
  });

  useEffect(() => {
    if (prevStateRef.current !== state) {
      const fromGrad = stateGradients[prevStateRef.current];
      const toGrad = stateGradients[state];
      prevStateRef.current = state;

      // Inicia crossfade: sublayer A (from) vai de opacity 1 → 0
      // sublayer B (to) fica sempre em opacity 1 — o novo gradiente aparece por baixo
      setDisplayedGradients({ from: fromGrad, to: toGrad, transitioning: true });

      // Após a transição CSS (400ms + 20ms de folga), normaliza ambos os layers
      // para o mesmo gradiente — pronto para a próxima transição
      const timer = setTimeout(() => {
        setDisplayedGradients({ from: toGrad, to: toGrad, transitioning: false });
      }, 420);

      return () => clearTimeout(timer);
    }
  }, [state]);

  return (
    <div
      aria-label={`JARVIS orb in ${state} state`}
      className={rootClassName}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        position: 'relative',
        width: SIZE,
        height: SIZE,
        // ORB-POL-05: 'auto' em vez de 'none' — click-through gerenciado pelo main
        // process via setIgnoreMouseEvents, não pelo CSS pointerEvents do renderer.
        pointerEvents: 'auto',
        cursor: 'grab',
        // 260410-td5: glow externo colorido (sensação 3D) + sombra cinza inferior (peso visual).
        // filter:drop-shadow espalha-se fora do overflow:hidden do Layer 1 — box-shadow não faria.
        // Raio default 24px; 12px quando paused (D-01).
        filter: `drop-shadow(0 0 ${glowRadius}px ${glowRgba}) drop-shadow(0 4px 12px rgba(0,0,0,0.35))`,
        opacity: rootOpacity,
        // D-05: transitions preserved even under prefers-reduced-motion —
        // the global @media rule only disables `animation:*` declarations.
        transition: 'filter 0.4s ease-in-out, opacity 0.4s ease-in-out',
      }}
    >
      {/* ── Layer 1: Glass sphere body com crossfade (ORB-POL-04) ── */}
      {/* Wrapper relativo para conter os dois sublayers sobrepostos */}
      <div
        style={{
          position: 'relative',
          width: SIZE,
          height: SIZE,
          borderRadius: '50%',
          border: `1px solid ${innerBorder}`,
          /* Inner shadow: darkens lower half for 3D depth */
          boxShadow: 'inset 0 -20px 40px rgba(0,0,0,0.45), inset 0 6px 12px rgba(255,255,255,0.06)',
          /* Edge rim color transitiona suavemente entre estados */
          transition: 'border-color 0.4s ease-in-out',
          overflow: 'hidden',
        }}
      >
        {/* Sublayer A: gradiente "from" — faz opacity 1→0 durante transição */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: displayedGradients.from,
            opacity: displayedGradients.transitioning ? 0 : 1,
            transition: 'opacity 400ms ease-in-out',
          }}
        />
        {/* Sublayer B: gradiente "to" — sempre opacity 1; recebe animationClass
             para que pulse-idle / animate-idle-breath / spin-process sejam aplicados
             ao layer ativo (o destino da transição) */}
        <div
          className={animationClass}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: displayedGradients.to,
            opacity: 1,
          }}
        />
      </div>

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

      {/* ── Layer 5: Wake burst amber ring overlay (D-02 + WAKE-02) ──
           350ms one-shot; opacity driven by `animate-wake-burst-ring`
           keyframe (0 → 1 → 0). Only mounted while burstActive=true,
           so the keyframe runs fresh on each trigger. */}
      {burstActive && (
        <div
          className="animate-wake-burst-ring"
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            borderRadius: '50%',
            border: '2px solid #F59E0B',
            pointerEvents: 'none',
            opacity: 0,
          }}
        />
      )}
    </div>
  );
}
