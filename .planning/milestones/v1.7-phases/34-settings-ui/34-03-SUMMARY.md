---
phase: 34-settings-ui
plan: "03"
subsystem: desktop-ipc
tags: [ipc, settings, electron, vite, tdd]
dependency_graph:
  requires: [34-01, 34-02]
  provides: [settings-ipc-handlers, vite-multipage-config]
  affects: [apps/desktop/src/main/ipc/settings.ts, apps/desktop/src/main/ipc/index.ts, apps/desktop/src/main/index.ts, apps/desktop/electron.vite.config.ts]
tech_stack:
  added: []
  patterns: [IPC handler with mainWindow injection, TDD RED-GREEN, multi-page Vite renderer]
key_files:
  created: []
  modified:
    - apps/desktop/src/main/ipc/settings.ts
    - apps/desktop/src/main/ipc/index.ts
    - apps/desktop/src/main/index.ts
    - apps/desktop/electron.vite.config.ts
    - apps/desktop/src/main/ipc/__tests__/settings.test.ts
decisions:
  - "setupSettingsHandlers requires mainWindow param — needed for changePttHotkey which registers globalShortcut targeting that window"
  - "SETTINGS_SAVE TTS reinit failure is non-fatal — catches and warns, still returns success: true to not block settings save"
  - "createWindow() called before setupIpcHandlers in main/index.ts — ensures mainWindow is non-null when passed"
  - "electron.vite.config.ts settings.html entry added; build will fail until Plan 04 creates the file (expected)"
metrics:
  duration_seconds: 755
  completed_date: "2026-04-18"
  tasks_completed: 2
  files_changed: 5
---

# Phase 34 Plan 03: Settings IPC Handlers + Vite Multi-Page Config Summary

Settings IPC handlers (SETTINGS_GET/SETTINGS_SAVE) wired to electron-store with live TTS reinit and PTT hotkey registration; Vite renderer upgraded to multi-page build for settings.html.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 (RED) | Add failing Phase 34 settings tests | 798230a | settings.test.ts |
| 1 (GREEN) | Implement SETTINGS_GET and SETTINGS_SAVE handlers | 54da956 | settings.ts, ipc/index.ts, main/index.ts |
| 2 | Vite multi-page config for settings.html entry | 4a13f65 | electron.vite.config.ts |

## What Was Built

**Task 1: settings.ts extended with SETTINGS_GET and SETTINGS_SAVE**

`setupSettingsHandlers(mainWindow: BrowserWindow)` now registers three handlers:

1. `WAKE_WORD_GET_PAUSED` — preserved from Phase 23
2. `SETTINGS_GET` — returns `{ pttHotkey, ttsProvider, ttsApiKey, whisperModelOverride }` from store
3. `SETTINGS_SAVE` — applies each provided field, calls `changePttHotkey` for hotkey changes, calls `reinitializeTTS` when ttsProvider or ttsApiKey provided (failure is non-fatal)

The SETTINGS_SAVE handler returns `{ success: false, error: 'PTT hotkey already in use' }` when `changePttHotkey` returns false (conflicting hotkey), and `{ success: false, error: message }` on unexpected throws.

`ipc/index.ts` updated: `setupIpcHandlers(chatDeps, mainWindow)` now takes a second required `BrowserWindow` parameter and passes it to `setupSettingsHandlers`.

`main/index.ts` updated: `createWindow()` called before `setupIpcHandlers` so `mainWindow!` is available.

**Task 2: Vite multi-page renderer config**

`electron.vite.config.ts` renderer `rollupOptions.input` changed from a string to an object with both `index` and `settings` keys. `settings.html` does not exist yet (Plan 04 creates it); build will report a missing file error until then. Dev server (`pnpm dev`) is unaffected.

## Test Results

22 tests passing (6 Phase 23 preserved + 16 new Phase 34):

- SETTINGS_GET: registers handler, returns all 4 fields, returns defaults
- SETTINGS_SAVE: registers handler, success path, changePttHotkey called/not-called, hotkey conflict error, setTtsProvider/setTtsApiKey/setWhisperModelOverride calls, reinitializeTTS called for TTS changes/not called for non-TTS, TTS reinit failure non-fatal, unexpected throw returns error

## Deviations from Plan

**1. [Rule 1 - Bug] Phase 23 tests updated to pass mainWindow**

The plan specified `setupSettingsHandlers(mainWindow)` as required param, but the existing Phase 23 tests called `setupSettingsHandlers()` with no args. The tests were updated to pass `fakeMainWindow = {} as Electron.BrowserWindow` — preserving all Phase 23 test intent while satisfying the new signature. The test lookup logic for WAKE_WORD_GET_PAUSED was also updated to use `find()` instead of `mock.calls[0]` since now 3 handlers are registered (not just 1).

**2. [Rule 3 - Blocking] createWindow() moved before setupIpcHandlers in main/index.ts**

The plan's action said to pass `mainWindow!` to setupIpcHandlers, but `setupIpcHandlers` was called before `createWindow()`, making `mainWindow` still `null`. Moved `createWindow()` call to precede `setupIpcHandlers` call. This is a correct execution order: window is created first, then IPC handlers that reference it are registered.

## Known Stubs

None — all implemented fields are wired to real store accessors and real functions.

## Self-Check: PASSED

All key files exist. All 3 task commits verified (798230a, 54da956, 4a13f65). 22 tests passing.
