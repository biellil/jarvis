---
phase: 23-orb-ux-polish
plan: 01
subsystem: ui
tags: [orb, css, react-context, tailwind, reduced-motion, wake-burst, renderer]

requires:
  - phase: 22-voiceinputmanager-refactor-wake-word-core
    provides: "useWakeWord hook com onDetected() callback real — será wired em 23-02 para disparar triggerWakeBurst() e controlar setWakeWordPaused()"
  - phase: 11-orb-states
    provides: "OrbContext com 4 OrbState + Orb.tsx renderizando glass sphere, specular highlights, ripple (responding)"

provides:
  - "OrbContext estendido com wakeWordPaused + setWakeWordPaused (D-01)"
  - "OrbContext estendido com burstActive + triggerWakeBurst() 350ms one-shot (D-02)"
  - "Orb.tsx renderiza visual paused (opacity 0.6, glow 12px alpha 0.28, border muted) SOMENTE quando idle+paused (WAKE-04)"
  - "Orb.tsx renderiza overlay amber ring 2px #F59E0B quando burstActive=true com keyframe opacity 0→1→0 (WAKE-02)"
  - "Tailwind keyframes wake-burst (transform) + wake-burst-ring (opacity), ambos 350ms ease-out"
  - "globals.css @media (prefers-reduced-motion: reduce) zerando as 6 animações loopadas/one-shot (ORB-POL-01)"

affects: [23-02-tray-kill-switch-ipc-wiring]

tech-stack:
  added: []
  patterns:
    - "OrbContext como fonte única de verdade para qualquer superfície visual do orb (wakeWordPaused + burstActive seguem o padrão já estabelecido de state/setState)"
    - "One-shot animations via useRef<timeout> + setTimeout + useEffect cleanup — evita setState em árvore morta"
    - "prefers-reduced-motion desativa ANIMATIONS mas preserva TRANSITIONS — documentado inline em globals.css"
    - "Conditional className no root + condicional rendering do overlay — mantém componente puro sem useEffect no consumer"

key-files:
  created:
    - "apps/desktop/src/renderer/components/Orb/__tests__/OrbContext.test.tsx (expandido — 6→15 testes)"
  modified:
    - "apps/desktop/src/renderer/components/Orb/OrbContext.tsx — 4 campos novos no value"
    - "apps/desktop/src/renderer/components/Orb/Orb.tsx — isPausedVisual + burst overlay layer"
    - "apps/desktop/src/renderer/components/Orb/__tests__/Orb.test.tsx — reescrito com 15 cenários"
    - "apps/desktop/tailwind.config.ts — 2 keyframes + 2 animations novos"
    - "apps/desktop/src/renderer/src/styles/globals.css — bloco @media prefers-reduced-motion"

key-decisions:
  - "D-01 + D-04 implementados: wakeWordPaused como flag separada (não 5º state), default false"
  - "D-02 implementado: triggerWakeBurst() com debounce natural via clearTimeout — re-trigger estende janela"
  - "D-05 implementado: transitions 0.4s preservadas sob reduced-motion (essenciais para comunicar state change)"
  - "Overlay amber ring renderizado como layer separado (não animando o ring via transform) — permite compor com pulse-idle/listen no inner layer sem conflito"

patterns-established:
  - "Burst lifecycle: useRef<timeout> para tracking + clearTimeout no re-trigger + useEffect cleanup no unmount"
  - "wakeWordPaused é IGNORADO fora de idle — evita sinais conflitantes enquanto JARVIS está ativamente trabalhando"
  - "Pre-existing tests corrigidos para refletir render real (#2BA8D4 em vez do #06B6D4 fantasma da spec v1.2)"

requirements-completed: [WAKE-02, WAKE-04, ORB-POL-01, ORB-POL-02]

duration: ~10 min
completed: 2026-04-11
---

# Phase 23 Plan 01: Orb Visual Surface — wakeWordPaused + Wake Burst + Reduced Motion

**OrbContext estendido com `wakeWordPaused` e `burstActive`, Orb.tsx renderizando visual paused discreto e amber ring one-shot de 350ms, e bloco `@media (prefers-reduced-motion: reduce)` desligando as 6 animações mas preservando transitions — tudo em renderer puro, zero IPC.**

## Performance

- **Duration:** ~10 min (execução direta, zero deviations, zero checkpoints)
- **Tasks:** 3 (todas `type=auto`, 2 com `tdd=true`)
- **Files modified:** 5 código + 1 deferred-items
- **Tests:** 30/30 passando (15 OrbContext + 15 Orb), 100% GREEN após implementação

## Accomplishments

- **Visual paused (WAKE-04):** Quando o usuário togglar o kill switch do tray (plan 02), o orb idle ficará visivelmente distinto — opacity 0.6, glow cyan 50% mais fraco, border inner muted. Listening/processing/responding ignoram a flag (JARVIS trabalhando sempre renderiza em full brightness).
- **Wake burst (WAKE-02 + ORB-POL-02):** `triggerWakeBurst()` dispara um pulse de 350ms (scale 1.0→1.1→1.0) no root div + amber ring overlay (#F59E0B, 2px, opacity 0→1→0), pronto para ser wired ao `onDetected` callback do hook de wake word no plan 02.
- **Reduced motion (ORB-POL-01):** Usuários com sensibilidade vestibular (ou com OS-level setting) terão todas as 6 animações loopadas/one-shot desativadas, mantendo as transitions 0.4s que comunicam mudança de state — a mudança fica *visível* (cor/glow muda), só não *animada*.
- **Renderer puro:** Zero IPC, zero dependência de main process, zero nova lib. Plan 02 só precisa wire `useWakeWord.onDetected()` → `triggerWakeBurst()` e tray menu → `setWakeWordPaused()`.

## Task Commits

1. **Task 1: OrbContext com wakeWordPaused + burstActive + triggerWakeBurst** — `1dfcada` (feat, TDD)
   - RED: 9 testes novos falhando (defaults, setters, burst lifecycle, re-trigger, unmount cleanup)
   - GREEN: implementação com `useState` + `useRef<timeout>` + `useCallback` + `useEffect` cleanup
2. **Task 2: Orb paused visual + wake burst ring + tailwind keyframes** — `a1f5102` (feat, TDD)
   - RED: 9 testes novos do Orb failing + 6 pre-existentes do v1.2 atualizados
   - GREEN: Orb.tsx consome 4 campos do contexto, computa `isPausedVisual`, aplica className condicional, renderiza overlay
3. **Task 3: Global prefers-reduced-motion block** — `ad34002` (feat)
   - Sem TDD (pure CSS, verificado via grep)

_TDD flow: cada task com `tdd="true"` produziu RED→GREEN num único commit porque a diretiva do plan instruiu "commit after task complete" (não commit separado por fase TDD). Grep verificou que o GREEN é real, não acidental._

## Files Created/Modified

- `apps/desktop/src/renderer/components/Orb/OrbContext.tsx` — MODIFIED. 4 campos novos no value (wakeWordPaused/setWakeWordPaused/burstActive/triggerWakeBurst). Imports estendidos com useCallback, useEffect, useRef. Cleanup on unmount.
- `apps/desktop/src/renderer/components/Orb/__tests__/OrbContext.test.tsx` — MODIFIED. 6 testes pre-existentes preservados + 9 novos em 2 describes (wakeWordPaused + triggerWakeBurst com fakeTimers).
- `apps/desktop/src/renderer/components/Orb/Orb.tsx` — MODIFIED. `isPausedVisual` derivado, `rootClassName` condicional, 5º layer renderizando amber ring overlay, transition estendida com opacity 0.4s.
- `apps/desktop/src/renderer/components/Orb/__tests__/Orb.test.tsx` — MODIFIED. Reescrito: helper `mockContext()` com defaults Phase 23, 15 cenários totais (6 regression + 9 Phase 23). Corrigidos os 2 testes pre-existentes deferred desde v1.2 (#06B6D4 fantasma → #2BA8D4 real, transition 300ms → 400ms).
- `apps/desktop/tailwind.config.ts` — MODIFIED. 2 animations novos (`wake-burst`, `wake-burst-ring`) + 2 keyframes correspondentes. Comentário inline explicando o split entre transform + opacity.
- `apps/desktop/src/renderer/src/styles/globals.css` — MODIFIED. Bloco `@media (prefers-reduced-motion: reduce)` listando as 6 classes com `animation: none !important`. Transitions preservadas (D-05 explícito).
- `.planning/phases/23-orb-ux-polish/deferred-items.md` — CREATED. Log de 6 erros TS pré-existentes em arquivos não tocados pelo plano.

## Decisions Made

Todas as decisões seguem literalmente o bloco `<decisions>` do `23-CONTEXT.md`:

- **D-01** (wakeWordPaused como flag, não 5º state) — aplicado. O shape alvo do plan foi implementado exatamente.
- **D-02** (wake burst 350ms precedendo transição pra listening) — a API `triggerWakeBurst()` está pronta. O wire "só transição para listening depois do burst terminar" é do plan 02.
- **D-04** (default `wakeWordPaused=false`) — aplicado no `useState<boolean>(false)`.
- **D-05** (reduced-motion desliga animations, preserva transitions) — aplicado tanto no bloco `@media` quanto no Orb.tsx (transition list estendida para incluir opacity).

**Decisões delegadas para Plan 02 (23-02):**
- **D-03** — Tray menu item "Pause listening / Resume listening" (requer main process + ipcRenderer)
- **D-06** — Wiring do hook `useWakeWord.onDetected` ao `triggerWakeBurst()` + transição para listening via `setTimeout(350)` após burst
- **D-07** — Persistência de `wakeWordPaused` via electron-store (zero persistência neste plan — state é in-memory por design)

## Deviations from Plan

**None — plan executed exactly as written.**

Pequenos ajustes de fidelidade nos testes pre-existentes do Orb que já estavam listados explicitamente no `<behavior>` da Task 2 como "atualizar esses testes":
- Old: `expect(style).toContain('#06B6D4')` — o render nunca produziu essa cor
- New: `expect(style).toContain('#2BA8D4')` — o que o stateGradients.idle de fato contém
- Old: `transition: all 0.3s ease-in-out` — não existia no Orb.tsx v1.2
- New: `transition` contém `filter`, `opacity`, `0.4s` — o que Orb.tsx atualmente produz

Esses não são deviations — são parte do escopo da Task 2 (corrigir testes deferred do 22-04-SUMMARY).

## Issues Encountered

**`node_modules` ausente no worktree** — primeiro `pnpm test` falhou com `vitest: not found`. Resolvido com `pnpm install --ignore-scripts` (o `--ignore-scripts` evita o `download-wakeword-models.mjs` do postinstall que não é necessário para unit tests). Zero mudança no `package.json`; `pnpm-lock.yaml` foi apenas regenerado (não commitado porque nenhuma dep foi alterada).

**Pre-existing TypeScript errors (6 no total)** — `tsc --noEmit -p tsconfig.json` retorna 6 erros em arquivos que NÃO foram tocados pelo plan (main/index.ts, ChatInput.tsx, rmsZeroGuard.test.ts, integration-chat.test.ts). Documentado em `deferred-items.md`. Scope boundary (fix attempt limit): não fixei porque não são causados pelas mudanças deste plan — são regressões pré-existentes fora de escopo.

## Deferred Issues

Nenhum issue de escopo do plano foi deferido. Ver `deferred-items.md` para o log de erros TS pré-existentes não relacionados.

## User Setup Required

None — plan 100% renderer CSS + React state, zero config externa.

## Next Phase Readiness

**Plan 23-02 (tray kill switch + IPC wiring) pode começar imediatamente.** Superfície pronta:

- `useOrbContext().setWakeWordPaused(true/false)` — para wire no handler do tray menu "Pause/Resume listening"
- `useOrbContext().triggerWakeBurst()` — para wire no `useWakeWord.onDetected` callback
- Visual paused + burst overlay já renderizando (plan 02 valida E2E via screenshot)

**Zero blockers.** Tudo o que plan 02 precisa é IPC + main process + electron-store wiring.

## Self-Check: PASSED

**Files existence:**
- FOUND: apps/desktop/src/renderer/components/Orb/OrbContext.tsx
- FOUND: apps/desktop/src/renderer/components/Orb/Orb.tsx
- FOUND: apps/desktop/src/renderer/components/Orb/__tests__/OrbContext.test.tsx
- FOUND: apps/desktop/src/renderer/components/Orb/__tests__/Orb.test.tsx
- FOUND: apps/desktop/tailwind.config.ts
- FOUND: apps/desktop/src/renderer/src/styles/globals.css

**Commits existence:**
- FOUND: 1dfcada (Task 1 — OrbContext)
- FOUND: a1f5102 (Task 2 — Orb.tsx + tailwind)
- FOUND: ad34002 (Task 3 — globals.css reduced-motion)

**Verification run:**
- `pnpm --filter @jarvis/desktop test --run src/renderer/components/Orb/` → 30/30 passing
- `grep "prefers-reduced-motion" apps/desktop/src/renderer/src/styles/globals.css` → 2 matches
- `grep "wake-burst" apps/desktop/tailwind.config.ts` → 6 matches (animation + keyframes)

---
*Phase: 23-orb-ux-polish*
*Plan: 01*
*Completed: 2026-04-11*
