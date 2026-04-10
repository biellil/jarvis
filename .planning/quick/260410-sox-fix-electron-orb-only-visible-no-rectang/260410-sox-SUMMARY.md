---
quick_task: 260410-sox
phase: quick
plan: 260410-sox
subsystem: desktop
tags: [electron, transparency, click-through, orb, ipc, window]
dependency_graph:
  requires: []
  provides: [transparent-orb-window, click-through-ipc]
  affects: [apps/desktop]
tech_stack:
  added: []
  patterns: [setIgnoreMouseEvents-ipc-toggle, backgroundColor-hex-transparency]
key_files:
  created: []
  modified:
    - apps/desktop/src/main/index.ts
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/preload/index.ts
    - apps/desktop/src/renderer/src/styles/globals.css
    - apps/desktop/src/renderer/src/App.tsx
    - apps/desktop/src/renderer/src/App.css
    - apps/desktop/src/main/__tests__/window-config.test.ts
decisions:
  - "backgroundColor '#00000000' explicit hex required on Windows 11 (omitting defaults to white)"
  - "setIgnoreMouseEvents(true, forward:true) on ready-to-show for default click-through"
  - "IPC toggle via onMouseEnter/onMouseLeave on root div — orb area captures drag, transparent area passes through"
  - "WebkitAppRegion drag moved from root div to orb wrapper div only"
  - "Pre-existing Orb/integration-chat/tray test failures are out of scope (not caused by this task)"
metrics:
  duration: ~15 minutes
  completed: 2026-04-10
  tasks_completed: 3
  files_modified: 7
---

# Quick Task 260410-sox: Fix Electron Orb — Transparent Window, 160x160, Click-Through

**One-liner:** 160x160 transparent BrowserWindow with explicit `backgroundColor:'#00000000'`, `hasShadow:false`, and IPC-toggled `setIgnoreMouseEvents` so only the glass orb floats on the desktop.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | BrowserWindow transparency + IPC click-through | a14c8db | index.ts, ipc-types.ts, preload/index.ts |
| 2 | Renderer transparency + orb layout + mouse handlers | eea9b4c | globals.css, App.tsx, App.css |
| 3 | Update window-config tests for new dimensions | 671e65c | window-config.test.ts |

## What Was Done

### Task 1 — Main Process Changes

- Added `ipcMain` to the Electron import in `apps/desktop/src/main/index.ts`
- Changed `width: 128, height: 300` to `width: 160, height: 160`
- Added `backgroundColor: '#00000000'` — explicit transparent hex required on Windows 11 (omitting backgroundColor defaults to white/opaque)
- Added `hasShadow: false` — OS-level shadow was painting a visible rectangle behind the frameless window
- Called `mainWindow.setIgnoreMouseEvents(true, { forward: true })` after `ready-to-show` — transparent areas default to click-through; `forward: true` keeps mousemove events flowing to renderer for hover detection
- Added `ipcMain.on('window:set-ignore-mouse', ...)` handler after `createWindow()` to toggle click-through from renderer
- Added `IPC_CHANNELS.SET_IGNORE_MOUSE = 'window:set-ignore-mouse'` to `ipc-types.ts`
- Added `setIgnoreMouseEvents: (ignore: boolean) => void` to `JarvisAPI` interface
- Exposed `setIgnoreMouseEvents` via `contextBridge` in `preload/index.ts`

### Task 2 — Renderer Changes

- Added `html { background: transparent; overflow: hidden; }` to `globals.css` — the `html` element was missing transparency (only `body` had it), causing browser to paint a colored root element
- Updated `.app-container` in `App.css`: `min-height: 300px → 160px`, `justify-content: flex-end → center`
- Refactored `App.tsx`:
  - Removed `WebkitAppRegion: 'drag'` and cursor styles from root div
  - Added `onMouseEnter={() => window.jarvis.setIgnoreMouseEvents?.(false)}` and `onMouseLeave={() => window.jarvis.setIgnoreMouseEvents?.(true)}` on root div
  - Wrapped `<Orb />` in a new div with `WebkitAppRegion: 'drag'` and cursor grab styles (drag region scoped to orb only)

### Task 3 — Tests

- Updated `window-config.test.ts` describe block from "D-03: Window size 128x300" to "D-03: Window size 160x160"
- Updated width/height assertions to 160
- Added assertions for `backgroundColor: '#00000000'` and `hasShadow: false`
- All 20 window-config tests pass

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all IPC wiring is fully connected end-to-end.

## Pre-existing Test Failures (Out of Scope)

These failures existed before this task and were not caused by any change here:

- `Orb.test.tsx` — color assertion expects `#06B6D4` (cyan), but orb uses a radial-gradient; and transition test queries `width: 96px` which no longer exists in the component
- `integration-chat.test.ts` — integration chain tests (pre-existing mock server issues)
- `tray.test.ts` — menu item count assertion (pre-existing)

These are logged for future investigation but are out of scope per deviation rules.

## Self-Check: PASSED

- [x] `a14c8db` exists: `git log --oneline | grep a14c8db` — confirmed
- [x] `eea9b4c` exists — confirmed
- [x] `671e65c` exists — confirmed
- [x] All 20 window-config tests pass (verified via direct vitest run)
- [x] Build succeeds: `electron-vite build` — zero errors
