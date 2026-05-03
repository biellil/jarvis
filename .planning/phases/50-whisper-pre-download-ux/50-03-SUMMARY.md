---
phase: 50-whisper-pre-download-ux
plan: "03"
subsystem: desktop-main/voiceInput+ipc
tags: [whisper, hot-swap, ipc, voiceHandler, electron]
dependency_graph:
  requires:
    - 50-01 (whisperResources primitives + resolveWhisperModel)
    - 50-02 (setupWhisperHandlers IPC + preload bridge)
  provides:
    - setActiveWhisperModel exported from voiceHandler.ts
    - getActiveWhisperModel exported from voiceHandler.ts
    - handleAudio reads effectiveModel = _activeWhisperModel ?? deps.selectedModel
    - setupWhisperHandlers registered in main/index.ts at startup
    - getSettingsWindow exported from settingsWindow.ts
  affects:
    - apps/desktop/src/main/voiceInput/voiceHandler.ts
    - apps/desktop/src/main/ipc/whisper.ts
    - apps/desktop/src/main/index.ts
    - apps/desktop/src/main/settingsWindow.ts
tech_stack:
  added: []
  patterns:
    - Lazy getter pattern for BrowserWindow reference (avoids startup null crash)
    - Module-scope state with exported setter/getter (mirrors _currentTtsProvider pattern)
    - Nullish coalescing for model fallback (_activeWhisperModel ?? deps.selectedModel)
key_files:
  created: []
  modified:
    - apps/desktop/src/main/voiceInput/voiceHandler.ts
    - apps/desktop/src/main/ipc/whisper.ts
    - apps/desktop/src/main/index.ts
    - apps/desktop/src/main/settingsWindow.ts
decisions:
  - "setupWhisperHandlers refactored to accept () => BrowserWindow | null getter — settings window is lazy (created on first open), not available at startup"
  - "getSettingsWindow exported from settingsWindow.ts as null-safe getter (returns null if destroyed or not yet created)"
  - "whisper.ts broadcastProgress updated from direct BrowserWindow ref to getter — consistent with lazy window lifecycle"
metrics:
  duration: ~15 minutes
  completed_date: "2026-05-03"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 4
---

# Phase 50 Plan 03: Whisper Hot-Swap Wiring Summary

Connected the download success path to the active model used by transcriptions: `setActiveWhisperModel` in `voiceHandler.ts` is called by the IPC handler on both cache-hit and download-success, and `setupWhisperHandlers` is registered in `main/index.ts` at startup. Completes the WHISPER-01 hot-swap requirement (D-16).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add setActiveWhisperModel to voiceHandler + whisper.ts success path | `8d7cd78` | voiceHandler.ts, ipc/whisper.ts |
| 2 | Wire setupWhisperHandlers into main/index.ts | `4242b4a` | index.ts, settingsWindow.ts, ipc/whisper.ts |

## What Was Built

**Task 1 — `voiceHandler.ts` extensions:**
- `_activeWhisperModel: WhisperModel | null` module-level state (mirrors `_currentTtsProvider` pattern)
- `setActiveWhisperModel(model)` — updates `_activeWhisperModel`, logs change
- `getActiveWhisperModel()` — returns override or null if startup default still in use
- `handleAudio` Step 2 updated: `effectiveModel = _activeWhisperModel ?? deps.selectedModel` — next call after download uses new model; existing callers unaffected (deps.selectedModel is still the fallback)

**Task 1 — `ipc/whisper.ts` call sites:**
- Import `setActiveWhisperModel` from `voiceHandler.js`
- Cache-hit path: `setActiveWhisperModel(resolvedModel)` before success broadcast
- Download-success path: `setActiveWhisperModel(resolvedModel)` before success broadcast

**Task 2 — `settingsWindow.ts`:**
- Added `getSettingsWindow(): BrowserWindow | null` export — null-safe (returns null if not yet created or destroyed)

**Task 2 — `ipc/whisper.ts` signature refactor:**
- `setupWhisperHandlers(settingsWindow: BrowserWindow)` → `setupWhisperHandlers(getSettingsWindow: () => BrowserWindow | null)`
- `broadcastProgress` updated to accept and call the getter at broadcast time
- Enables startup registration before the lazy settings window is instantiated

**Task 2 — `main/index.ts`:**
- Import `getSettingsWindow` from `./settingsWindow`
- Import `setupWhisperHandlers` from `./ipc/whisper.js`
- Call `setupWhisperHandlers(getSettingsWindow)` immediately after `initSettingsWindowIpc()`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Architecture] setupWhisperHandlers refactored to accept lazy getter**

- **Found during:** Task 2 (read_first of main/index.ts + settingsWindow.ts)
- **Issue:** The plan specified `setupWhisperHandlers(settingsWindow)` with a direct `BrowserWindow` reference, but `settingsWindow.ts` creates the window lazily (only when `openSettingsWindow()` is called). At the time `setupWhisperHandlers` would be called in `main/index.ts`, no settings window exists yet — passing `null` or a non-existent reference would cause crashes when `broadcastProgress` checks `settingsWindow.isDestroyed()`.
- **Fix:** Changed `setupWhisperHandlers` signature to accept `() => BrowserWindow | null` getter. Exported `getSettingsWindow` from `settingsWindow.ts`. `broadcastProgress` now calls the getter at emit time, getting the live window (or null if not open yet, in which case the broadcast is silently skipped).
- **Files modified:** `ipc/whisper.ts`, `settingsWindow.ts`
- **Commits:** `8d7cd78`, `4242b4a`
- **Why correct:** The getter pattern is safer and more idiomatic for Electron lazy windows. The window only needs to exist when a download is in progress (user must have Settings open to trigger download), so the null-skip is acceptable.

## Known Stubs

None. All code paths are fully functional.

## Pre-existing TS Errors (not caused by this plan)

The following TS errors existed before this plan (confirmed by comparing pre/post error lists):
- `index.ts:127,141` — `audioCapture` permission comparison (Electron type mismatch)
- `index.ts:153` — `app.dock` possibly undefined (macOS conditional)
- `voiceHandler.ts:101` — `ArrayBuffer | SharedArrayBuffer` vs `ArrayBuffer` in `transcribeData` call
- `pttOnly.ts:31`, renderer hooks, ChatInput.tsx — various pre-existing issues

Zero new TS errors introduced by this plan.

## Self-Check: PASSED
