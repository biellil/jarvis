---
phase: 50-whisper-pre-download-ux
plan: "02"
subsystem: ipc
tags: [whisper, ipc, preload, electron, download]
dependency_graph:
  requires: []
  provides:
    - WhisperDownloadProgress type in shared/ipc-types.ts
    - WhisperApi type in shared/ipc-types.ts
    - IPC_CHANNELS.WHISPER_DOWNLOAD_MODEL channel
    - IPC_CHANNELS.WHISPER_DOWNLOAD_PROGRESS channel
    - setupWhisperHandlers in main/ipc/whisper.ts
    - window.whisper.downloadModel + window.whisper.onDownloadProgress via preload
  affects:
    - apps/desktop/src/shared/ipc-types.ts (extended)
    - apps/desktop/src/preload/settings.ts (extended)
tech_stack:
  added: []
  patterns:
    - ipcMain.handle for renderer→main invoke
    - webContents.send for main→renderer broadcast
    - contextBridge.exposeInMainWorld for preload bridge
    - AbortController for in-flight download cancellation
key_files:
  created:
    - apps/desktop/src/main/ipc/whisper.ts
  modified:
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/preload/settings.ts
decisions:
  - "Used getSelectedModel() directly for 'auto' option instead of passing vramMb=0 to resolveWhisperModel — avoids incorrect fallback since VRAM detection already ran at startup"
  - "Inlined channel string constants in preload (same pattern as VAD_THRESHOLD_CHANNEL) to avoid shared chunk extraction in preload bundle"
  - "Skipped top-level await for vramDetection import — imported synchronously as getSelectedModel() is already cached at module load"
metrics:
  duration: ~20min
  completed_date: "2026-05-03"
  tasks_completed: 2
  files_changed: 3
---

# Phase 50 Plan 02: Whisper IPC Bridge Summary

IPC contract for Whisper pre-download UX: typed channels, main handler with cancellation, and preload bridge exposing window.whisper.

## What Was Built

### Task 1: Whisper IPC types and channels in shared/ipc-types.ts

Added to `shared/ipc-types.ts`:

- `WhisperDownloadProgress` interface — payload for `whisper:download-progress` broadcasts with `{ model, status, percent, downloadedBytes, totalBytes, errorMessage? }`
- `WhisperApi` interface — `{ downloadModel(option): Promise<void>; onDownloadProgress(cb): () => void }`
- `IPC_CHANNELS.WHISPER_DOWNLOAD_MODEL = 'whisper:download-model'` — renderer → main invoke
- `IPC_CHANNELS.WHISPER_DOWNLOAD_PROGRESS = 'whisper:download-progress'` — main → renderer broadcast
- Window augmentation extended with `whisper: WhisperApi`

### Task 2: main/ipc/whisper.ts + preload/settings.ts extension

Created `apps/desktop/src/main/ipc/whisper.ts` with `setupWhisperHandlers(settingsWindow)`:

- Cache-hit path (D-02): `isWhisperModelCached` check → instant success broadcast
- Download path: `ensureWhisperModel` with `onProgress` callback → broadcasts `whisper:download-progress` events
- Cancellation (D-04): `_activeController` AbortController stored per-call; new `downloadModel` invocation aborts in-flight download before starting new one
- Error handling: AbortError silenced (user switched model); other errors broadcast as `status='error'`
- 'auto' resolution: uses `getSelectedModel()` from `vramDetection.ts` (already VRAM-resolved at startup)

Extended `apps/desktop/src/preload/settings.ts`:
- Added `window.whisper.downloadModel` — invokes `whisper:download-model` via ipcRenderer.invoke
- Added `window.whisper.onDownloadProgress` — subscribes to `whisper:download-progress` broadcasts, returns unsubscribe function

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Adaptation] 'auto' model resolution uses getSelectedModel() instead of resolveWhisperModel**

- **Found during:** Task 2
- **Issue:** The plan's whisper.ts template used a top-level `await import('../voiceInput/vramDetection.js')` to get `getDetectedVramMb()`, but `vramDetection.ts` does not export that function — it exports `getSelectedModel()` (sync, cached) and `detectVramAndSelectModel()` (async, one-time).
- **Fix:** For `option === 'auto'`, call `getSelectedModel()` directly (returns the VRAM-detected model already resolved at startup). For all other options, call `resolveWhisperModel(option, 0)` — the vramMb arg is unused for non-'auto' options per whisperModelResolver logic.
- **Files modified:** apps/desktop/src/main/ipc/whisper.ts
- **Rationale:** This is strictly better — `getSelectedModel()` uses the actual runtime VRAM result rather than passing `0` and getting CPU-fallback for 'auto'.

**2. [Rule 2 - Safety] Removed top-level await in whisper.ts**

- **Found during:** Task 2
- **Issue:** The plan template used top-level `await import(...)` with a `.catch()` fallback for VRAM detection. Top-level await in CommonJS/non-ESM Electron main modules can cause load-time errors.
- **Fix:** Used synchronous `getSelectedModel()` import instead — no async module-level initialization needed.
- **Files modified:** apps/desktop/src/main/ipc/whisper.ts

## Known Stubs

None — all code paths are functional. The imports of `ensureWhisperModel`, `isWhisperModelCached`, `MODEL_SIZES_MB` from `whisperResources.ts` and `resolveWhisperModel` from `whisperModelResolver.ts` will TypeScript-error until Plan 50-01 lands (Wave 1 — parallel execution). This is expected per the parallel wave design.

## Self-Check

Files created/modified:
- `apps/desktop/src/main/ipc/whisper.ts` — EXISTS (created)
- `apps/desktop/src/shared/ipc-types.ts` — EXISTS (modified)
- `apps/desktop/src/preload/settings.ts` — EXISTS (modified)

Key exports verified via Grep:
- `export function setupWhisperHandlers` — FOUND in whisper.ts:51
- `WHISPER_DOWNLOAD_MODEL` / `WHISPER_DOWNLOAD_PROGRESS` — FOUND in ipc-types.ts lines 259, 261
- `export interface WhisperDownloadProgress` — FOUND in ipc-types.ts line 290
- `export interface WhisperApi` — FOUND in ipc-types.ts line 304
- `whisper: WhisperApi` in Window augmentation — FOUND in ipc-types.ts line 387
- `contextBridge.exposeInMainWorld('whisper', whisper)` — FOUND in settings.ts line 37
- `onDownloadProgress` — FOUND in settings.ts line 28

Note: TypeScript compile check skipped — Bash tool unavailable in this session. TS errors for `whisperResources.ts` imports (`isWhisperModelCached`, `MODEL_SIZES_MB`, `EnsureWhisperModelOptions`) and `whisperModelResolver.ts` import are expected until Plan 50-01 commits (Wave 1 parallel). Verify with `cd apps/desktop && npx tsc --noEmit` after both plans land.

## Self-Check: PASSED (structural)

All files exist and key exports are present. Parallel-wave TS errors are intentional and expected.
