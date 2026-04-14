---
phase: 30-voice-handler-tts-migration
plan: "02"
subsystem: voice-pipeline
tags: [whisper, vram-detection, model-selection, electron, tts, packaging]

# Dependency graph
requires:
  - phase: 30-01
    provides: vramDetection.test.ts stub (7 failing tests)
  - phase: 29-stt-core-infrastructure
    provides: gpuDetection.ts caching pattern, whisperResources.ts baseline
provides:
  - "vramDetection.ts: detectVramAndSelectModel() + getSelectedModel() with module-scope cache"
  - "whisperResources.ts: multi-model getWhisperModelPath(modelName) with resourcesPath packaged support"
  - "electron-builder.yml: extraResources for ggml-tiny.bin, ggml-base.bin, ggml-large-v3.bin"
affects:
  - 30-04-voiceHandler (consumes detectVramAndSelectModel + getWhisperModelPath)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-scope caching for detection results (undefined = not initialized, same as gpuDetection.ts)"
    - "app.getGPUInfo('complete') → auxAttributes.gpuMemoryMB (string or number, parse both)"
    - "process.resourcesPath for packaged builds, app.getPath('userData') for dev"
    - "electron-builder extraResources with filter array for selective model bundling"

key-files:
  created:
    - apps/desktop/src/main/voiceInput/vramDetection.ts
  modified:
    - apps/desktop/src/main/voiceInput/whisperResources.ts
    - apps/desktop/electron-builder.yml

key-decisions:
  - "vramMb=0 fallback to 'base' (D-03) — integrated GPU or incomplete driver, safe conservative choice"
  - "WhisperModel type defined in both vramDetection.ts and whisperResources.ts — Plan 30-04 will import from vramDetection.ts"
  - "getWhisperModelPath(modelName='base') default arg preserves backward compatibility for any existing callers"

# Metrics
duration: 8min
completed: 2026-04-14
---

# Phase 30 Plan 02: VRAM Detection + whisperResources Multi-Model + electron-builder Bundling Summary

**VRAM detection with model selection thresholds, multi-model path resolver with packaged/dev duality, and whisper model extraResources wired into electron-builder config**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-14T22:36:45Z
- **Completed:** 2026-04-14T22:44:00Z
- **Tasks:** 2
- **Files modified:** 1 created, 2 modified

## Accomplishments

- Created `vramDetection.ts` implementing `detectVramAndSelectModel()` with Electron `app.getGPUInfo('complete')`, correct thresholds (>8192 large, 4096-8192 base, <4096 tiny), D-03 safe fallback to 'base' for vramMb=0/undefined, exact log strings per D-04, and module-scope caching
- Updated `whisperResources.ts` replacing zero-arg `getWhisperModelPath()` with `getWhisperModelPath(modelName: WhisperModel = 'base')`, `MODEL_FILENAMES` record, `process.resourcesPath` in packaged builds, `app.getPath('userData')` in dev
- Updated `electron-builder.yml` with `extraResources` entry for all 3 whisper model bins (`ggml-tiny.bin`, `ggml-base.bin`, `ggml-large-v3.bin`) under `resources/models/whisper → models/whisper`
- All 7 `vramDetection.test.ts` tests pass (TDD GREEN phase complete)

## Task Commits

1. **Task 1: vramDetection.ts** - `8806047`
2. **Task 2: whisperResources.ts + electron-builder.yml** - `7216689`

## Files Created/Modified

- `apps/desktop/src/main/voiceInput/vramDetection.ts` — VRAM detection, model selection, module-scope cache (STT-02)
- `apps/desktop/src/main/voiceInput/whisperResources.ts` — multi-model path resolver with packaged/dev duality (D-06)
- `apps/desktop/electron-builder.yml` — extraResources for all 3 whisper model bins (D-05, D-06)

## Decisions Made

- `WhisperModel` type duplicated in both `vramDetection.ts` and `whisperResources.ts` for now — single source of truth consolidation deferred to when voiceHandler.ts imports both (Plan 30-04)
- Default parameter `modelName: WhisperModel = 'base'` in `getWhisperModelPath` maintains backward compatibility with any callers that use zero-arg form

## Deviations from Plan

None — plan executed exactly as written. The implementation matches the action blocks in 30-02-PLAN.md verbatim.

## Known Stubs

None — all exported functions are fully implemented with real logic.

## Self-Check: PASSED

- `apps/desktop/src/main/voiceInput/vramDetection.ts` — EXISTS
- `apps/desktop/src/main/voiceInput/whisperResources.ts` — EXISTS (modified)
- `apps/desktop/electron-builder.yml` — EXISTS (modified)
- Commit `8806047` — EXISTS
- Commit `7216689` — EXISTS
- All 7 vramDetection tests PASS
