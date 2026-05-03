---
phase: 49-settings-layout-refactor
plan: 02
subsystem: ui
tags: [react, tailwind, radix-ui, settings, hotkey, vad, slider]

requires:
  - phase: 49-settings-layout-refactor (plan 01)
    provides: SettingsSectionProps interface exported from SettingsLayout.tsx
  - phase: 48-design-system-foundation
    provides: HotkeyRecorder, Slider, Button, Field primitives in components/ui barrel

provides:
  - PttSection component — PTT hotkey section using HotkeyRecorder inside Field
  - AlwaysListeningSection component — VAD slider with real-time IPC callback and ghost reset button

affects: [49-04, Phase 50]

tech-stack:
  added: []
  patterns:
    - "Pick<SettingsSectionProps, ...> for section-level prop narrowing — each section receives only what it needs"
    - "Radix Slider scalar wrap/unwrap pattern: value={[scalar]} → onValueChange={(vals) => handler(vals[0]!)}"
    - "ARIA preservation via exact string constants to stay in sync with existing Vitest tests"

key-files:
  created:
    - apps/desktop/src/renderer/src/settings/sections/PttSection.tsx
    - apps/desktop/src/renderer/src/settings/sections/AlwaysListeningSection.tsx
  modified: []

key-decisions:
  - "Pick<SettingsSectionProps> narrowing per section — each section only destructures props it actually uses, not full interface"
  - "Scalar vadThresholdMs wrapped as [vadThresholdMs] for Radix SliderPrimitive.Root value: number[] API, unwrapped in callback via vals[0]!"
  - "ARIA strings kept as exact string literals matching existing Vitest getByLabelText/getByText test matchers"

patterns-established:
  - "Section files consume SettingsSectionProps via Pick — contract is enforced at import site, not runtime"
  - "void operator on async IPC handlers in JSX event callbacks (void onVadThresholdChange(vals[0]!))"

requirements-completed: [REDESIGN-01]

duration: 10min
completed: 2026-05-03
---

# Phase 49 Plan 02: PttSection and AlwaysListeningSection Summary

**PttSection with Phase 48 HotkeyRecorder/Field and AlwaysListeningSection with Radix Slider, exact ARIA strings, and real-time VAD IPC delegation**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-03T16:43:00Z
- **Completed:** 2026-05-03T16:53:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `PttSection.tsx` — renders h1 "Push-to-Talk Settings", description, and HotkeyRecorder wrapped in Field.Label + Field.Control; uses only Phase 48 primitives, no raw HTML inputs
- Created `AlwaysListeningSection.tsx` — renders h1 "Voice Activity Detection", Radix Slider with all ARIA attributes preserved (`aria-label="VAD silence threshold in milliseconds"`, `aria-valuenow`, `aria-valuetext`), value display "{N} ms", and ghost "Reset to Default (500ms)" button; delegates all state to parent via onVadThresholdChange/onVadThresholdReset
- Both components are purely presentational — no local state, no IPC calls, no legacy tokens

## Task Commits

1. **Task 1: Create PttSection.tsx** - `be844f2` (feat)
2. **Task 2: Create AlwaysListeningSection.tsx** - `1f750f6` (feat)

**Plan metadata:** (added in final commit)

## Files Created/Modified

- `apps/desktop/src/renderer/src/settings/sections/PttSection.tsx` — PTT section: h1 + description + HotkeyRecorder inside Field
- `apps/desktop/src/renderer/src/settings/sections/AlwaysListeningSection.tsx` — VAD section: h1 + description + Slider (full ARIA) + ms display + ghost reset button

## Decisions Made

- **Pick narrowing:** Each section receives only the props it needs via `Pick<SettingsSectionProps, ...>` — enforces interface boundaries at compile time and makes section dependencies explicit.
- **Slider wrap/unwrap:** Radix `SliderPrimitive.Root` requires `value: number[]` but `vadThresholdMs` is a scalar. Pattern `value={[vadThresholdMs]}` / `vals[0]!` is the standard unwrap with non-null assertion (min/max bounds guarantee defined value).
- **ARIA exact strings:** `aria-label="VAD silence threshold in milliseconds"` must be exact — existing Vitest tests use `getByLabelText(/VAD silence threshold in milliseconds/i)` which would fail on any rephrasing.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — both files compiled TypeScript-clean with zero errors attributable to the new section files.

## Known Stubs

None — both section components are fully implemented with real Phase 48 primitives. No placeholder or hardcoded values.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `PttSection` and `AlwaysListeningSection` are ready for Wave 3 (plan 49-04) to replace the inline placeholder stubs in `SettingsLayout.tsx`
- Wave 2 parallel (plan 49-03) creates `TtsSection` and `WhisperSection`; all four sections wired together in plan 49-04

## Self-Check: PASSED

- FOUND: `apps/desktop/src/renderer/src/settings/sections/PttSection.tsx`
- FOUND: `apps/desktop/src/renderer/src/settings/sections/AlwaysListeningSection.tsx`
- FOUND: commit `be844f2` (feat(49-02): create PttSection)
- FOUND: commit `1f750f6` (feat(49-02): create AlwaysListeningSection)
- TypeScript: zero errors attributable to either section file

---
*Phase: 49-settings-layout-refactor*
*Completed: 2026-05-03*
