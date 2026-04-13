---
phase: 28
plan: 01
subsystem: renderer/orb-visual
tags: [ui, orb-state, animation, accessibility]
dependency_graph:
  requires: []
  provides:
    - awaiting-followup-visual-state
  affects:
    - OrbContext (type extension)
    - Orb (visual rendering)
    - tailwind.config (animation tokens)
tech_stack:
  added: []
  patterns:
    - Record<OrbState, ...> exhaustiveness pattern
    - CSS keyframe animation with reduced-motion support
key_files:
  created: []
  modified:
    - apps/desktop/src/renderer/components/Orb/OrbContext.tsx
    - apps/desktop/src/renderer/components/Orb/Orb.tsx
    - apps/desktop/tailwind.config.ts
    - apps/desktop/src/renderer/src/styles/globals.css
decisions:
  - Sky-400 color (#0EA5E9) chosen for visual distinction from idle cyan and responding blue
  - 1.5s pulse timing bridges idle (2s slow) and listening (1s eager) for gentle waiting feel
  - Reduced-motion support via globals.css @media query with static 95% opacity fallback
metrics:
  duration_minutes: 11
  tasks_completed: 3
  files_modified: 4
  commits: 3
  completed: 2026-04-13
---

# Phase 28 Plan 01: Orb Visual State Extension Summary

**One-liner:** Extended orb visual system with 5th state 'awaiting-followup' — sky-400 color, 1.5s pulse animation, and reduced-motion support for post-TTS listening window.

## What Was Built

Added visual rendering infrastructure for the new 'awaiting-followup' orb state (MTURN-03), completing the type-safe extension of the orb state machine from 4 to 5 states.

**Type safety:** OrbState union type extended in OrbContext.tsx, forcing all Record<OrbState, ...> mappings to handle the new state explicitly.

**Visual tokens:** Sky-400 (#0EA5E9) gradient, ripple color, and glow effect added to all state-dependent mappings in Orb.tsx.

**Animation:** pulse-followup keyframe (1.5s, scale 1.06, opacity 0.92) added to tailwind.config.ts, bridging idle's slow breathing (2s) and listening's eager pulse (1s).

**Accessibility:** Reduced-motion support added to globals.css, disabling animation and showing static sky-400 at 95% opacity for users with motion sensitivity.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Extend OrbState type with 'awaiting-followup' | c30c220 | OrbContext.tsx |
| 2 | Add awaiting-followup visual rendering to Orb.tsx | 7cbc538 | Orb.tsx |
| 3 | Add pulse-followup animation and reduced-motion support | e7afde8 | tailwind.config.ts, globals.css |

## Deviations from Plan

None — plan executed exactly as written.

All tasks completed successfully with no blocking issues, no auto-fixes required, and no architectural changes needed.

## Verification

**Type safety:**
- `grep "export type OrbState" apps/desktop/src/renderer/components/Orb/OrbContext.tsx` shows 5 states including 'awaiting-followup'
- `pnpm build` passes without TypeScript errors — all Record<OrbState, ...> mappings are exhaustive

**Visual contract:**
- `grep "awaiting-followup.*radial-gradient" apps/desktop/src/renderer/components/Orb/Orb.tsx` shows sky-400 gradient
- `grep "awaiting-followup.*0EA5E9" apps/desktop/src/renderer/components/Orb/Orb.tsx` shows 3 color references (gradient, ripple, glow)
- `grep "awaiting-followup.*animate-pulse-followup" apps/desktop/src/renderer/components/Orb/Orb.tsx` shows animation class assignment

**Animation tokens:**
- `grep "pulse-followup.*1.5s" apps/desktop/tailwind.config.ts` shows animation definition
- `grep -A 3 "'pulse-followup':" apps/desktop/tailwind.config.ts | grep "scale"` shows keyframe with scale 1.06
- `grep "orb-followup.*rgba.*14.*165.*233" apps/desktop/tailwind.config.ts` shows sky-400 glow shadow

**Accessibility:**
- `grep "animate-pulse-followup" apps/desktop/src/renderer/src/styles/globals.css` shows reduced-motion override
- Static opacity 0.95 fallback for users with prefers-reduced-motion

**Regression guard:**
- Existing idle/listening/processing/responding visuals unchanged (verified by build passing)
- No runtime behavior changes — pure visual/type extension

## Files Modified

### apps/desktop/src/renderer/components/Orb/OrbContext.tsx
- Extended `OrbState` type from 4 to 5 states
- Added comment documenting Phase 28 extension (D-09)

### apps/desktop/src/renderer/components/Orb/Orb.tsx
- Added sky-400 gradient to `stateGradients` mapping
- Added sky-400 ripple color to `rippleColor` mapping
- Added sky-400 glow (0.55 alpha) to `stateGlow` mapping
- Added `animate-pulse-followup` to `baseAnimationClass` mapping
- Local `OrbState` type updated to match OrbContext

### apps/desktop/tailwind.config.ts
- Added `pulse-followup: 1.5s ease-in-out infinite` animation
- Added `pulse-followup` keyframe (scale 1→1.06→1, opacity 1→0.92→1)
- Added `orb-followup` box-shadow with sky-400 glow

### apps/desktop/src/renderer/src/styles/globals.css
- Added `.animate-pulse-followup` to reduced-motion media query
- Added static opacity 0.95 override for reduced-motion users

## Known Stubs

None — no stubs or placeholder data in this plan. All visual tokens are fully implemented and production-ready.

## Implementation Notes

**Color rationale (D-10):** Sky-400 (#0EA5E9) was chosen as a lighter, less saturated blue than both idle cyan (#06B6D4) and responding blue (#3B82F6). It visually reads as "passive but attentive" — distinguishing clearly from idle (warm wake-word energy) and responding (active electric feel).

**Animation timing (D-11):** 1.5s timing + 1.06 scale reads as "gently waiting" — slower than listening's eagerness (1s, 1.08 scale), faster than idle's rest (2s, 1.05 scale). The opacity dip to 0.92 at 50% adds subtle breathing feel without being too aggressive.

**Reduced-motion (D-12):** Pattern consistent with Phase 23 (ORB-POL-01). Users with motion sensitivity see stable sky-400 color at 95% opacity instead of pulsing. Transitions are preserved (they're essential for communicating state changes and don't trigger vestibular issues).

**TypeScript exhaustiveness:** Adding 'awaiting-followup' to the OrbState union type intentionally forces all Record<OrbState, ...> consumers to handle the new state — this is a type-safe extension pattern that prevents silent failures when state machine evolves.

## Next Steps

This plan provides the visual foundation for Phase 28 Plan 02, which will implement the multi-turn listening window logic (timer, VAD integration, TTS hooks) that drives the state transitions into and out of 'awaiting-followup'.

**Dependencies unlocked:** Plan 02 can now trigger `orbContext.setState('awaiting-followup')` and expect correct visual rendering with sky-400 glow and gentle pulse animation.

## Self-Check

**Files exist:**
```
✓ apps/desktop/src/renderer/components/Orb/OrbContext.tsx
✓ apps/desktop/src/renderer/components/Orb/Orb.tsx
✓ apps/desktop/tailwind.config.ts
✓ apps/desktop/src/renderer/src/styles/globals.css
```

**Commits exist:**
```
✓ c30c220 — Task 1: OrbState type extension
✓ 7cbc538 — Task 2: Orb visual rendering
✓ e7afde8 — Task 3: Tailwind animation tokens
```

**Build passes:**
```
✓ pnpm build succeeded — no TypeScript errors, Vite compiled all modules
```

## Self-Check: PASSED

All files modified, all commits present, TypeScript compilation successful, grep patterns verified.
