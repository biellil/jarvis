---
phase: 48
plan: 02
subsystem: design-system-foundation
tags: [ui, primitives, shadcn, radix, tailwind-v4]
requires:
  - 48-01 (tokens + cn helper + Radix peers + shadcn init)
provides:
  - "components/ui/button.tsx — Button + buttonVariants"
  - "components/ui/input.tsx — Input"
  - "components/ui/label.tsx — Label (Radix)"
  - "components/ui/select.tsx — Select + SelectTrigger/Content/Item/Value/Group/Label/Separator/Scroll buttons"
  - "components/ui/slider.tsx — Slider (Radix, VAD-visual continuity)"
affects:
  - "Phase 49: Settings refactor will import these primitives"
  - "Phase 50: Whisper download UX will reuse Button + Progress (Plan 03)"
tech-stack:
  added: []
  patterns:
    - "cva for variant composition (Button, Input)"
    - "Radix forwardRef + asChild slot pattern (Button, Label, Select, Slider)"
    - "Tailwind v4 / opacity syntax for token-based alpha (destructive/30, accent/40, fg-disabled)"
    - "aria-[invalid=true] driven error styling on Input"
    - "[@media(pointer:coarse)]:before: hit target on Slider thumb"
key-files:
  created:
    - apps/desktop/src/renderer/src/components/ui/button.tsx
    - apps/desktop/src/renderer/src/components/ui/input.tsx
    - apps/desktop/src/renderer/src/components/ui/label.tsx
    - apps/desktop/src/renderer/src/components/ui/select.tsx
    - apps/desktop/src/renderer/src/components/ui/slider.tsx
  modified: []
decisions:
  - "Wrote primitives manually instead of via shadcn CLI: CLI ran but produced no output (likely Tailwind v4 detection issue, the plan's documented fallback). Manual write follows the variant matrices in UI-SPEC verbatim."
  - "Used `ring-destructive/30` (Tailwind v4 token + opacity) instead of the literal `rgba(244,63,94,0.30)` from the plan's example for Input error state — same visual, but token-derived and passes the no-hardcoded-rgba grep."
  - "Imported via the `@/` alias (e.g. `import { cn } from '@/lib/cn'`) — confirmed working in `electron.vite.config.ts` resolve.alias and `tsconfig.json` paths."
metrics:
  tasks: 2
  files: 5
  duration: ~6min
  completed: 2026-05-03
---

# Phase 48 Plan 02: Core UI Primitives Summary

Five Radix-backed UI primitives (Button, Input, Label, Select, Slider) consuming Tailwind v4 @theme tokens — the surface Phase 49's Settings refactor will compose against.

## Variant Inventory

| Primitive | Variants | Sizes | Notable States |
|-----------|----------|-------|----------------|
| Button    | primary, secondary, ghost, destructive | sm (28px), md (36px, default), lg (44px) | hover, active, focus-visible (accent ring), disabled |
| Input     | default, error | sm (32px), md (36px, default) | hover, focus-visible, disabled, aria-[invalid=true] |
| Label     | (single)        | (single) | default, peer-disabled |
| Select    | (Radix surface — Trigger + Content + Item + Value + Group + Label + Separator + Scroll buttons) | trigger md (36px) | hover, focus-visible, data-[state=open], data-[highlighted], data-[state=checked], data-[disabled] |
| Slider    | (single)        | (single) | hover, focus-visible (ring-offset-bg), active (scale-105 + glow), disabled |

## Documented Exceptions (no-hardcoded-color rule)

1. **`select.tsx` — `bg-slate-900` on `SelectContent`.**
   UI-SPEC §3 mandates a full-opacity panel; the `--color-surface` token is 70% alpha (translucent). Comment in source documents the rationale.

2. **`slider.tsx` — `rgba(6,182,212,0.4|0.6|0.7)` on `SliderPrimitive.Thumb` shadows.**
   Continuity with the legacy VAD slider visual that Phase 40 introduced and that UI-SPEC §4 explicitly preserves. Verifier allowlists `rgba(6,182,212,*)` only in this file.

Both exceptions are pinned by the Task 2 verifier regexes, so any drift will fail the gate.

## Verification Results

- `cd apps/desktop && node` Task 1 grep → **PASS** (`Task1 OK`)
- `cd apps/desktop && node` Task 2 grep → **PASS** (`Task2 OK`)
- `pnpm exec tsc --noEmit` filtered to `components/ui/**` → **PASS** (no errors)
- `pnpm build` → **PASS** (1.56s main, 21ms preload, 2.34s renderer; no warnings on the new files)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Replaced literal `rgba(244,63,94,0.30)` with `ring-destructive/30` in `input.tsx`**
- **Found during:** Task 1 verification
- **Issue:** The plan's suggested arbitrary value `ring-[rgba(244,63,94,0.30)]` for the Input error focus state is functionally identical to the destructive token at 30% opacity, but it tripped the plan's own no-hardcoded-rgba banlist regex.
- **Fix:** Used `ring-destructive/30` (Tailwind v4 opacity-on-token syntax) — same visual, token-derived, passes the gate.
- **Files modified:** `apps/desktop/src/renderer/src/components/ui/input.tsx`
- **Commit:** `9261afb`

**2. [Rule 3 — Blocking] Wrote primitives manually instead of via `shadcn add`**
- **Found during:** Task 1 (CLI invocation)
- **Issue:** `pnpm dlx shadcn@latest add button input label --yes` ran for ~90s with no output and didn't create files (likely Tailwind v4 vs v3 detection — the plan documents this as a known fallback case).
- **Fix:** Authored the five files by hand following the variant matrices in UI-SPEC §1–5 verbatim. All pass the per-primitive grep checks.
- **Files modified:** all five primitives
- **Commit:** `9261afb`, `7cbe4d2`

## Auth Gates

None.

## Deferred Issues

Pre-existing TypeScript errors in `useMultiTurnWindow.ts`, `useWakeWord.ts`, and `rmsZeroGuard.test.ts` are logged in `.planning/phases/48-design-system-foundation/deferred-items.md`. They predate Phase 48 and are out of scope for the design-system-foundation phase.

## Continuity for Plan 03

Plan 03 will:
- Add the barrel `components/ui/index.ts` re-exporting all five primitives (so consumers can `import { Button, Slider } from '@/components/ui'`).
- Author the in-repo primitives (`Field`, `HotkeyRecorder`, `Progress`).
- Migrate `SettingsForm.tsx`'s `aria-valuetext={\`${vadThresholdMs} milliseconds\`}` semantic when wiring `<Slider>` (Phase 49, but Plan 03 will document the contract).

## Self-Check: PASSED

- `apps/desktop/src/renderer/src/components/ui/button.tsx` — FOUND
- `apps/desktop/src/renderer/src/components/ui/input.tsx` — FOUND
- `apps/desktop/src/renderer/src/components/ui/label.tsx` — FOUND
- `apps/desktop/src/renderer/src/components/ui/select.tsx` — FOUND
- `apps/desktop/src/renderer/src/components/ui/slider.tsx` — FOUND
- Commit `9261afb` (Task 1) — FOUND
- Commit `7cbe4d2` (Task 2) — FOUND
