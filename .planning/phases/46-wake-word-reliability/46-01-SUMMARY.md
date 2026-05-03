---
phase: 46-wake-word-reliability
plan: 01
subsystem: voice
tags: [openwakeword, onnxruntime, mel-spectrogram, wake-word, vitest, happy-dom]

# Dependency graph
requires:
  - phase: 45-voice-pipeline-bug-fixes
    provides: PTT guard and Whisper model override fixes that stabilized voice pipeline
provides:
  - Fixed mel normalization formula in WakeWordEngine.ts (x/10 + 2 instead of x/10 - 2)
  - Restored test environment for WakeWordEngine (happy-dom + correct ONNX session mocks)
  - 8 passing unit tests covering detection, debounce, VAD gate, silent stream, and restart
affects: [voice-pipeline, wake-word, wakeWordEngine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "happy-dom vitest environment annotation fixes import-order issues with ort.env.wasm side-effects"
    - "ONNX session mocks must expose inputNames and outputNames arrays alongside run() method"

key-files:
  created: []
  modified:
    - apps/desktop/src/renderer/src/voice/wakeWord/WakeWordEngine.ts
    - apps/desktop/src/renderer/src/voice/wakeWord/__tests__/WakeWordEngine.test.ts

key-decisions:
  - "Mel normalization formula corrected to x/10 + 2 — the sign inversion (- 2) was the root cause of near-zero classifier scores"
  - "Test environment fixed with explicit @vitest-environment happy-dom annotation rather than relying on environmentMatchGlobs to avoid ort.env.wasm side-effect ordering"
  - "VAD re-enable deferred to future work — out of scope for this fix"

patterns-established:
  - "Mel normalization: openwakeword/utils.py formula is (mel / 10) + 2 — positive bias shifts inputs into [-2, +4] range"
  - "WakeWordEngine tests require happy-dom env + inputNames/outputNames on all 4 session mocks (mel, embed, vad, kw)"

requirements-completed: [WW-01, WW-02]

# Metrics
duration: 30min
completed: 2026-05-02
---

# Phase 46 Plan 01: Wake Word Reliability Summary

**Fixed sign inversion in mel spectrogram normalization (x/10 - 2 -> x/10 + 2), restoring openwakeword classifier inputs to correct distribution and enabling reliable "Hey JARVIS" activation**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-02
- **Completed:** 2026-05-02
- **Tasks:** 2 (1 automated TDD + 1 human smoke test)
- **Files modified:** 2

## Accomplishments

- Identified and fixed root cause of missed wake word activations: mel normalization formula had sign inversion (`- 2` instead of `+ 2`), shifting all classifier inputs 4 units outside the openwakeword training distribution, producing scores ~0.0001 for all audio including real speech
- Restored broken test environment by adding `@vitest-environment happy-dom` annotation and fixing ONNX session mocks to include `inputNames`/`outputNames` — all 8 WakeWordEngine unit tests now green
- Human smoke test confirmed "Hey JARVIS" activates reliably with console scores >= 0.5

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix mel normalization sign and restore test environment** - `6502136` (fix)
2. **Task 2: Manual smoke test** - N/A (human verification checkpoint — no code changes)

**Plan metadata:** `8b96d32` (docs: update STATE.md at checkpoint)

## Files Created/Modified

- `apps/desktop/src/renderer/src/voice/wakeWord/WakeWordEngine.ts` - Changed `melBuffer[i] / 10 - 2` to `melBuffer[i] / 10 + 2` and updated inline comment
- `apps/desktop/src/renderer/src/voice/wakeWord/__tests__/WakeWordEngine.test.ts` - Added `@vitest-environment happy-dom` annotation and `inputNames`/`outputNames` to all 4 session mocks

## Decisions Made

- Corrected mel normalization to `x / 10 + 2` per openwakeword/utils.py — the `- 2` sign was a typo that went undetected because tests were broken (all failing with `document is not defined` before this fix)
- VAD gate re-enable explicitly deferred — it was disabled in an earlier commit and its re-enabling is separate future work; not touched in this plan
- Used `@vitest-environment happy-dom` file-level annotation rather than relying on `environmentMatchGlobs` in vitest.config.ts because `modelLoader.ts` has a top-level side-effect on `ort.env.wasm.wasmPaths` that uses `document.baseURI` before the environment glob is applied

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The plan fully specified the fix and test changes. The human smoke test confirmed successful activation on first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Wake word reliability is restored — "Hey JARVIS" activates on first or second attempt in quiet environments with scores >= 0.5
- VAD gate re-enable is deferred; if false positive rate increases after broader testing, re-enabling VAD gate should be the next wake-word improvement
- Phase 46 is the final phase in the v2.0 milestone roadmap; all planned bug fixes are complete

---
*Phase: 46-wake-word-reliability*
*Completed: 2026-05-02*
