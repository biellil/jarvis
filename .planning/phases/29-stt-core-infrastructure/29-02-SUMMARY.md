---
phase: 29-stt-core-infrastructure
plan: "02"
subsystem: voice
tags: [whisper, gpu-detection, audio-normalization, electron, ffmpeg, native-addons, asar]

requires:
  - phase: 29-01
    provides: RED TDD stubs for whisper-gpu-detection and whisper-audio-normalizer tests

provides:
  - gpuDetection.ts with CUDA/Vulkan/Metal/CPU auto-detection, module-level caching, exact D-12 log strings
  - audioNormalizer.ts converting WebM/Opus to 16kHz PCM mono WAV via ffmpeg-static spawn
  - whisperResources.ts resolving ggml-base.bin path to app.getPath('userData')
  - electron-builder.yml with asarUnpack for node_modules/@fugood/** (INFRA-01)
  - @fugood/whisper.node@1.0.16 and ffmpeg-static@^5.3.0 installed in desktop deps

affects:
  - 29-03 (feature flag + model download will import gpuDetection and whisperResources)
  - 29-04 (transcription PoC uses gpuDetection backend, audioNormalizer output)
  - 30 (Phase 30 voiceHandler.ts orchestrates all three modules)

tech-stack:
  added:
    - "@fugood/whisper.node@1.0.16 — whisper.cpp Node bindings with GPU support"
    - "ffmpeg-static@^5.3.0 — bundled FFmpeg binary for audio conversion"
  patterns:
    - "GPU detection: try-catch loop over GPU_BACKENDS array, early return on success, module-level cache"
    - "ffmpeg spawn: createRequire for ffmpeg-static path, pipe:0 stdin write, pipe:1 stdout collect, close handler"
    - "asarUnpack for .node binaries (NOT extraResources) — same yml, different key than wake word ONNX assets"

key-files:
  created:
    - apps/desktop/src/main/voiceInput/gpuDetection.ts
    - apps/desktop/src/main/voiceInput/audioNormalizer.ts
    - apps/desktop/src/main/voiceInput/whisperResources.ts
  modified:
    - apps/desktop/package.json (added @fugood/whisper.node, ffmpeg-static)
    - apps/desktop/electron-builder.yml (added asarUnpack section)

key-decisions:
  - "asarUnpack covers node_modules/@fugood/** — .node binaries need real filesystem path for require() (D-01)"
  - "whisperResources uses app.getPath('userData') — not app.asar.unpacked path — because userData is always real filesystem (D-02, D-03)"
  - "getFfmpegPath handles both CJS string and ESM {default: string} module shapes for test mock compatibility"
  - "gpuDetection cache guard uses undefined sentinel (not 'cpu') to distinguish uninitialized from CPU-fallback result"

patterns-established:
  - "voiceInput modules follow resources.ts pattern: Electron imports, path.join, no __dirname polyfill needed when userData-based"
  - "GPU detection: module-level let variable as cache, undefined = uninitialized, GPU_BACKENDS const array"

requirements-completed: [STT-01, STT-03, STT-04, INFRA-01]

duration: 6min
completed: 2026-04-14
---

# Phase 29 Plan 02: STT Core Infrastructure — Implementation Summary

**GPU auto-detection (CUDA/Vulkan/Metal/CPU), WebM-to-16kHz-PCM audio normalization via ffmpeg spawn, model path resolver, and asarUnpack packaging config — all 8 Plan 01 tests GREEN**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-14T10:04:12Z
- **Completed:** 2026-04-14T10:10:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Installed `@fugood/whisper.node@1.0.16` and `ffmpeg-static@^5.3.0` into desktop dependencies
- Implemented all three core voiceInput modules with exact contract log strings from D-12
- Turned all 8 Plan 01 TDD stubs GREEN (5 GPU detection + 3 audio normalizer)
- Configured `asarUnpack` in electron-builder.yml for native .node binaries (INFRA-01)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install deps + gpuDetection.ts** - `d8adbb5` (feat)
2. **Task 2: audioNormalizer.ts + whisperResources.ts** - `a634462` (feat)
3. **Task 3: electron-builder.yml asarUnpack** - `8de50f0` (chore)

## Files Created/Modified

- `apps/desktop/src/main/voiceInput/gpuDetection.ts` - GPU backend auto-detection with caching and exact D-12 log strings
- `apps/desktop/src/main/voiceInput/audioNormalizer.ts` - WebM/Opus → 16kHz PCM mono WAV via ffmpeg-static spawn
- `apps/desktop/src/main/voiceInput/whisperResources.ts` - Model path resolver using app.getPath('userData')
- `apps/desktop/package.json` - Added @fugood/whisper.node@1.0.16 and ffmpeg-static@^5.3.0
- `apps/desktop/electron-builder.yml` - Added asarUnpack section for node_modules/@fugood/**

## Decisions Made

- `whisperResources.ts` uses `app.getPath('userData')` directly (not `app.isPackaged` branching) because userData is always a real filesystem path in both dev and prod — no ASAR issue for model storage (D-03)
- `getFfmpegPath()` handles both CJS string return and ESM mock `{ default: string }` shape, enabling tests to mock `ffmpeg-static` with ESM module format without code change
- Cache guard in `gpuDetection.ts` uses `undefined` sentinel (not `'cpu'` default) to correctly distinguish "not yet detected" from "detected CPU fallback"

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — all 8 tests passed GREEN on first run.

## Known Stubs

None — all three modules implement their full contracts. `whisperResources.ts` correctly returns model path (download logic is Plan 03's responsibility per D-04).

## Next Phase Readiness

- gpuDetection, audioNormalizer, and whisperResources are ready for Plan 03 (feature flag + model download)
- asarUnpack packaging config is in place — ready for Plan 04 build verification
- All Plan 01 TDD test stubs are now GREEN

---
*Phase: 29-stt-core-infrastructure*
*Completed: 2026-04-14*
