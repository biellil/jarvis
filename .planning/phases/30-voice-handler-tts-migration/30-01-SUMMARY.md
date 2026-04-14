---
phase: 30-voice-handler-tts-migration
plan: "01"
subsystem: testing
tags: [vitest, tdd, whisper, tts, vram, voice-handler]

# Dependency graph
requires:
  - phase: 29-stt-core-infrastructure
    provides: gpuDetection.ts, audioNormalizer.ts, whisperResources.ts pattern references
provides:
  - "Failing test stubs for vramDetection (7 tests — STT-02)"
  - "Failing test stubs for TTS providers Murf + ElevenLabs + factory (11 tests — TTS-01, TTS-02)"
  - "Failing test stubs for voiceHandler pipeline orchestration (5 tests — ARCH-05)"
affects:
  - 30-02-vramDetection
  - 30-03-tts-providers
  - 30-04-voiceHandler

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED phase: test files import non-existent modules to define contracts before implementation"
    - "vi.resetModules() in beforeEach for module-scope cache isolation (same as whisper-gpu-detection.test.ts)"
    - "vi.stubEnv for env-var-dependent test isolation (afterEach vi.unstubAllEnvs)"

key-files:
  created:
    - apps/desktop/src/main/__tests__/vramDetection.test.ts
    - apps/desktop/src/main/__tests__/voiceHandler.test.ts
    - apps/desktop/src/main/voiceInput/tts/__tests__/tts-providers.test.ts
  modified: []

key-decisions:
  - "VoiceHandlerDeps injected as function parameter (not class constructor) for testability — follows ChatHandlerDeps pattern"
  - "handleAudio exports named function (not method) matching the deps-injection pattern in ipc/chat.ts"
  - "TTS failure graceful degrade: return audioBase64=null with message intact (WAKE-10 precedent)"
  - "tts-providers tts/__tests__/ directory created adjacent to future implementation files"

patterns-established:
  - "TDD Wave 0 pattern: stub tests define interface contracts before any implementation files exist"

requirements-completed:
  - STT-02
  - TTS-01
  - TTS-02
  - ARCH-05

# Metrics
duration: 2min
completed: 2026-04-14
---

# Phase 30 Plan 01: Wave 0 TDD Stubs — vramDetection, TTS Providers, voiceHandler Summary

**Three failing test files define interface contracts for VRAM-based model selection, Murf/ElevenLabs TTS migration, and voiceHandler pipeline orchestration before any implementation**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-14T21:27:25Z
- **Completed:** 2026-04-14T21:29:19Z
- **Tasks:** 3
- **Files modified:** 3 created

## Accomplishments

- Created `vramDetection.test.ts` with 7 failing tests covering VRAM threshold thresholds (>8192 MB→large, 4096–8192 MB→base, <4096 MB→tiny) and module-scope caching contract
- Created `tts-providers.test.ts` with 11 failing tests for MurfTTSProvider, ElevenLabsTTSProvider, and createTTSProvider factory (env-based selection with graceful degrade)
- Created `voiceHandler.test.ts` with 5 failing tests covering success path, TTS degrade, LLM error, normalization error, and empty transcription error codes
- All tests fail with "Cannot find module" — RED phase complete, Wave 0 Nyquist requirement satisfied

## Task Commits

1. **Tasks 1+2+3: All three test stubs** - `4ec0436` (test)

## Files Created/Modified

- `apps/desktop/src/main/__tests__/vramDetection.test.ts` — 7 tests for VRAM detection and model selection (STT-02)
- `apps/desktop/src/main/__tests__/voiceHandler.test.ts` — 5 tests for pipeline orchestration (ARCH-05)
- `apps/desktop/src/main/voiceInput/tts/__tests__/tts-providers.test.ts` — 11 tests for Murf, ElevenLabs, and factory (TTS-01, TTS-02)

## Decisions Made

- `handleAudio` is a named function export (not method) from `voiceHandler.ts` for clean dependency injection following the `ChatHandlerDeps` pattern in `ipc/chat.ts`
- `VoiceHandlerDeps` type includes `config`, `selectedModel`, and `ttsProvider` — sufficient for full pipeline orchestration without hidden globals
- TTS graceful degrade returns `{ success: true, data: { ..., audioBase64: null } }` — consistent with WAKE-10 precedent, not a hard error
- `getWhisperInstance` abstraction mocked from `whisperResources.js` in voiceHandler tests — Plan 30-02 will add this to `whisperResources.ts`

## Deviations from Plan

None — plan executed exactly as written. All three test files created with the exact structures specified in the plan actions.

## Issues Encountered

None.

## Next Phase Readiness

- All three test stub contracts are defined — Plans 30-02 (vramDetection), 30-03 (TTS providers), and 30-04 (voiceHandler) can now implement GREEN phase
- `whisperResources.ts` will need `getWhisperInstance()` function added (30-02 scope)
- `apps/desktop/src/main/voiceInput/tts/` directory exists and ready for murf.ts, elevenlabs.ts, index.ts (30-03 scope)

---
*Phase: 30-voice-handler-tts-migration*
*Completed: 2026-04-14*
