---
phase: 10-frameless-widget-window
plan: 02
subsystem: desktop-ui
tags: [tray, electron, system-integration, ui]
dependency_graph:
  requires: [10-01]
  provides: [tray-icon, show-hide-controls, app-quit]
  affects: [main-process, window-lifecycle]
tech_stack:
  added: []
  patterns: [electron-tray-api, context-menu]
key_files:
  created:
    - apps/desktop/resources/tray/icon-16x16.png
    - apps/desktop/resources/tray/icon-32x32.png
    - apps/desktop/src/main/tray.ts
    - apps/desktop/src/main/__tests__/tray.test.ts
  modified:
    - apps/desktop/src/main/index.ts
decisions:
  - "Use 16x16 as primary icon path - Electron auto-scales to 32x32 for high-DPI displays"
  - "Simple cyan circle design matching orb-idle color for consistent branding"
  - "Tray lifecycle tied to app lifecycle - destroyTray() on before-quit event"
metrics:
  duration_minutes: 3
  tasks_completed: 2
  tests_added: 13
  files_created: 4
  files_modified: 1
  commits: 2
completed_date: "2026-04-06"
---

# Phase 10 Plan 02: System Tray Icon Summary

**One-liner:** System tray icon with Show/Hide/Quit menu using cyan circle design and Electron Tray API

## What Was Built

Created system tray integration for JARVIS desktop app with:

1. **Tray icon assets** - 16x16 and 32x32 PNG icons featuring cyan circle (#06B6D4) on transparent background matching the orb-idle color from UI-SPEC
2. **Tray module** - TypeScript module handling tray lifecycle with Show, Hide, Quit menu items
3. **Main process integration** - Tray initialized after window creation, cleanup on app quit
4. **Test coverage** - 13 tests verifying menu structure, tooltip, icon path, and integration points

## Requirement Fulfillment

✅ **DESK-04** - Tray icon with menu Show/Hide/Quit - COMPLETE
- All 3 menu items implemented and tested
- Show/Hide control window visibility via BrowserWindow API
- Quit exits application cleanly

✅ **D-05** - Icon 16x16 + 32x32 PNG cyan circle - COMPLETE
- 143-byte 16x16 PNG
- 205-byte 32x32 PNG
- Both with RGBA alpha channel for transparency

✅ **D-07** - Tooltip "JARVIS" - COMPLETE
- Tooltip set via `setToolTip('JARVIS')`

✅ **D-08** - Menu with exactly 3 items - COMPLETE
- Show, Hide, Quit menu items only
- No additional items or separators

## Implementation Details

### Tray Module (`apps/desktop/src/main/tray.ts`)

```typescript
export function createTray(mainWindow: BrowserWindow): void
export function destroyTray(): void
```

**Pattern:** Module-scoped `tray` variable ensures singleton pattern - only one tray instance exists per app lifecycle.

**Security:** T-10-04 mitigation applied - icon path constructed via `path.join(__dirname, relative)` with static filename, no user input accepted.

### Main Process Integration

**Lifecycle:**
1. `app.whenReady()` → `createWindow()` → `createTray(mainWindow!)`
2. User clicks tray menu → Show/Hide/Quit handlers execute
3. `app.on('before-quit')` → `destroyTray()` cleanup

**Why `mainWindow!` assertion:** Window is guaranteed to exist at this point in the whenReady callback - createWindow() executes synchronously before createTray().

### Icon Design

**Simple cyan circle** instead of gradient implementation for these reasons:
1. Minimal file size (143 bytes vs ~1KB for gradient)
2. Matches orb-idle color (#06B6D4) from UI-SPEC for brand consistency
3. Clear visibility at small tray icon size (16x16)
4. Works well across light/dark system themes

**High-DPI support:** Electron automatically selects icon-32x32.png on 200% DPI displays when given the 16x16 path - both assets required in resources directory.

## Tests Added

**13 tests passing:**

1. Menu structure tests (7):
   - Exactly 3 menu items
   - Show, Hide, Quit labels present
   - Correct handler calls (show(), hide(), quit())

2. Tooltip test (1):
   - Tooltip displays "JARVIS"

3. Icon path test (1):
   - Uses icon-16x16.png path

4. Export tests (2):
   - createTray exported
   - destroyTray exported

5. Integration tests (2):
   - Main imports createTray from tray module
   - Main calls createTray with mainWindow

## Deviations from Plan

None - plan executed exactly as written.

## Known Issues

None. All acceptance criteria met, all tests passing.

## Next Steps

**For Phase 10 Plan 03:**
- Verify tray icon visibility in Windows system tray (visual test)
- Test Show/Hide menu items toggle window correctly
- Test Quit menu item exits cleanly
- Confirm tooltip appears on hover

**Integration points ready:**
- Tray menu could be extended with additional items in future (e.g., Settings, About)
- Show/Hide handlers could be enhanced to include focus behavior
- Icon could be swapped dynamically to show app state (idle/listening/processing)

## Threat Flags

No new threat surface introduced beyond planned scope. All mitigations from threat model applied:

- T-10-04 (Icon path tampering) - MITIGATED via static path construction
- T-10-05 (Tray menu spoofing) - ACCEPTED (hardcoded menu, no dynamic generation)
- T-10-06 (Privilege escalation) - ACCEPTED (menu handlers call safe Electron APIs only)

## Files Changed

**Created:**
- `apps/desktop/resources/tray/icon-16x16.png` (143 bytes, PNG 16x16 RGBA)
- `apps/desktop/resources/tray/icon-32x32.png` (205 bytes, PNG 32x32 RGBA)
- `apps/desktop/src/main/tray.ts` (50 lines, tray module implementation)
- `apps/desktop/src/main/__tests__/tray.test.ts` (84 lines, 13 tests)

**Modified:**
- `apps/desktop/src/main/index.ts` (+3 imports, +1 call to createTray, +1 call to destroyTray)

## Commits

1. `4956343` - ✨ feat(10-02): create tray icons at 16x16 and 32x32 sizes
2. `853abe7` - ✨ feat(10-02): implement system tray with Show/Hide/Quit menu

---

## Self-Check: PASSED

**Files created:**
- ✓ apps/desktop/resources/tray/icon-16x16.png
- ✓ apps/desktop/resources/tray/icon-32x32.png
- ✓ apps/desktop/src/main/tray.ts
- ✓ apps/desktop/src/main/__tests__/tray.test.ts

**Commits exist:**
- ✓ 4956343 - Create tray icons
- ✓ 853abe7 - Implement system tray module

All claims verified.

---

**Status:** ✅ COMPLETE - All tasks executed, all tests passing, DESK-04 requirement fulfilled
