---
phase: 42-orb-visual-per-mode
plan: 03
subsystem: ui
tags: [react, electron, orb, voice-mode, css-gradient, badge, toast, ipc]

# Dependency graph
requires:
  - phase: 42-02
    provides: OrbContext voiceMode state and IPC subscription
  - phase: 42-01
    provides: TDD red scaffolds for Orb.test.tsx per-mode + badge tests
provides:
  - Orb.tsx per-mode idle gradient (green=always-listening, orange=ptt-only, blue=wake-word)
  - Orb.tsx Layer 6 mode badge (WW/AL/PTT) always visible with role=status
  - Orb.tsx crossfade extended to voiceMode axis (second useEffect on [voiceMode, state])
  - App.tsx success toast "Modo: {label}" with 2000ms auto-dismiss on mode switch
affects:
  - phase 43 (ptt-only-integration — badge visible during all PTT states)
  - phase 44 (always-listening — badge visible and colored correctly)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "modeIdleGradients lookup table: Record<VoiceMode, string> keyed by VoiceMode"
    - "Dual crossfade useEffect: state axis + voiceMode axis (Pitfall 1 guard)"
    - "activeIdleGradient/activeIdleGlow computed BEFORE glowRgba to avoid TDZ"
    - "Layer 6 badge: unconditional render (all OrbStates), role=status, aria-live=polite"
    - "VoiceModeSwitchResult typed handler with success/failure branches"

key-files:
  created: []
  modified:
    - apps/desktop/src/renderer/components/Orb/Orb.tsx
    - apps/desktop/src/renderer/src/App.tsx

key-decisions:
  - "activeIdleGradient/activeIdleGlow must be declared before glowRgba to avoid JS TDZ error"
  - "innerBorder applied to both Layer 1 container AND sublayer B (.animate-pulse-idle) — test expects it on the sublayer"
  - "Badge is unconditional — NOT guarded by state==='idle', renders in all OrbStates per VUI-03"
  - "Two crossfade useEffects: first handles state transitions, second handles voiceMode changes while idle"
  - "App.tsx autoCloseMs changed from undefined to 2000 — non-action toasts auto-dismiss"

patterns-established:
  - "Phase 42 mode-lookup pattern: const x = state === 'idle' ? modeMap[voiceMode] : stateMap[state]"
  - "Dual crossfade axis: separate useEffect for [state] and [voiceMode, state] to avoid Pitfall 1"

requirements-completed: [VUI-02, VUI-03]

# Metrics
duration: 20min
completed: 2026-04-29
---

# Phase 42 Plan 03: Orb Visual Per-Mode — GREEN Pass Summary

**Per-mode idle gradient + Layer 6 mode badge in Orb.tsx with crossfade, plus App.tsx success toast "Modo: {label}" auto-dismissing at 2000ms — all 26 Orb.test.tsx tests now green**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-29T19:54:00Z
- **Completed:** 2026-04-29T20:14:50Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Orb.tsx now renders green gradient when `voiceMode='always-listening'` and `state='idle'`, orange for `ptt-only`, blue for `wake-word` (no regression)
- Layer 6 mode badge (WW/AL/PTT) renders unconditionally for all OrbStates with `role="status"`, `aria-live="polite"`, `bottom: 14px`, `pointerEvents: 'none'`
- Crossfade extended to the voiceMode axis — switching modes while idle triggers smooth 400ms crossfade
- App.tsx fires `info` toast "Modo: {label}" on successful mode switch; auto-dismisses at 2000ms; action toasts (mic-denied) still use 0ms (manual dismiss)
- All 26 Orb.test.tsx tests pass (11 new Phase 42 tests + 15 pre-existing regression)

## Task Commits

1. **Task 1: Extend Orb.tsx with per-mode idle gradient and Layer 6 badge** - `3185fa3` (feat)
2. **Task 2: Extend App.tsx switch-result handler with success branch** - `5a883ee` (feat)

## Files Created/Modified
- `apps/desktop/src/renderer/components/Orb/Orb.tsx` - Added VoiceMode import, 6 lookup maps, `voiceMode` destructuring, `activeIdleGradient`/`activeIdleGlow` computations, dual crossfade useEffect, Layer 6 badge JSX, `innerBorder` on sublayer B
- `apps/desktop/src/renderer/src/App.tsx` - Added `VoiceModeSwitchResult` import and type, success branch in `handleSwitchResult`, `autoCloseMs` from `undefined` to `2000`

## Decisions Made
- **TDZ fix required:** `activeIdleGradient`/`activeIdleGlow` must be declared before `glowRgba` (which uses `activeIdleGlow`). The plan placed them after `rootClassName` which caused "Cannot access 'activeIdleGlow' before initialization" at runtime.
- **innerBorder on sublayer B:** The 42-01 RED test queries `.animate-pulse-idle` for `style.border`. Original code only had `innerBorder` on the Layer 1 container. Added border to sublayer B so the test passes without structural change to the container.
- **Badge unconditional:** Badge renders for all OrbStates per VUI-03 spec — no `state === 'idle'` guard.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TDZ: moved activeIdleGradient/activeIdleGlow before glowRgba**
- **Found during:** Task 1 (Orb.tsx implementation)
- **Issue:** Plan's implementation placed `activeIdleGradient`/`activeIdleGlow` after `rootClassName`, but `glowRgba` (declared earlier) references `activeIdleGlow` — causing JS temporal dead zone error at render time
- **Fix:** Moved the two `const activeIdle*` declarations to before `glowRadius`/`glowRgba` in the function body
- **Files modified:** apps/desktop/src/renderer/components/Orb/Orb.tsx
- **Verification:** 22 tests that were failing with "Cannot access 'activeIdleGlow' before initialization" now pass
- **Committed in:** 3185fa3 (Task 1 commit)

**2. [Rule 1 - Bug] Added innerBorder to sublayer B (.animate-pulse-idle)**
- **Found during:** Task 1 (Orb.tsx — running tests after TDZ fix)
- **Issue:** Phase 42-01 RED test expects `.animate-pulse-idle` to have `style.border` with `rgba(180,180,180,0.22)` when paused. The existing code only applied `innerBorder` to the Layer 1 container div, not to the sublayer.
- **Fix:** Added `border: '1px solid ${innerBorder}'` to sublayer B (the `.animate-pulse-idle` element)
- **Files modified:** apps/desktop/src/renderer/components/Orb/Orb.tsx
- **Verification:** `inner sphere border is rgba(180,180,180,0.22) when paused` test now passes
- **Committed in:** 3185fa3 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2x Rule 1 — bug fix)
**Impact on plan:** Both fixes required for tests to pass. No scope creep, no structural changes.

## Issues Encountered
- Worktree branch was missing Phase 42-01 and 42-02 commits — fixed via `git merge master` at execution start
- Pre-existing test failures in `src/main` tests (WakeWordEngine, voiceHandler, integration-chat, etc.) — NOT caused by Phase 42 changes, out of scope

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- VUI-02 and VUI-03 requirements fully implemented and tested
- Phase 42 is complete — Orb visual per-mode identity delivered end-to-end
- Phase 43 (ptt-only-integration) can proceed — badge will render correctly in all voice states

---
*Phase: 42-orb-visual-per-mode*
*Completed: 2026-04-29*
