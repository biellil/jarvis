---
phase: 33-cross-platform-support
plan: 02
subsystem: desktop
tags: [electron, macos, linux, whisper, cross-platform, electron-builder]

requires:
  - phase: 33-01
    provides: TDD scaffold with RED tests for index.platform.test.ts

provides:
  - macOS Dock hiding (app.dock.hide() on darwin) — JARVIS lives in menu bar only
  - macOS and Linux whisper.node prebuilds bundled in electron-builder.yml
  - Linux X11 compositor requirement documented in README
  - All 5 index.platform.test.ts tests GREEN (was 2 RED)

affects:
  - electron-builder packaging on macOS (dmg target)
  - electron-builder packaging on Linux (AppImage target)
  - New developers setting up JARVIS on Linux (README guidance)

tech-stack:
  added:
    - "@fugood/node-whisper-darwin-arm64@1.0.18"
    - "@fugood/node-whisper-darwin-x64@1.0.18"
    - "@fugood/node-whisper-linux-x64@1.0.18"
    - "@fugood/node-whisper-linux-x64-cuda@1.0.18"
    - "@fugood/node-whisper-linux-x64-vulkan@1.0.18"
  patterns:
    - "Platform conditional with process.platform check before window creation"
    - "darwin/linux prebuilds in apps/desktop/node_modules, referenced via node_modules/ from electron-builder.yml"

key-files:
  modified:
    - apps/desktop/src/main/index.ts
    - apps/desktop/electron-builder.yml
    - apps/desktop/package.json
    - pnpm-lock.yaml
    - README.md

key-decisions:
  - "darwin/linux prebuild packages installed as desktop devDependencies end up in apps/desktop/node_modules/@fugood/ — extraResources path uses node_modules/ (relative to electron-builder.yml location) not ../../node_modules/"
  - "app.dock.hide() inserted after permission handlers, before loadBackendConfig — correct position for macOS-only behavior"
  - "All 5 linux variants (cpu, cuda, vulkan, darwin arm64, darwin x64) successfully published on npm and installed"

patterns-established:
  - "Pattern: Platform-conditional block for macOS at app.whenReady() top level — insert AFTER permission handlers, BEFORE config load"
  - "Pattern: pnpm workspace devDependencies scoped to apps/desktop go to apps/desktop/node_modules/, not root — electron-builder paths must be adjusted accordingly"

requirements-completed: [PLAT-01, PLAT-02, PLAT-03, PLAT-04, PLAT-05, PLAT-06]

duration: 4min
completed: 2026-04-16
---

# Phase 33 Plan 02: Cross-Platform Code Changes Summary

**macOS Dock hide + mac/linux whisper prebuilds bundled + Linux X11 compositor documented — JARVIS now has complete cross-platform packaging and startup behavior.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-16T11:27:52Z
- **Completed:** 2026-04-16T11:31:17Z
- **Tasks:** 3 completed
- **Files modified:** 5

## Accomplishments

- Added `app.dock.hide()` conditional on darwin in `app.whenReady()` — all 5 index.platform.test.ts tests now GREEN (was 2 RED from Wave 0 scaffold)
- Installed 5 new devDependencies for mac/linux whisper prebuilds and added 5 extraResources entries in electron-builder.yml covering darwin-arm64, darwin-x64, linux-x64, linux-x64-cuda, linux-x64-vulkan
- Added "Platform Support" section in README.md documenting Linux X11 compositor requirement with Picom setup instructions and Wayland deferral note (PLAT-08)

## Task Commits

1. **Task 1: Add app.dock.hide() to index.ts (TDD GREEN)** - `11e5cad` (feat)
2. **Task 2: Bundle mac/linux whisper prebuilds in electron-builder.yml** - `041ef01` (feat)
3. **Task 3: Document Linux X11 compositor requirement in README** - `5cbd487` (docs)

## Files Created/Modified

- `apps/desktop/src/main/index.ts` — Added darwin platform check + app.dock.hide() after permission handlers
- `apps/desktop/electron-builder.yml` — Added 5 new extraResources entries for mac and linux whisper prebuilds
- `apps/desktop/package.json` — Added 5 new devDependencies for mac/linux whisper prebuild packages
- `pnpm-lock.yaml` — Updated lockfile with new dependencies
- `README.md` — Added Platform Support section with Linux X11 compositor documentation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Path adjustment] darwin/linux packages land in apps/desktop/node_modules, not root**

- **Found during:** Task 2
- **Issue:** Plan instructed using `../../node_modules/@fugood/...` path (same as win32 packages in root node_modules). But darwin/linux packages installed as `@jarvis/desktop` devDependencies land in `apps/desktop/node_modules/@fugood/` not the root node_modules.
- **Fix:** Used `node_modules/@fugood/...` (relative to electron-builder.yml location = apps/desktop/) instead of `../../node_modules/@fugood/...` for the 5 new entries.
- **Files modified:** `apps/desktop/electron-builder.yml`
- **Commit:** 041ef01

## Known Stubs

None — all three changes are complete and functional.

## Self-Check: PASSED

- `apps/desktop/src/main/index.ts` — FOUND (contains `app.dock.hide()`)
- `apps/desktop/electron-builder.yml` — FOUND (contains `@fugood/node-whisper-darwin-arm64`)
- `README.md` — FOUND (contains `compositor`)
- Commit `11e5cad` — FOUND
- Commit `041ef01` — FOUND
- Commit `5cbd487` — FOUND
