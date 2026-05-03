---
phase: 50-whisper-pre-download-ux
plan: "01"
subsystem: desktop-main/voiceInput
tags: [whisper, backend, download, progress, tdd]
dependency_graph:
  requires: []
  provides:
    - resolveWhisperModel (WhisperModelOption → WhisperModel pure function)
    - isWhisperModelCached (boolean cache check)
    - ensureWhisperModel with onProgress + AbortSignal
    - MODEL_SIZES_MB export
  affects:
    - apps/desktop/src/main/voiceInput/whisperResources.ts
    - apps/desktop/src/main/voiceInput/whisperModelResolver.ts
tech_stack:
  added: []
  patterns:
    - TDD (RED → GREEN) for both tasks
    - Pure function isolation (no Electron deps in whisperModelResolver.ts)
    - AbortController pattern for cancellable downloads
    - Throttled progress emission (1%/250ms)
key_files:
  created:
    - apps/desktop/src/main/voiceInput/whisperModelResolver.ts
    - apps/desktop/src/main/__tests__/whisper-model-resolver.test.ts
    - apps/desktop/src/main/__tests__/whisper-resources.test.ts
  modified:
    - apps/desktop/src/main/voiceInput/whisperResources.ts
decisions:
  - resolveWhisperModel implements inline VRAM thresholds instead of calling non-existent selectModelByVram; mirrors vramDetection.ts thresholds exactly
  - downloadFile uses single wrappedRequest function (removed redundant inner request function in first draft)
  - Tests use top-level vi.mock with module-level imports (not vi.resetModules) to avoid mock instance isolation issues with vi.mocked()
metrics:
  duration: "17 minutes"
  completed: "2026-05-03T18:42:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 1
---

# Phase 50 Plan 01: Whisper Backend Primitives Summary

Extended the Whisper backend with pure `resolveWhisperModel` function and progress/abort primitives for `ensureWhisperModel`. These are the contracts that Plans 50-02 (IPC handler) and 50-03 (hot-swap) implement against.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add resolveWhisperModel pure function | `2d3fe1e` | whisperModelResolver.ts, whisper-model-resolver.test.ts |
| 2 | Extend ensureWhisperModel with onProgress, isWhisperModelCached, AbortController | `06a00e7` | whisperResources.ts, whisper-resources.test.ts |

## What Was Built

**Task 1 — `whisperModelResolver.ts`:**
- Pure function `resolveWhisperModel(option: WhisperModelOption, vramMb: number): WhisperModel`
- Maps all 6 `WhisperModelOption` values: `auto`, `tiny`, `base`, `small`, `medium`, `large-v3-turbo`
- `small → base` (no model file; D-12 documented fallback)
- `large-v3-turbo → large` (same ggml-large-v3.bin per D-12)
- `auto → VRAM-based selection` (inline thresholds mirroring vramDetection.ts: >8192 MB → large, >0 → medium, 0 → tiny)
- Zero Electron dependencies — fully testable in isolation
- 8 unit tests, all passing

**Task 2 — `whisperResources.ts` extensions:**
- `WhisperDownloadProgress` and `EnsureWhisperModelOptions` types exported
- `isWhisperModelCached(model)`: `fs.existsSync` check; always `true` when `app.isPackaged`
- `MODEL_SIZES_MB` export: `{ tiny: 75, base: 142, medium: 1500, large: 476 }` for UI fallback display
- `ensureWhisperModel(model, options?)`: extended with optional `onProgress` + `signal`
  - `onProgress` throttled at 1%/250ms; emits `percent: 100` unconditionally at finish
  - `signal.aborted` check: immediate rejection with `DOMException('AbortError')` + tmp file cleanup
  - `_downloadControllers` Map added for Plan 50-02 IPC cancellation
  - Existing callers (no options) compile without changes — backward compatible
- 8 unit tests, all passing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Adaptation] `selectModelByVram` not exported from `vramDetection.ts`**
- **Found during:** Task 1 (read_first phase)
- **Issue:** Plan referenced `selectModelByVram` from `vramDetection.ts` but only `detectVramAndSelectModel` (async, Electron deps) and `getSelectedModel` (returns cached) are exported
- **Fix:** Implemented inline VRAM thresholds in `whisperModelResolver.ts` — mirrors exact thresholds documented in `vramDetection.ts` (>8192 → large, >0 → medium, 0 → tiny). Pure function, testable.
- **Files modified:** `whisperModelResolver.ts`
- **Commit:** `2d3fe1e`

**2. [Rule 1 - Test Pattern] `vi.resetModules()` caused mock isolation issue**
- **Found during:** Task 2 test development (onProgress test)
- **Issue:** `vi.resetModules()` + `vi.restoreAllMocks()` in `beforeEach` caused `node:https` mock instance to be different between the test setup code and the `whisperResources.ts` module being tested. `progressCalls` was always empty.
- **Fix:** Changed test from dynamic imports with `vi.resetModules()` to top-level static imports with `vi.clearAllMocks()`. All 8 tests now pass correctly.
- **Files modified:** `whisper-resources.test.ts`
- **Commit:** `06a00e7`

## Known Stubs

None. All exported functions are fully implemented.

## Pre-existing Test Failures (not caused by this plan)

The following test failures existed before this plan and are unrelated to changes here:
- `whisper-gpu-detection.test.ts` (5 failures): calls `ensureWhisperModel` with real fs; presigned URLs expired — HTTP 403
- `vramDetection.test.ts` (3 failures): expects `tiny` for CPU fallback but code returns `base`
- `ipc-chat.test.ts`, `integration-chat.test.ts`, `security.test.ts`, `tray.platform.test.ts`, `voiceHandler.test.ts` (13 failures): pre-existing unrelated issues

Total pre-existing failures: 21 (unchanged by this plan).

## Self-Check: PASSED
