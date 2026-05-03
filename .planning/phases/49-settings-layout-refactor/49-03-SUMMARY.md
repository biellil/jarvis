---
phase: 49-settings-layout-refactor
plan: 03
subsystem: ui
tags: [react, tailwind, radix-ui, settings, field, select, input]

requires:
  - phase: 49-settings-layout-refactor
    plan: 01
    provides: SettingsSectionProps interface

provides:
  - TtsSection component (TTS provider/key/voice configuration)
  - WhisperSection component (Whisper model select with D-12 helper text)

affects: [49-04]

tech-stack:
  added: []
  patterns:
    - "Phase 48 Field compound (Field.Label + Field.Control + Field.Helper + Field.Error) wrapping Radix Select/Input"
    - "Pick<SettingsSectionProps, ...> pattern for section-scoped prop types"
    - "voiceIdPlaceholder computed from ttsProvider — murf vs elevenlabs"
    - "D-12 helper text: whisperModel === 'auto' branches on literal string"

key-files:
  created:
    - apps/desktop/src/renderer/src/settings/sections/TtsSection.tsx
    - apps/desktop/src/renderer/src/settings/sections/WhisperSection.tsx
  modified: []

key-decisions:
  - "TtsSection uses Radix Select (button, not native <select>) — existing SettingsForm test that targets native <select> via getByLabelText will need update in Wave 3 (plan 49-04). ARIA label TTS provider added to SelectTrigger for partial compatibility."
  - "Field.Error renders empty string when apiKeyError is null — avoids conditional rendering flicker; Field error={!!apiKeyError} controls visibility"

requirements-completed: [REDESIGN-01]

duration: 3min
completed: 2026-05-03
---

# Phase 49 Plan 03: TtsSection and WhisperSection Summary

**TTS provider/key/voice section and Whisper model select section built with Phase 48 Field + Select + Input primitives — no legacy HTML selects or gray tokens**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-03T16:41:58Z
- **Completed:** 2026-05-03T16:44:24Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `TtsSection.tsx` with Provider Select (Radix), API Key Input wired to `Field.Error` via `apiKeyError`, Voice ID Input with provider-adaptive placeholder, active provider `role="status"` badge
- Created `WhisperSection.tsx` with 6-option Whisper model Select and D-12 conditional `Field.Helper` text ("Auto: model selected based on available VRAM" / "Manual: {model}")
- Both components use `Pick<SettingsSectionProps, ...>` for clean prop scoping
- All ARIA labels preserved for test compatibility
- Zero legacy tokens (`bg-gray-*`, `text-white/`)
- TypeScript clean — zero errors attributable to either new file

## Task Commits

1. **Task 1: Create TtsSection.tsx** - `ee96208` (feat)
2. **Task 2: Create WhisperSection.tsx** - `e6cbfd9` (feat)

## Files Created/Modified

- `apps/desktop/src/renderer/src/settings/sections/TtsSection.tsx` — TTS provider/key/voice section with Phase 48 primitives
- `apps/desktop/src/renderer/src/settings/sections/WhisperSection.tsx` — Whisper model select with D-12 conditional helper

## Decisions Made

- **Field.Error empty string pattern:** `<Field.Error>{apiKeyError ?? ''}</Field.Error>` keeps DOM stable; `error={!!apiKeyError}` on `<Field>` controls visibility. No conditional rendering needed.
- **Radix Select vs native select:** Phase 48 Select renders a Radix `<button>`, not a native `<select>`. Any existing test that uses `fireEvent.change` on `getByLabelText(/TTS provider/i)` targeting a native select will fail. ARIA label added to `<SelectTrigger>` for label lookup compatibility, but `fireEvent.change` interaction remains broken. Wave 3 (plan 49-04) must update the test to use `userEvent` or Radix test utilities.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. Both section files are fully wired and complete — no placeholder patterns, no hardcoded empty values flowing to UI.

## Issues Encountered

Pre-existing TypeScript errors in `src/main/__tests__/integration-chat.test.ts`, `src/main/index.ts`, `src/main/ipc/__tests__/settings.test.ts` — confirmed pre-existing before this plan ran. Neither TtsSection nor WhisperSection introduced any new TS errors.

## Known Test Compatibility Issue (documented for Wave 3)

The existing `SettingsForm.test.tsx` likely targets TTS provider as a native `<select>` element via `getByLabelText(/TTS provider/i) as HTMLSelectElement`. The Phase 48 `Select` component renders a Radix `<button>` (not a `<select>`), so:
- `getByLabelText` lookup: will succeed if the test queries by aria-label (added to `<SelectTrigger aria-label="TTS provider">`)
- `fireEvent.change(...)`: will fail — Radix button does not accept native change events
- Fix: update test to use `userEvent.click` on trigger + `userEvent.click` on item, OR use Radix test utilities

This is a Wave 3 (plan 49-04) concern — it will surface when 49-04 wires the real section imports into SettingsLayout and runs the test suite.

## Self-Check: PASSED

- FOUND: `apps/desktop/src/renderer/src/settings/sections/TtsSection.tsx`
- FOUND: `apps/desktop/src/renderer/src/settings/sections/WhisperSection.tsx`
- FOUND: commit `ee96208` (feat(49-03): create TtsSection)
- FOUND: commit `e6cbfd9` (feat(49-03): create WhisperSection)
- TypeScript: zero errors attributable to TtsSection.tsx or WhisperSection.tsx

---
*Phase: 49-settings-layout-refactor*
*Completed: 2026-05-03*
