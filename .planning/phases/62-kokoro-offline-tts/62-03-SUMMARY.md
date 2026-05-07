---
phase: 62-kokoro-offline-tts
plan: 03
subsystem: tts
tags: [kokoro, onnx, tts, electron, ipc, preload, offline]

requires:
  - phase: 62-01
    provides: store.ts + ipc-types.ts Kokoro extensions (TtsProviderOption, IPC channels, store schema)
  - phase: 62-02
    provides: kokoroResources.ts with downloadKokoroModel, isKokoroModelCached, KOKORO_MODEL_SIZE_MB

provides:
  - KokoroTTSProvider class implementing TTSProvider interface with format='wav' (TTS-OFF-01)
  - createTTSProvider() extended with 'kokoro' case — local-only + fallback modes (TTS-OFF-02, TTS-OFF-05)
  - setupKokoroHandlers() IPC handler registration for download/cancel/check-cached
  - window.kokoro contextBridge API (downloadModel, cancelDownload, checkCached, onDownloadProgress)
  - settings.ts SETTINGS_GET includes kokoroLocalOnly + kokoroModelCached
  - settings.ts SETTINGS_SAVE handles kokoroLocalOnly with TTS reinit

affects:
  - 62-04 (Settings UI KokoroSection uses window.kokoro and window.settings.save(kokoroLocalOnly))
  - voiceHandler.ts (createTTSProvider now returns KokoroTTSProvider when provider='kokoro')

tech-stack:
  added: []
  patterns:
    - "KokoroTTSProvider: lazy model loading on first synthesize() call — singleton ONNX session reuse"
    - "device: null = kokoro-js default auto-select (webgpu → wasm → cpu, D-10)"
    - "setupKokoroHandlers mirrors setupWhisperHandlers (Phase 50) — lazy BrowserWindow getter"
    - "window.kokoro preload follows window.whisper pattern — inlined channel strings (no shared chunk)"
    - "FallbackTTSProvider(kokoro, murf) for non-local-only mode (TTS-OFF-02, D-07)"

key-files:
  created:
    - apps/desktop/src/main/voiceInput/tts/kokoro.ts
    - apps/desktop/src/main/voiceInput/tts/__tests__/kokoro.test.ts
    - apps/desktop/src/main/ipc/kokoro.ts
  modified:
    - apps/desktop/src/main/voiceInput/tts/index.ts
    - apps/desktop/src/preload/settings.ts
    - apps/desktop/src/main/ipc/settings.ts
    - apps/desktop/src/main/index.ts
    - apps/desktop/src/main/store.ts
    - apps/desktop/src/shared/ipc-types.ts

key-decisions:
  - "device: null used instead of 'auto' — kokoro-js type def doesn't include 'auto'; null triggers kokoro-js default (webgpu → wasm → cpu)"
  - "All Plan 01 prerequisites (store.ts, ipc-types.ts) already applied by parallel agent — no duplication needed"
  - "isKokoroModelCached() used in SETTINGS_GET (not getKokoroModelPath().length > 0) for semantic accuracy"
  - "store.ts ttsVoiceIds kokoro key added as '' (empty = no voice override needed for offline TTS)"
  - "setupKokoroHandlers registered at app startup alongside setupWhisperHandlers in index.ts"

duration: 14min
completed: 2026-05-07
---

# Phase 62 Plan 03: KokoroTTSProvider + IPC + Preload Summary

**KokoroTTSProvider implementing TTSProvider with lazy ONNX model loading, GPU auto-detect, wav output, plus full IPC download pipeline and window.kokoro contextBridge API**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-05-07T17:13:03Z
- **Completed:** 2026-05-07T17:27:03Z
- **Tasks:** 2 (TDD Task 1 + integration Task 2)
- **Files modified:** 9

## Accomplishments

- Created `KokoroTTSProvider` (kokoro.ts) implementing TTSProvider with `format='wav'`, lazy model loading, singleton ONNX session reuse, GPU auto-detect (D-10)
- All 7 unit tests pass (GREEN) — wav format, empty text throw, lazy-load once, descriptive errors for load/synthesis failures, name, error propagation
- Extended `tts/index.ts` factory with `'kokoro'` case: local-only mode (returns bare KokoroTTSProvider) + default mode (FallbackTTSProvider with Murf)
- Created `ipc/kokoro.ts` with `setupKokoroHandlers()`: KOKORO_DOWNLOAD_MODEL handler with AbortController + progress broadcast, KOKORO_CANCEL_DOWNLOAD, KOKORO_CHECK_CACHED
- Extended `preload/settings.ts` with `window.kokoro` API (downloadModel, cancelDownload, checkCached, onDownloadProgress with unsubscribe)
- Extended `ipc/settings.ts` SETTINGS_GET with `kokoroLocalOnly`/`kokoroModelCached`; SETTINGS_SAVE handles `kokoroLocalOnly` + triggers TTS reinit
- Registered `setupKokoroHandlers(getSettingsWindow)` in `main/index.ts` alongside `setupWhisperHandlers`
- TypeScript: 0 new errors in Plan 03 files (pre-existing errors unchanged, count went from 125 to 124)

## Task Commits

1. **Task 1 RED: add failing tests for KokoroTTSProvider** - `fa31678` (test)
2. **Task 1 GREEN: implement KokoroTTSProvider** - `b813110` (feat)
3. **Task 2: extend TTS factory, create IPC handler, expose window.kokoro API** - `a9e88e4` (feat)

## Files Created/Modified

- `apps/desktop/src/main/voiceInput/tts/kokoro.ts` - KokoroTTSProvider class (new)
- `apps/desktop/src/main/voiceInput/tts/__tests__/kokoro.test.ts` - 7 unit tests (new)
- `apps/desktop/src/main/ipc/kokoro.ts` - setupKokoroHandlers IPC (new)
- `apps/desktop/src/main/voiceInput/tts/index.ts` - factory extended with 'kokoro' case
- `apps/desktop/src/preload/settings.ts` - window.kokoro contextBridge
- `apps/desktop/src/main/ipc/settings.ts` - kokoroLocalOnly/kokoroModelCached added + isKokoroModelCached import
- `apps/desktop/src/main/index.ts` - setupKokoroHandlers registration
- `apps/desktop/src/main/store.ts` - Kokoro store schema + accessors (Plan 01 prerequisite)
- `apps/desktop/src/shared/ipc-types.ts` - TtsProviderOption + KokoroDownloadProgress + KokoroApi + IPC channels (Plan 01 prerequisite)

## Decisions Made

- `device: null` instead of `device: 'auto'` — kokoro-js TypeScript type definitions only accept `'cpu' | 'wasm' | 'webgpu' | null | undefined`; `null` triggers kokoro-js internal auto-selection which achieves the same ONNX Runtime auto-detect (D-10)
- Used `isKokoroModelCached()` in `SETTINGS_GET` for semantic accuracy instead of `getKokoroModelPath().length > 0`
- `store.ts` and `ipc-types.ts` changes created as blocking prerequisites (Rule 3) since Plan 01 wasn't committed yet to this worktree at execution time

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan 01 prerequisites not yet committed to worktree**
- **Found during:** Task 1 setup
- **Issue:** store.ts lacked `getTtsLocalOnlyFlag`/`setTtsLocalOnlyFlag`/`getKokoroModelPath`/`setKokoroModelPath`; ipc-types.ts lacked Kokoro IPC channels, `KokoroDownloadProgress`, `KokoroApi`, extended `TtsProviderOption`
- **Fix:** Created all Plan 01 prerequisites inline as part of Plan 03 execution
- **Files modified:** `store.ts`, `ipc-types.ts`
- **Note:** Another parallel agent had already applied these changes; my implementation aligned correctly

**2. [Rule 1 - Bug] `device: 'auto'` not assignable to kokoro-js type def**
- **Found during:** Task 1 TypeScript check
- **Issue:** kokoro-js type definition accepts `'cpu' | 'wasm' | 'webgpu' | null | undefined`, not `'auto'`
- **Fix:** Used `device: null` (kokoro-js interprets null as auto-select — same runtime behavior)
- **Files modified:** `kokoro.ts`

## Known Stubs

None — all exports are wired to real implementations.

## Self-Check: PASSED
