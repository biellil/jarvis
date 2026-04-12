---
phase: 25-orb-visual-polish-p2
plan: 01
subsystem: desktop-ui
tags: [orb, animation, css, tailwind, accessibility]
dependency_graph:
  requires: []
  provides: [idle-breath-animation]
  affects: [Orb.tsx, tailwind.config.ts, globals.css]
tech_stack:
  added: []
  patterns: [CSS animation composition, hue-rotate filter, prefers-reduced-motion]
key_files:
  created: []
  modified:
    - apps/desktop/tailwind.config.ts
    - apps/desktop/src/renderer/components/Orb/Orb.tsx
    - apps/desktop/src/renderer/src/styles/globals.css
decisions:
  - "idle-breath aplicada no Layer 1 (div interna) para isolar do drop-shadow do root — hue-rotate no root afetaria glow colorido indesejavelmente"
  - "CSS animations em propriedades distintas (transform vs filter) compõem em paralelo sem conflito — idle-breath coexiste com pulse-idle"
  - "Duração 6s escolhida como meio-ponto de 4–8s do requisito ORB-POL-03"
metrics:
  duration: "~5 min"
  completed: "2026-04-12"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
requirements:
  - ORB-POL-03
---

# Phase 25 Plan 01: Idle Breathing com Hue Drift Summary

**One-liner:** Keyframe idle-breath com hue-rotate ±10deg e brightness 0.97–1.04 aplicada condicionalmente no Layer 1 do orb quando state=idle e !isPausedVisual, com cobertura prefers-reduced-motion.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Adicionar keyframe idle-breath no tailwind.config.ts | 41dca4d | apps/desktop/tailwind.config.ts |
| 2 | Aplicar animate-idle-breath no Orb.tsx e cobertura prefers-reduced-motion | 780f392 | apps/desktop/src/renderer/components/Orb/Orb.tsx, apps/desktop/src/renderer/src/styles/globals.css |

## What Was Built

Implementado o efeito de "respiração viva" do orb em estado idle ativo (ORB-POL-03):

1. **tailwind.config.ts** — Nova entrada na seção `animation`: `'idle-breath': 'idle-breath 6s ease-in-out infinite'`. Nova keyframe na seção `keyframes` com 4 stops: 0%/100% neutro, 25% hue-rotate(10deg)/brightness(1.04), 50% neutro, 75% hue-rotate(-10deg)/brightness(0.97).

2. **Orb.tsx** — Refatoração de `animationClass` para `baseAnimationClass` + composição condicional: quando `state === 'idle' && !isPausedVisual`, aplica `animate-pulse-idle animate-idle-breath` juntas no Layer 1. As duas animações operam em propriedades CSS distintas (`transform: scale` vs `filter: hue-rotate`) e compõem em paralelo sem conflito.

3. **globals.css** — `.animate-idle-breath` adicionada à lista do bloco `@media (prefers-reduced-motion: reduce)`, garantindo que usuários com sensibilidade vestibular não vejam a animação.

## Verification Results

```
grep "idle-breath" tailwind.config.ts → 2 linhas (animation + keyframes) ✓
grep "animate-idle-breath" Orb.tsx → linha condicional com !isPausedVisual ✓
grep "animate-idle-breath" globals.css → dentro do bloco reduced-motion ✓
pnpm --filter @jarvis/desktop build → built in 6.37s (sem erros) ✓
```

## Deviations from Plan

None — plano executado exatamente como escrito.

## Known Stubs

None — todos os dados estão conectados ao estado real do orb via `useOrbContext`.

## Threat Flags

None — mudança puramente visual/CSS, sem novas superfícies de ataque (conforme threat model T-25-01-01 e T-25-01-02 aceitos).

## Self-Check: PASSED

- [x] apps/desktop/tailwind.config.ts modificado com `idle-breath` em animation e keyframes
- [x] apps/desktop/src/renderer/components/Orb/Orb.tsx modificado com composição condicional
- [x] apps/desktop/src/renderer/src/styles/globals.css modificado com `.animate-idle-breath` no reduced-motion
- [x] Commit 41dca4d existe (Task 1)
- [x] Commit 780f392 existe (Task 2)
- [x] Build passa sem erros
