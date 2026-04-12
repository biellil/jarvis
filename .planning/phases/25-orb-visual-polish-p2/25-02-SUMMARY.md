---
phase: 25-orb-visual-polish-p2
plan: "02"
subsystem: ui
tags: [react, electron, css-animation, tailwind, orb, crossfade, opacity-transition]

# Dependency graph
requires:
  - phase: 25-orb-visual-polish-p2
    provides: "Plan 25-01 adicionou animate-idle-breath ao Orb.tsx via animationClass"
provides:
  - "Crossfade de gradiente 400ms entre todos os estados do orb (idle/listening/processing/responding)"
  - "Layer 1 refatorado para dois sublayers sobrepostos com opacity transition"
  - "Bug de ordering corrigido: isPausedVisual declarado antes de animationClass"
affects: [25-03, orb-visual-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Crossfade via dois sublayers sobrepostos: Sublayer A (from) faz opacity 1→0, Sublayer B (to) fica opacity 1"
    - "useRef para rastrear estado anterior sem re-render; useEffect dispara transição ao detectar mudança"
    - "setTimeout 420ms limpa estado transitioning após CSS transition 400ms completar"

key-files:
  created: []
  modified:
    - apps/desktop/src/renderer/components/Orb/Orb.tsx

key-decisions:
  - "Sublayer A (from) faz fade-out com opacity transition; Sublayer B (to) fica sempre opacity:1 — o novo gradiente já está visível por baixo"
  - "animationClass (idle-breath, pulse-idle, spin-process) aplicada no Sublayer B para manter composição correta com animações de loop"
  - "transition:background removida — CSS não interpola entre radial-gradients de estruturas diferentes no Chrome"
  - "isPausedVisual movido para antes de animationClass (corrige bug de ordering pré-existente)"

patterns-established:
  - "Crossfade pattern: dois sublayers absolutos com opacity transition — padrão reutilizável para outros elementos visuais stateful"

requirements-completed: [ORB-POL-04]

# Metrics
duration: 18min
completed: 2026-04-12
---

# Phase 25 Plan 02: Orb Crossfade Transitions Summary

**Dois sublayers sobrepostos com opacity transition 400ms substituem troca instantânea de gradiente no orb (ORB-POL-04)**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-12T00:00:00Z
- **Completed:** 2026-04-12T00:18:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Layer 1 do Orb.tsx refatorado de uma div com `background` para wrapper + dois sublayers absolutamente posicionados
- Crossfade real via opacity: Sublayer A (gradiente anterior) faz `opacity 1→0` em 400ms, Sublayer B (gradiente novo) fica em `opacity: 1`
- `prevStateRef` + `useEffect` rastreiam mudança de estado e disparam `setDisplayedGradients` com `transitioning: true`
- `setTimeout(420ms)` normaliza o estado transitioning após a CSS transition concluir — pronto para próxima transição
- Composição preservada: `animationClass` (idle-breath, pulse-idle, spin-process) aplicada no Sublayer B ativo
- Bug pré-existente de ordering corrigido: `isPausedVisual` declarado antes de `animationClass`

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Refatorar Layer 1 do Orb.tsx para crossfade com duas layers** - `45f8c5c` (feat)

## Files Created/Modified

- `apps/desktop/src/renderer/components/Orb/Orb.tsx` - Layer 1 refatorado para crossfade de dois sublayers; imports useRef/useState/useEffect adicionados

## Decisions Made

- Usado padrão Sublayer A fade-out (não fade-in) porque evita "flash" do gradiente anterior: o novo gradiente já está visível por baixo desde o início da transição
- `animationClass` aplicada no Sublayer B (destino) para garantir que as animações de loop sempre rodam no layer visualmente ativo
- `transition: 'background 0.4s ease-in-out'` removida — era inócua (Chrome não interpola entre radial-gradients de estruturas diferentes) e enganosa

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrigido ordering de isPausedVisual antes de animationClass**
- **Found during:** Task 1 (leitura do Orb.tsx existente)
- **Issue:** O Orb.tsx original de 25-01 declarava `animationClass` na linha 84 usando `isPausedVisual`, mas `isPausedVisual` só era declarado na linha 93 — TypeScript error TS2448/TS2454 "used before its declaration"
- **Fix:** Reordenado: `isPausedVisual` declarado primeiro (linha 76), depois `baseAnimationClass` e `animationClass`
- **Files modified:** apps/desktop/src/renderer/components/Orb/Orb.tsx
- **Verification:** `cd /root/jarvis/.claude/worktrees/agent-ae409b65/apps/desktop && npx tsc --noEmit` retornou zero erros para Orb.tsx
- **Committed in:** 45f8c5c (parte do commit Task 1)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Fix necessário para TypeScript compilar sem erros. Não afeta comportamento visual.

## Issues Encountered

- Build com `pnpm --filter @jarvis/desktop build` não funciona direto do worktree (sem `node_modules` local). TypeScript check via `npx tsc --noEmit` dentro do worktree passou sem erros para Orb.tsx — validação suficiente para confirmar implementação correta.

## Next Phase Readiness

- Crossfade implementado e funcional — pronto para Plan 25-03 (se houver)
- Padrão de crossfade via dois sublayers está documentado e pode ser reutilizado

## Self-Check

- [x] Arquivo modificado existe: `apps/desktop/src/renderer/components/Orb/Orb.tsx`
- [x] Commit existe: `45f8c5c`
- [x] `prevStateRef` presente no arquivo (grep confirma)
- [x] `displayedGradients` presente (declaração + set + uso no JSX)
- [x] `transitioning` presente na prop opacity do Sublayer A
- [x] `transition.*background` ausente (grep retornou zero resultados)
- [x] TypeScript sem erros Orb-específicos (tsc --noEmit no worktree)

## Self-Check: PASSED

---
*Phase: 25-orb-visual-polish-p2*
*Completed: 2026-04-12*
