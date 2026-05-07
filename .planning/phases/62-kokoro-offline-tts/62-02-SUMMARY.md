---
phase: 62-kokoro-offline-tts
plan: 02
subsystem: tts
tags: [kokoro, onnx, tts, electron, huggingface, download, model-cache]

requires:
  - phase: 50-whisper-settings
    provides: whisperResources.ts pattern for model path + download infrastructure

provides:
  - kokoroResources.ts with getKokoroModelDir, getKokoroModelPath, isKokoroModelCached, downloadKokoroModel, KOKORO_MODEL_SIZE_MB
  - Unit tests (8 passing) covering cache check, path resolution, download progress, D-04 cleanup, D-02 abort

affects:
  - 62-03 (KokoroTTSProvider uses kokoroResources exports)
  - IPC download handler in Plan 03 calls downloadKokoroModel with onProgress

tech-stack:
  added: []
  patterns:
    - "kokoroResources.ts mirrors whisperResources.ts pattern: getModelDir/getModelPath/isModelCached/downloadModel"
    - "fetch-based download (not https.get) with for-await chunked streaming"
    - "D-04: fsPromises.unlink in catch block cleans partial file before rethrow"
    - "D-02: signal?.aborted checked each chunk + AbortSignal passed to fetch"

key-files:
  created:
    - apps/desktop/src/main/voiceInput/tts/kokoroResources.ts
    - apps/desktop/src/main/voiceInput/tts/__tests__/kokoro-resources.test.ts
  modified: []

key-decisions:
  - "Used fetch API (not https.get) — cleaner async/await with for-await streaming vs Node callback pattern"
  - "KOKORO_MODEL_SIZE_MB = 350 exported as constant for UI fallback before content-length header arrives"
  - "Model stored at app.getPath('userData')/kokoro/model.onnx — consistent with userData-only pattern (no isPackaged branching needed for Kokoro)"
  - "downloadKokoroModel accepts KokoroDownloadOptions object (not positional args) for extensibility"

patterns-established:
  - "fetch + for-await streaming for model downloads — replaces https.get callback pattern from Phase 50"
  - "AbortSignal passed directly to fetch — cleaner than manual abort listener registration"

requirements-completed:
  - TTS-OFF-01
  - TTS-OFF-04

duration: 8min
completed: 2026-05-07
---

# Phase 62 Plan 02: kokoroResources.ts Summary

**Kokoro model path resolver + fetch-based downloader with D-04 partial cleanup and D-02 AbortSignal cancellation — mirrors whisperResources.ts pattern with fetch API instead of https.get**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-07T14:08:00Z
- **Completed:** 2026-05-07T14:16:00Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Created `kokoroResources.ts` with 5 exports: `getKokoroModelDir`, `getKokoroModelPath`, `isKokoroModelCached`, `downloadKokoroModel`, `KOKORO_MODEL_SIZE_MB`
- All 8 unit tests pass (GREEN) — path resolution, cache check, progress callback, D-04 cleanup, D-02 abort
- TypeScript compiles cleanly for the new file (`tsc --noEmit` shows zero errors for kokoroResources.ts)
- Implemented D-04: partial file deleted via `fsPromises.unlink` in catch block before rethrowing
- Implemented D-02: `signal?.aborted` checked per chunk; AbortSignal passed to `fetch`

## Task Commits

1. **Task 1: Write kokoroResources.ts test scaffold (RED)** - `f308fb1` (test)
2. **Task 2: Implement kokoroResources.ts (GREEN)** - `7eca74c` (feat)

## Files Created/Modified

- `apps/desktop/src/main/voiceInput/tts/kokoroResources.ts` - Model path resolver + fetch downloader
- `apps/desktop/src/main/voiceInput/tts/__tests__/kokoro-resources.test.ts` - 8 unit tests

## Decisions Made

- Used `fetch` API with `for-await` chunked streaming instead of `https.get` callbacks — cleaner async/await, no tmp file + rename needed
- `KOKORO_MODEL_SIZE_MB = 350` exported as constant for UI fallback display before `content-length` header arrives
- Model stored under `app.getPath('userData')/kokoro/` — no `isPackaged` branching (unlike whisper which uses `extraResources` for packaged builds)
- `KokoroDownloadOptions` object parameter (not positional args) for extensibility without breaking callers

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

Pre-existing `aria-query` package error in `tts-providers.test.ts` (present before this plan — confirmed via `git stash` test). Out of scope, logged to deferred items.

## Next Phase Readiness

- `kokoroResources.ts` is ready to be imported by `KokoroTTSProvider` (Plan 03)
- `downloadKokoroModel` signature matches the IPC download handler spec in Plan 03
- Cache check `isKokoroModelCached()` is ready for the Settings UI download trigger

---
*Phase: 62-kokoro-offline-tts*
*Completed: 2026-05-07*
