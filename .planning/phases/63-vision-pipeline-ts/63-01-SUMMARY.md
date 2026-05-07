---
phase: 63-vision-pipeline-ts
plan: "01"
subsystem: desktop-ipc
tags: [vision, ipc, electron, sharp, screenshot]
dependency_graph:
  requires: []
  provides: [CAPTURE_SCREEN-ipc-handler, vision-ipc-types, screenshotHotkey-store]
  affects: [63-02, 63-03, 63-04]
tech_stack:
  added: [sharp]
  patterns: [ipcMain.handle, desktopCapturer, electron-store-accessor]
key_files:
  created:
    - apps/desktop/src/main/ipc/capture.ts
  modified:
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/main/store.ts
    - apps/desktop/electron.vite.config.ts
    - apps/desktop/electron-builder.yml
decisions:
  - sharp 0.33+ uses @img/sharp-{platform}-{arch} packages for native binaries (not build/Release); extraResources must include @img/sharp-win32-x64, @img/colour, and the sharp main package
  - JarvisAPI.vision optional namespace declared in ipc-types.ts for renderer preload bridge
  - getScreenshotHotkey() returns 'CmdOrCtrl+Shift+S' as default (same HotkeyConfig shape as pttHotkey)
metrics:
  duration: "~10 min"
  completed: "2026-05-07"
  tasks_completed: 2
  files_changed: 5
---

# Phase 63 Plan 01: IPC Foundation + Capture Handler Summary

CAPTURE_SCREEN IPC handler with desktopCapturer + sharp resize (max 1920x1080, JPEG 80%), new vision IPC types (CaptureScreenResult, SendImageRequest, VisionScreenshotPayload), JarvisAPI.vision namespace, screenshotHotkey electron-store accessors, and sharp externalized in Vite build + packaged via electron-builder extraResources.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend IPC types with vision channels and payload types | fe3c924 | ipc-types.ts |
| 2 | Add screenshotHotkey to store + create CAPTURE_SCREEN IPC handler | 1f88bb1 | store.ts, capture.ts, electron.vite.config.ts, electron-builder.yml |

## What Was Built

### Task 1 — ipc-types.ts extensions
- Added `CAPTURE_SCREEN`, `CHAT_SEND_IMAGE`, `VISION_SCREENSHOT_CAPTURED` to `IPC_CHANNELS`
- Exported `CaptureScreenResult` (discriminated union), `SendImageRequest`, `VisionScreenshotPayload` types
- Added `JarvisAPI.vision?` optional namespace with `captureScreen`, `sendImage`, `onScreenshotCaptured`

### Task 2 — Infrastructure
- `apps/desktop/src/main/ipc/capture.ts` (NEW): `registerCaptureHandlers()` wires `CAPTURE_SCREEN` via `ipcMain.handle`. Uses `desktopCapturer.getSources({ types: ['screen'] })`, handles macOS permission denial (empty sources → `PERMISSION_DENIED`), pipes PNG through `sharp().resize(1920,1080,{fit:'inside'}).jpeg({quality:80})`
- `store.ts`: Added `screenshotHotkey?: HotkeyConfig` to `StoreSchema`, plus `getScreenshotHotkey()` (default `'CmdOrCtrl+Shift+S'`) and `setScreenshotHotkey()` accessors
- `electron.vite.config.ts`: Added `'sharp'` to `MAIN_EXTERNALS`
- `electron-builder.yml`: Added `@img/sharp-win32-x64`, `@img/colour`, and `sharp` to `extraResources`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Detail] sharp 0.33+ uses @img/* scoped packages, not build/Release/**
- **Found during:** Task 2 — inspecting the actual sharp install structure
- **Issue:** The plan referenced `node_modules/sharp/build/Release/` as the native binary location, but sharp 0.33+ moved native binaries to platform-specific `@img/sharp-{platform}-{arch}` packages. There is no `build/Release/` directory.
- **Fix:** Added `@img/sharp-win32-x64` and `@img/colour` as separate extraResources entries, plus the `sharp` main package. Used `../../node_modules/` prefix to match the existing onnxruntime-node pattern.
- **Files modified:** `apps/desktop/electron-builder.yml`
- **Commit:** 1f88bb1

## Known Stubs

None — this plan creates infrastructure (IPC handler, types, store accessors). No UI rendering paths or data stubs.

## Self-Check: PASSED

- `apps/desktop/src/main/ipc/capture.ts` — FOUND
- `fe3c924` — FOUND in git log
- `1f88bb1` — FOUND in git log
- `grep CAPTURE_SCREEN ipc-types.ts` — 3 occurrences confirmed
- `grep getScreenshotHotkey store.ts` — 2 occurrences confirmed
- `grep "'sharp'" electron.vite.config.ts` — confirmed
- `grep sharp electron-builder.yml` — confirmed
