---
plan: 29-01
phase: 29-stt-core-infrastructure
status: complete
completed: 2026-04-14
wave: 1
---

# Plan 29-01 Summary — Wave 0 TDD Stubs

## What Was Built

Created two TDD test stub files (RED phase) that define the interfaces for the whisper.cpp infrastructure modules before any implementation exists. Tests fail intentionally — they encode the behavioral contract that Plan 02 must satisfy.

## Key Files Created

- `apps/desktop/src/main/__tests__/whisper-gpu-detection.test.ts` (5 tests, 93 lines)
- `apps/desktop/src/main/__tests__/whisper-audio-normalizer.test.ts` (3 tests, 80 lines)

## Test Coverage

| Test File | Tests | Requirements | Status |
|-----------|-------|--------------|--------|
| whisper-gpu-detection.test.ts | CUDA detection, Vulkan fallback, Metal fallback, CPU fallback, caching | STT-01, STT-03 | RED ✓ |
| whisper-audio-normalizer.test.ts | ffmpeg args validation, non-zero exit rejection, spawn error rejection | STT-04 | RED ✓ |

## Exact Log Strings Asserted

- `'Using GPU backend: cuda'`
- `'Using GPU backend: vulkan'`
- `'Using GPU backend: metal'`
- `'Falling back to CPU'`
- `'[whisper] audio normalized: 16kHz, mono (1 channel), PCM'`

## Verification

RED state confirmed: all 8 tests fail with `Cannot find module` — production modules (`gpuDetection.ts`, `audioNormalizer.ts`) do not exist yet. This is the expected TDD RED state.

## Self-Check: PASSED

All acceptance criteria met:
- ✅ whisper-gpu-detection.test.ts exists with 5 `it(` test cases
- ✅ whisper-audio-normalizer.test.ts exists with 3 `it(` test cases
- ✅ Exact log strings from D-12/success criteria asserted
- ✅ Tests are RED (Cannot find module — production files not created)
- ✅ Committed to master (a3ed5ea)
