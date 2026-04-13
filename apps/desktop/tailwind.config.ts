import type { Config } from 'tailwindcss';

export default {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // State colors for Orb (Phase 11)
        'orb-idle': '#06B6D4',      // cyan-500
        'orb-listen': '#F59E0B',    // amber-500
        'orb-process': '#8B5CF6',   // violet-500
        'orb-respond': '#3B82F6',   // blue-500

        // Glassmorphism colors
        'glass-bg': 'rgba(255, 255, 255, 0.08)',
        'glass-border': 'rgba(255, 255, 255, 0.12)',
      },
      spacing: {
        'orb': '96px', // 12 x 8px grid
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        'body': '14px',
        'label': '12px',
        'heading': '16px',
      },
      backdropBlur: {
        'glass': '12px',
      },
      borderRadius: {
        'glass': '16px',
      },
      boxShadow: {
        'glass': '0 4px 24px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        'orb-idle': '0 0 24px rgba(6, 182, 212, 0.6), 0 0 48px rgba(6, 182, 212, 0.4)',
        'orb-listen': '0 0 24px rgba(245, 158, 11, 0.6), 0 0 48px rgba(245, 158, 11, 0.4)',
        'orb-process': '0 0 24px rgba(139, 92, 246, 0.6), 0 0 48px rgba(139, 92, 246, 0.4)',
        'orb-respond': '0 0 24px rgba(59, 130, 246, 0.6), 0 0 48px rgba(59, 130, 246, 0.4)',
        // Phase 28 — sky-400 glow for awaiting-followup state
        'orb-followup': '0 0 24px rgba(14, 165, 233, 0.6), 0 0 48px rgba(14, 165, 233, 0.4)',
      },
      animation: {
        'pulse-idle': 'pulse-idle 2s ease-in-out infinite',
        'pulse-listen': 'pulse-listen 1s ease-in-out infinite',
        'spin-process': 'spin-process 2s linear infinite',
        'ripple': 'ripple 1.5s ease-out infinite',
        // Phase 23 D-02 — wake word burst one-shot.
        // `wake-burst` anima o root (transform scale 1.0 → 1.1 → 1.0).
        // `wake-burst-ring` anima o amber ring overlay (opacity 0 → 1 → 0).
        // Curva ease-out idêntica, 350ms — o ring surge e some sincronizado
        // com o pulse de scale do orb.
        'wake-burst': 'wake-burst 350ms ease-out',
        'wake-burst-ring': 'wake-burst-ring 350ms ease-out',
        // ORB-POL-03: idle breathing com hue drift ±10°.
        // 6s = meio-ponto de "4–8s" do requisito. Aplicado no Layer 1
        // (div interna) para não afetar o drop-shadow do root.
        'idle-breath': 'idle-breath 6s ease-in-out infinite',
        // Phase 28 D-11 — awaiting-followup slow pulsation.
        // 1.5s timing bridges idle (2s slow) and listening (1s eager).
        // Scale 1.06 reads as "gently waiting" — slower than listening, faster than idle.
        'pulse-followup': 'pulse-followup 1.5s ease-in-out infinite',
      },
      keyframes: {
        'pulse-idle': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.05)', opacity: '0.9' },
        },
        'pulse-listen': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.08)', opacity: '0.85' },
        },
        'spin-process': {
          '0%': { transform: 'rotate(0deg) scale(1)' },
          '50%': { transform: 'rotate(180deg) scale(1.05)' },
          '100%': { transform: 'rotate(360deg) scale(1)' },
        },
        'ripple': {
          '0%': { transform: 'scale(1)', opacity: '0.8' },
          '100%': { transform: 'scale(2.5)', opacity: '0' },
        },
        'wake-burst': {
          '0%':   { transform: 'scale(1.0)' },
          '45%':  { transform: 'scale(1.1)' },
          '100%': { transform: 'scale(1.0)' },
        },
        'wake-burst-ring': {
          '0%':   { opacity: '0' },
          '45%':  { opacity: '1' },
          '100%': { opacity: '0' },
        },
        // ORB-POL-03: hue-rotate ±10deg + brightness 0.97–1.04.
        // Aplicado no Layer 1 para isolar do drop-shadow do root.
        'idle-breath': {
          '0%, 100%': { filter: 'hue-rotate(0deg) brightness(1.0)' },
          '25%':       { filter: 'hue-rotate(10deg) brightness(1.04)' },
          '50%':       { filter: 'hue-rotate(0deg) brightness(1.0)' },
          '75%':       { filter: 'hue-rotate(-10deg) brightness(0.97)' },
        },
        // Phase 28 D-11 — pulse-followup keyframe for awaiting-followup state.
        // Scale 1.06 at 50%, opacity 0.92 — gentle waiting pulse.
        'pulse-followup': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.06)', opacity: '0.92' },
        },
      },
    },
  },
} satisfies Config;
