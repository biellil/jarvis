import { useRef, useState, useEffect } from 'react';
import { useOrbContext } from './OrbContext';
import type { VoiceMode } from '../../../shared/ipc-types';

type OrbState = 'idle' | 'listening' | 'processing' | 'responding' | 'awaiting-followup';

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
  'awaiting-followup': `radial-gradient(
    circle at 33% 30%,
    #38BDF8 0%,
    #0EA5E9 20%,
    #0369A1 45%,
    #164E63 72%,
    #0C2E3F 100%
  )`,
};

/** Ripple ring color per state */
const rippleColor: Record<OrbState, string> = {
  idle:       '#0EA5E9',
  listening:  '#F59E0B',
  processing: '#8B5CF6',
  responding: '#3B82F6',
  'awaiting-followup': '#0EA5E9', // sky-400
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
  'awaiting-followup': 'rgba(14,165,233,0.55)', // sky-400
};

// Phase 42 (VUI-02): per-mode idle gradient/glow — replaces stateGradients.idle when state==='idle'
const modeIdleGradients: Record<VoiceMode, string> = {
  'wake-word':        `radial-gradient(circle at 33% 30%, #7BE8F5 0%, #2BA8D4 20%, #1560A8 45%, #2D1F7A 72%, #12103A 100%)`,
  'always-listening': `radial-gradient(circle at 33% 30%, #86EFAC 0%, #22C55E 20%, #15803D 45%, #14532D 72%, #052E16 100%)`,
  'ptt-only':         `radial-gradient(circle at 33% 30%, #FED7AA 0%, #F97316 20%, #C2410C 45%, #7C2D12 72%, #2C0E06 100%)`,
};

const modeIdleGlow: Record<VoiceMode, string> = {
  'wake-word':        'rgba(43,168,212,0.55)',
  'always-listening': 'rgba(34,197,94,0.55)',
  'ptt-only':         'rgba(249,115,22,0.55)',
};

// Phase 42 (VUI-03): badge label and colors
const modeBadgeLabel: Record<VoiceMode, string> = {
  'wake-word':        'WW',
  'always-listening': 'AL',
  'ptt-only':         'PTT',
};

const modeIdleBadgeText: Record<VoiceMode, string> = {
  'wake-word':        '#7BE8F5',
  'always-listening': '#86EFAC',
  'ptt-only':         '#FED7AA',
};

const modeIdleBadgeBorder: Record<VoiceMode, string> = {
  'wake-word':        'rgba(123,232,245,0.35)',
  'always-listening': 'rgba(134,239,172,0.35)',
  'ptt-only':         'rgba(254,215,170,0.35)',
};

const voiceModeLabelFull: Record<VoiceMode, string> = {
  'wake-word':        'Wake Word',
  'always-listening': 'Always-Listening',
  'ptt-only':         'PTT-only',
};

const SIZE = 128;

export interface OrbProps {
  /**
   * Phase 66 D-12: When provided and non-empty, renders this string in the
   * Layer 6 badge instead of the voice-mode label. Badge border + text colors
   * stay at current voice-mode values — no new accent color (D-12 constraint).
   * On task:done/cancelled/error the caller passes undefined to revert.
   */
  agentBadgeText?: string;
}

export function Orb({ agentBadgeText }: OrbProps = {}) {
  const { state, wakeWordPaused, burstActive, voiceMode } = useOrbContext();

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
    'awaiting-followup': 'animate-pulse-followup',
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

  // Phase 42 (VUI-02): when idle, gradient/glow are mode-dependent; other states unchanged
  const activeIdleGradient = state === 'idle'
    ? modeIdleGradients[voiceMode]
    : stateGradients[state];

  const activeIdleGlow = state === 'idle'
    ? modeIdleGlow[voiceMode]
    : stateGlow[state];

  const glowRadius = isPausedVisual ? 12 : 24;
  // Cyan glow with reduced alpha per D-01 when paused; otherwise the
  // state-colored glow with full 0.55 alpha.
  const glowRgba = isPausedVisual ? 'rgba(43,168,212,0.28)' : activeIdleGlow;
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
  const prevVoiceModeRef = useRef<VoiceMode>(voiceMode);
  const [displayedGradients, setDisplayedGradients] = useState({
    from: activeIdleGradient,
    to: activeIdleGradient,
    transitioning: false,
  });

  // Crossfade on state change (ORB-POL-04)
  useEffect(() => {
    if (prevStateRef.current !== state) {
      const fromGrad = prevStateRef.current === 'idle'
        ? modeIdleGradients[prevVoiceModeRef.current]
        : stateGradients[prevStateRef.current];
      const toGrad = activeIdleGradient;
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
  }, [state, activeIdleGradient]);

  // Crossfade on voiceMode change while idle (Phase 42 — VUI-02, Pitfall 1 guard)
  useEffect(() => {
    if (prevVoiceModeRef.current !== voiceMode && state === 'idle') {
      const fromGrad = modeIdleGradients[prevVoiceModeRef.current];
      const toGrad = modeIdleGradients[voiceMode];
      prevVoiceModeRef.current = voiceMode;

      setDisplayedGradients({ from: fromGrad, to: toGrad, transitioning: true });
      const timer = setTimeout(() => {
        setDisplayedGradients({ from: toGrad, to: toGrad, transitioning: false });
      }, 420);
      return () => clearTimeout(timer);
    } else {
      prevVoiceModeRef.current = voiceMode;
    }
  }, [voiceMode, state]);

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
            border: `1px solid ${innerBorder}`,
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

      {/* ── Layer 6: Mode Badge (Phase 42 — VUI-03; Phase 66 D-12 agentBadgeText) ── */}
      {(() => {
        // Phase 66 D-12: when agentBadgeText is set, show it instead of the voice-mode label.
        // Badge border + text colors stay at current voice-mode values — no new accent color.
        const isAgentMode = !!agentBadgeText;
        const badgeText = isAgentMode ? agentBadgeText : modeBadgeLabel[voiceMode];
        // WR-04: parse "AGENT N/M" to build accessible aria-label. Validate the
        // format BEFORE substitution — String.prototype.replace returns the
        // input unchanged on no match, which would yield a semantically wrong
        // aria-label (e.g., "Agente executando — passo BUSY") if a future
        // caller passes a non-conforming badge text.
        const agentMatch = isAgentMode ? agentBadgeText.match(/^AGENT (\d+)\/(\d+)$/) : null;
        const agentAriaLabel = agentMatch
          ? `Agente executando — passo ${agentMatch[1]} de ${agentMatch[2]}`
          : isAgentMode
            ? `Agente executando — ${agentBadgeText}`
            : `Voice mode: ${voiceModeLabelFull[voiceMode]}`;
        return (
          <div
            role="status"
            aria-live="polite"
            aria-label={agentAriaLabel}
            style={{
              position: 'absolute',
              bottom: 14,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '2px 6px',
              borderRadius: 4,
              background: 'rgba(0,0,0,0.55)',
              border: `1px solid ${modeIdleBadgeBorder[voiceMode]}`,
              color: modeIdleBadgeText[voiceMode],
              fontSize: 10,
              fontWeight: 600,
              fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
              lineHeight: 1.2,
              letterSpacing: '0.05em',
              pointerEvents: 'none',
              userSelect: 'none',
              whiteSpace: 'nowrap',
              transition: 'color 0.4s ease-in-out, border-color 0.4s ease-in-out',
            }}
          >
            {badgeText}
          </div>
        );
      })()}
    </div>
  );
}
