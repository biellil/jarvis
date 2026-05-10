---
phase: 63-vision-pipeline-ts
plan: "04"
subsystem: desktop-settings-ui
tags: [vision, settings, electron, react, hotkey, ipc]
dependency_graph:
  requires:
    - phase: 63-01
      provides: getScreenshotHotkey/setScreenshotHotkey store accessors, screenshot-hotkey.ts with changeScreenshotHotkey
  provides: [screenshotHotkey-settings-ui, HotkeySection, vision-hotkeys-nav-item]
  affects: [63-05]
tech_stack:
  added: []
  patterns: [SettingsSectionProps-extension, apply-without-restart-hotkey, HotkeySection-following-PttSection-pattern]
key_files:
  created:
    - apps/desktop/src/renderer/src/settings/sections/HotkeySection.tsx
  modified:
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/renderer/src/settings/SettingsLayout.tsx
    - apps/desktop/src/main/ipc/settings.ts
key-decisions:
  - "screenshotHotkey included in SaveSettingsRequest (not apply-without-restart) because changing hotkey requires re-registering the global shortcut via changeScreenshotHotkey — same pattern as pttHotkey"
  - "HotkeySection follows PttSection pattern exactly: Pick<SettingsSectionProps> narrowing, HotkeyRecorder, Field.Helper for context"
requirements-completed: [VISION-03]
duration: ~10 min
completed: "2026-05-07"
---

# Phase 63 Plan 04: Screenshot Hotkey Settings UI Summary

**Screenshot hotkey settings panel wired end-to-end: Vision Hotkeys nav item with HotkeyRecorder, settings:get reads from store, settings:save persists and re-registers the global shortcut via changeScreenshotHotkey**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-07T23:52:00Z
- **Completed:** 2026-05-07T23:58:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Extended `SettingsData` and `SaveSettingsRequest` in ipc-types.ts with `screenshotHotkey` field
- Created `HotkeySection.tsx` following PttSection pattern (Pick narrowing, HotkeyRecorder, Field.Helper)
- Added `vision-hotkeys` nav entry (Camera icon) and rendering in `SettingsLayout.tsx`
- settings:get returns `getScreenshotHotkey()` from store; settings:save persists and calls `changeScreenshotHotkey()`

## Task Commits

1. **Task 1: Extend types + create HotkeySection + update SettingsLayout** - `8b6328d` (feat)
2. **Task 2: Extend settings IPC handler** - `e850454` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `apps/desktop/src/renderer/src/settings/sections/HotkeySection.tsx` - New settings section with screenshot hotkey HotkeyRecorder
- `apps/desktop/src/shared/ipc-types.ts` - Added screenshotHotkey to SettingsData and SaveSettingsRequest
- `apps/desktop/src/renderer/src/settings/SettingsLayout.tsx` - vision-hotkeys nav, screenshotHotkey state/handler/sectionProps
- `apps/desktop/src/main/ipc/settings.ts` - Import + read + write screenshotHotkey in settings:get/save handlers

## Decisions Made

- screenshotHotkey goes through `settings.save` (not an apply-without-restart IPC channel) because the global shortcut must be re-registered via `changeScreenshotHotkey(accelerator, mainWindow)` — same flow as pttHotkey
- No dirty-tracking for screenshotHotkey: the save fires immediately on `onRecorded` callback (mirrors how pttHotkey is expected to work based on handler pattern review)

## Deviations from Plan

None — plan executed exactly as written. The existing pattern (pttHotkey → changePttHotkey) mapped directly onto the screenshot hotkey flow.

## Known Stubs

None — all fields are wired to actual store accessors and re-registration logic.

## Self-Check: PASSED

- `apps/desktop/src/renderer/src/settings/sections/HotkeySection.tsx` — FOUND
- `8b6328d` — FOUND in git log
- `e850454` — FOUND in git log
- `grep screenshotHotkey ipc-types.ts` — 2 occurrences (SettingsData + SaveSettingsRequest) confirmed
- `grep vision-hotkeys SettingsLayout.tsx` — confirmed in SectionKey, NAV_ITEMS, renderSection
- `grep changeScreenshotHotkey settings.ts` — confirmed in import + save handler
