---
phase: 49-settings-layout-refactor
plan: 01
subsystem: ui
tags: [react, tailwind, lucide-react, settings, sidebar, ipc]

requires:
  - phase: 48-design-system-foundation
    provides: Button primitive (variant/size API), design tokens (bg-surface, text-fg, bg-accent-soft, border-accent, spacing scale)

provides:
  - SettingsLayout shell component with 200px fixed sidebar, scrollable content panel, sticky save bar
  - SettingsSectionProps interface for Wave 2 section components
  - All form state management (pttHotkey, ttsProvider, ttsApiKey, ttsVoiceIds, whisperModel, vadThresholdMs)
  - IPC integration (window.settings.get/save/close/setVadThreshold)
  - Dirty tracking via JSON.stringify comparison (vadThresholdMs excluded)
  - Placeholder section stubs for Wave 1 buildability

affects: [49-02, 49-03, 49-04, Phase 50]

tech-stack:
  added: []
  patterns:
    - "SettingsSectionProps interface as prop contract between layout shell and section components"
    - "Inline placeholder stubs with // PLACEHOLDER comment for Wave 3 replacement"
    - "Dirty tracking via JSON.stringify on saveable fields only (vadThresholdMs excluded)"

key-files:
  created:
    - apps/desktop/src/renderer/src/settings/SettingsLayout.tsx
  modified: []

key-decisions:
  - "Inline placeholder stubs in SettingsLayout.tsx for Wave 1 buildability (option b from plan) — avoids TS import errors until Wave 2/3 section files exist"
  - "vadThresholdMs excluded from dirty tracking — real-time IPC apply, no Save button needed"
  - "Toast inline JSX preserved from SettingsForm.tsx pattern (no Toast.tsx import)"

patterns-established:
  - "SettingsSectionProps: single props interface consumed by all 4 section components"
  - "Section routing: local useState<SectionKey> with switch/renderSection() — no persistence"

requirements-completed: [REDESIGN-01, REDESIGN-04]

duration: 15min
completed: 2026-05-03
---

# Phase 49 Plan 01: SettingsLayout Shell Summary

**Sidebar-nav settings shell with 200px fixed sidebar, internal-scroll content panel, sticky save bar, and SettingsSectionProps interface contract for Wave 2 section components**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-03T16:35:55Z
- **Completed:** 2026-05-03T16:51:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `SettingsLayout.tsx` with full sidebar (200px fixed, 4 nav items, lucide icons, active-state styling using `bg-accent-soft` + `border-accent` 2px left border)
- Migrated all form state and IPC logic from monolithic `SettingsForm.tsx` — `window.settings.get/save/close/setVadThreshold` all preserved
- Exported `SettingsSectionProps` interface enabling Wave 2 section components to receive typed props
- Inline placeholder section stubs keep Wave 1 TypeScript-clean and buildable without Wave 2 files

## Task Commits

1. **Task 1: Create SettingsLayout.tsx — shell, state, nav, save bar** - `dd7ebb3` (feat)

**Plan metadata:** (pending — added in final commit)

## Files Created/Modified

- `apps/desktop/src/renderer/src/settings/SettingsLayout.tsx` — Settings shell: sidebar + content area + sticky save bar + all form state + SettingsSectionProps interface

## Decisions Made

- **Inline placeholders (option b):** Wave 2 section components don't exist yet; defined minimal placeholder stubs inline with `// PLACEHOLDER — replace with real import in Wave 3` comment. This avoids TypeScript import errors and keeps the build green.
- **vadThresholdMs excluded from dirty tracking:** VAD threshold applies in real-time via IPC — saving it separately would be redundant. Only the 5 fields sent to `window.settings.save` participate in dirty comparison.
- **Toast as inline JSX:** `SettingsForm.tsx` used inline toast JSX (not a separate Toast.tsx import). Pattern preserved verbatim — no dependency change needed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - pre-existing TypeScript errors in other files (test fixtures, `index.ts`, `voiceHandler.ts`) were confirmed pre-existing before this plan ran; SettingsLayout.tsx introduced zero new TS errors.

## Known Stubs

The following placeholder sections are intentional Wave 1 stubs — Wave 3 (plan 49-04) replaces them with real section component imports:

| Stub | File | Notes |
|------|------|-------|
| `PttSection` inline function | `settings/SettingsLayout.tsx:~280` | Shows hotkey as read-only input; real version uses Phase 48 HotkeyRecorder |
| `AlwaysListeningSection` inline function | `settings/SettingsLayout.tsx:~305` | Shows range slider without Phase 48 Slider primitive |
| `TtsSection` inline function | `settings/SettingsLayout.tsx:~335` | Shows native select/input; real version uses Phase 48 Select/Input/Field |
| `WhisperSection` inline function | `settings/SettingsLayout.tsx:~380` | Shows native select; real version uses Phase 48 Select/Field |

These stubs do NOT prevent the plan goal (shell + interface contract) from being achieved. Wave 2 creates the real section files; Wave 3 wires them.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `SettingsSectionProps` interface is available for Wave 2 section components to consume
- `SettingsLayout` renders and routes correctly between 4 sections via `activeSection` state
- Save bar with conditional disabled Save button functional
- Wave 2 (plans 49-02, 49-03) can now create `PttSection`, `AlwaysListeningSection`, `TtsSection`, `WhisperSection` using the exported `SettingsSectionProps` type

## Self-Check: PASSED

- FOUND: `apps/desktop/src/renderer/src/settings/SettingsLayout.tsx`
- FOUND: commit `dd7ebb3` (feat(49-01): create SettingsLayout shell)
- TypeScript: zero errors attributable to SettingsLayout.tsx

---
*Phase: 49-settings-layout-refactor*
*Completed: 2026-05-03*
