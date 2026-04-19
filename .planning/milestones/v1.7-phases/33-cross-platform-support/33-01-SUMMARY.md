---
phase: 33-cross-platform-support
plan: "01"
subsystem: desktop/main
tags: [test, cross-platform, wave-0, tdd, source-level-assertions]
dependency_graph:
  requires: []
  provides:
    - apps/desktop/src/main/__tests__/index.platform.test.ts
    - apps/desktop/src/main/__tests__/tray.platform.test.ts
  affects:
    - apps/desktop/src/main/index.ts
    - apps/desktop/src/main/tray.ts
tech_stack:
  added: []
  patterns:
    - readFileSync source-level assertions (same pattern as tray.test.ts)
key_files:
  created:
    - apps/desktop/src/main/__tests__/index.platform.test.ts
    - apps/desktop/src/main/__tests__/tray.platform.test.ts
  modified: []
decisions:
  - Source-level assertions chosen over Electron mock tests — avoids module loading complexity for cross-platform branch verification
  - index.platform.test.ts dock.hide() tests intentionally RED — Wave 1 will add the darwin branch to index.ts
metrics:
  duration_seconds: 106
  completed_date: "2026-04-16"
  tasks_completed: 2
  files_created: 2
---

# Phase 33 Plan 01: Wave 0 Test Scaffolds Summary

Source-level test scaffold files for cross-platform Electron main process assertions, closing both Wave 0 gaps required by VALIDATION.md before Phase 33 code implementation can begin.

## What Was Built

Two test files using the `readFileSync` source-level assertion pattern (established in `tray.test.ts`) to verify cross-platform Electron behaviors:

**`index.platform.test.ts`** — Tests platform branch coverage in `index.ts`:
- macOS dock hiding (PLAT-01, D-01): `process.platform === 'darwin'` check + `app.dock.hide()` call — currently RED (Wave 1 will add them)
- Cross-platform window lifecycle (PLAT-01, PLAT-04): `window-all-closed` handler, non-darwin quit branch, `activate` handler — GREEN (already present)

**`tray.platform.test.ts`** — Tests tray cross-platform requirements (PLAT-03, PLAT-06):
- Icon path: `resources/tray` directory, `icon-\d+x\d+\.png` suffix, `new Tray(` construction
- Menu items: `label: 'Quit'`, `app.quit()` in quit handler
- Exports: `export function createTray(`, `export function destroyTray(`
- All 7 tests GREEN (tray.ts already has all required patterns)

## TDD State

| Test | File | Status | Reason |
|------|------|--------|--------|
| darwin platform check for dock.hide() | index.platform.test.ts | RED | Wave 1 adds `if (process.platform === 'darwin') { app.dock.hide() }` |
| calls app.dock.hide() on darwin | index.platform.test.ts | RED | Same — Wave 1 implementation target |
| contains window-all-closed handler | index.platform.test.ts | GREEN | Already in index.ts line 269 |
| quits on non-darwin platforms | index.platform.test.ts | GREEN | Already in index.ts lines 271-273 |
| contains activate handler | index.platform.test.ts | GREEN | Already in index.ts line 245 |
| uses PNG icon from resources/tray | tray.platform.test.ts | GREEN | tray.ts line 47 |
| icon filename ends in .png | tray.platform.test.ts | GREEN | `icon-16x16.png` matches regex |
| creates Tray with nativeImage or path | tray.platform.test.ts | GREEN | tray.ts line 48 |
| contains Quit menu item | tray.platform.test.ts | GREEN | tray.ts line 146 |
| Quit handler calls app.quit() | tray.platform.test.ts | GREEN | tray.ts lines 146-150 |
| exports createTray function | tray.platform.test.ts | GREEN | tray.ts line 45 |
| exports destroyTray function | tray.platform.test.ts | GREEN | tray.ts line 154 |

## Validation Status

- VALIDATION.md Wave 0 gaps closed: both files now exist
- `pnpm --filter @jarvis/desktop test src/main/__tests__/tray.platform.test.ts` exits 0 (7 GREEN)
- `pnpm --filter @jarvis/desktop test src/main/__tests__/index.platform.test.ts` compiles without TypeScript errors; 3 GREEN + 2 RED (expected)
- Pre-existing test failures (WakeWordEngine, integration-chat, Orb, modelLoader) are out of scope and unrelated to this plan

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — test files are complete assertions. The RED tests for `app.dock.hide()` are intentional scaffolds (not stubs), documented as the Wave 1 RED signal.

## Self-Check: PASSED

- `apps/desktop/src/main/__tests__/index.platform.test.ts` — FOUND
- `apps/desktop/src/main/__tests__/tray.platform.test.ts` — FOUND
- Commit b5dc640 — FOUND (index.platform.test.ts)
- Commit 21786aa — FOUND (tray.platform.test.ts)
