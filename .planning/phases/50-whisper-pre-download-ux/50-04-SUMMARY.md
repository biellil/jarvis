---
phase: 50-whisper-pre-download-ux
plan: "04"
subsystem: desktop-renderer/settings
tags: [whisper, download-ux, progress-bar, ipc, react, settings]
dependency_graph:
  requires:
    - 50-01 (resolveWhisperModel + whisperResources primitives)
    - 50-02 (setupWhisperHandlers IPC + window.whisper preload bridge)
    - 50-03 (setActiveWhisperModel hot-swap in voiceHandler)
  provides:
    - WhisperSection with downloadState prop + Progress UI + error row + Try again
    - SettingsLayout owning whisperDownloadState + IPC listener + onTryAgain handler
    - Immediate window.whisper.downloadModel IPC call on model change (D-01)
    - Cache-hit Toast 'Model already cached' (D-02)
    - Error Toast with detailed errorMessage (D-13)
    - 1.5s success indicator then state cleared (D-07)
  affects:
    - apps/desktop/src/renderer/src/settings/sections/WhisperSection.tsx
    - apps/desktop/src/renderer/src/settings/SettingsLayout.tsx
tech_stack:
  added: []
  patterns:
    - useRef flag pattern (_sawDownloadingRef) for cache-hit detection without extra state
    - Fire-and-forget IPC with .catch error logging (window.whisper.downloadModel)
    - setTimeout 1500ms to clear success download state after green indicator
    - onDownloadProgress listener returns unsubscribe fn used as useEffect cleanup
key_files:
  created: []
  modified:
    - apps/desktop/src/renderer/src/settings/sections/WhisperSection.tsx
    - apps/desktop/src/renderer/src/settings/SettingsLayout.tsx
decisions:
  - "WhisperSection error row uses flex span + Button (not Field.Error) — button must be in same row per UI-SPEC layout"
  - "Cache-hit detection via _sawDownloadingRef: set true on first 'downloading' event; if success arrives without prior downloading events, it was a cache hit"
  - "showToast for 'info' type uses existing auto-clear (2000ms) in SettingsLayout — matches UI-SPEC D-02 cache-hit Toast 2000ms"
  - "progressText only rendered during 'downloading' status (null during success so progress bar text is hidden once green indicator shows)"
metrics:
  duration: ~20 minutes
  completed_date: "2026-05-03"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 2
---

# Phase 50 Plan 04: Whisper Download Progress UI Summary

Extended WhisperSection with determinate Progress bar, error row with Try again ghost button, and success helper text; wired SettingsLayout to own whisperDownloadState, subscribe to `window.whisper.onDownloadProgress` IPC, trigger `downloadModel` immediately on model change, and show cache-hit Toast + error Toast.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend WhisperSection with download progress UI | `6a82152` | WhisperSection.tsx |
| 2 | Wire SettingsLayout with download state, IPC listener, and model-change handler | `a75b6be` | SettingsLayout.tsx |

## What Was Built

**Task 1 — `WhisperSection.tsx` extensions:**
- Added `WhisperDownloadState` interface (status/percent/downloadedBytes/totalBytes/errorMessage)
- Extended `Props` with `downloadState?: WhisperDownloadState | null` and `onTryAgain?: () => void`
- `MODEL_PROGRESS_LABELS` map for short label names in progress text
- `toMb(bytes)` helper — `(bytes / 1024 / 1024).toFixed(0)`
- Progress text format: `Downloading {label}… {N}% ({dl} / {total} MB)` (only during `downloading`)
- `<Progress variant="linear" size="sm">` shown during/after download; hidden on error and idle
- Select gets `disabled={downloadState?.status === 'downloading'}` — prevents mid-download change
- Error row: `<span className="text-xs text-destructive">` + `<Button variant="ghost" size="sm" onClick={onTryAgain}>Try again</Button>` in flex row
- Helper text updates to `Model: {label} (ready)` on success state; hides on error

**Task 2 — `SettingsLayout.tsx` extensions:**
- Import `useRef` from React; import `WhisperDownloadProgress` from ipc-types
- `whisperDownloadState` state (null = idle, object = active download)
- `_sawDownloadingRef` useRef flag for cache-hit detection
- `useEffect(() => window.whisper.onDownloadProgress(...), [])` — subscribes at mount, returns unsubscribe as cleanup
- Listener updates `whisperDownloadState` on every broadcast; on `success` shows cache-hit Toast if no prior `downloading` events; on `error` shows detailed error Toast
- `setTimeout(() => setWhisperDownloadState(null), 1500)` on `success` — 1.5s green indicator then clear
- `handleWhisperModelChange(v)` — sets model, resets `_sawDownloadingRef`, clears download state, calls `window.whisper.downloadModel(v)` fire-and-forget
- `sectionProps.onWhisperModelChange` updated to `handleWhisperModelChange`
- Whisper case in `renderSection()` now passes `downloadState={whisperDownloadState}` and `onTryAgain` handler

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All code paths are fully wired to real IPC and state.

## Pre-existing TS Errors (not caused by this plan)

The following TS errors existed before this plan (confirmed in 50-03-SUMMARY and present in compile output):
- `index.ts:128,141` — `audioCapture` permission comparison (Electron type mismatch)
- `index.ts:153` — `app.dock` possibly undefined (macOS conditional)
- `src/main/ipc/__tests__/settings.test.ts` — multiple pre-existing mock type errors
- `src/main/__tests__/integration-chat.test.ts:76` — argument count mismatch (pre-existing)

Zero new TS errors introduced by this plan.

## Self-Check: PASSED
