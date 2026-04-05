---
phase: 03-voice-pipeline
plan: 02
subsystem: voice
tags: [argparse, voice-mode, cli, command-dispatch, state-messages, tdd, CONV-02, CONV-04]

# Dependency graph
requires:
  - phase: 03-voice-pipeline
    plan: 01
    provides: WhisperTranscriber class, whisper_model/whisper_language Settings fields
  - phase: 02-memory
    provides: ChatSession.send(), MemoryStore, MemoryVectors
provides:
  - --voice CLI flag via argparse activating voice mode in __main__.py
  - /voice <path> and > <path> command dispatch to WhisperTranscriber.transcribe()
  - State messages per D-08: processando, transcricao, arquivo nao encontrado, sem fala detectada
  - Integration tests documenting CONV-03 (TTS) and CONV-05 (wake word) as client-deferred
  - 22 total voice tests (9 from Plan 01 + 13 from Plan 02)
affects: [03-voice-pipeline, CONV-02, CONV-03, CONV-04, CONV-05, ARCH-02]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - argparse parsed in main() before asyncio.run() — flag flows into main_async(voice_mode) as bool
    - String prefix slicing (not split()) for path extraction — preserves spaces in paths
    - Transcriber initialized lazily only when voice_mode=True — no startup cost in text mode
    - State messages printed before await calls — visible immediately per D-08 ordering

key-files:
  created:
    - .planning/phases/03-voice-pipeline/03-02-SUMMARY.md
  modified:
    - src/jarvis/__main__.py
    - tests/test_voice.py

key-decisions:
  - "String prefix slicing over split() for path extraction — split('/voice ') fails on paths with spaces, slice is safe"
  - "argparse only in main(), not at module level — avoids sys.argv side effects during import or testing (Pitfall 4)"
  - "WhisperTranscriber initialized on voice_mode=True only — no model load in text mode, clean separation of concerns"
  - "Empty transcript guard before session.send() — silence must not generate JARVIS response (Pitfall 3)"
  - "CONV-03 and CONV-05 documented as client-deferred via negative tests — module absence is the contract"

requirements-completed: [CONV-02, CONV-03, CONV-04, CONV-05, ARCH-02]

# Metrics
duration: 4min
completed: 2026-04-04
---

# Phase 3 Plan 02: Voice CLI Wiring Summary

**argparse --voice flag, /voice command dispatch, and D-08 state messages wired into __main__.py with 13 new integration tests**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-04T21:20:28Z
- **Completed:** 2026-04-04T21:24:18Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `argparse` --voice flag to `main()` — activates voice mode per D-01
- Updated `main_async()` to accept `voice_mode: bool = False` parameter per ARCH-02
- Wired `/voice <path>` and `> <path>` command dispatch to `WhisperTranscriber.transcribe()` per D-02
- State messages per D-08: `[voz]: processando`, `[transcricao]: "..."`, `[voz]: arquivo nao encontrado`, `[voz]: audio sem fala detectada`
- Error handling: FileNotFoundError displays user-friendly message; unexpected exceptions logged via loguru and shown
- Empty transcript guard prevents `session.send()` call for silent audio (Pitfall 3)
- Transcript forwarded to `session.send()` identically to typed text — memory, profile, ChromaDB all work for voice input per D-09
- 13 new integration tests appended to tests/test_voice.py — 22 total, all passing
- CONV-03 (TTS) and CONV-05 (wake word) formally documented as client-deferred via negative module-existence tests
- Full regression suite: 115/115 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Add argparse --voice flag and /voice command dispatch to __main__.py** — `262e28b` (feat)
2. **Task 2: Add integration tests for voice command wiring and state messages** — `d288845` (test)

## Files Created/Modified

- `src/jarvis/__main__.py` — Added argparse, WhisperTranscriber import, voice_mode param, /voice dispatch block, D-08 state messages, error handling
- `tests/test_voice.py` — Appended 13 new tests: TestVoiceCommandDispatch, TestArgparse, TestStateMessages, TestConv03Conv05Deferred

## Decisions Made

- String prefix slicing for path extraction: `stripped[7:].strip()` for `/voice `, `stripped[2:].strip()` for `> ` — handles paths with spaces correctly (split() would fail on `"/voice my file.wav"`)
- `argparse` used only in `main()`, not at module level — prevents sys.argv side effects when importing `main_async` in tests
- Transcriber initialized only when `voice_mode=True` — text mode users pay zero startup cost, no model loaded
- `Path(raw_path).resolve()` for path normalization — handles both relative and absolute paths correctly per D-03

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria met on first attempt.

## Known Stubs

None — all voice pipeline features are fully wired. CONV-03 (TTS) and CONV-05 (wake word) are intentionally absent per explicit scope decisions documented in CONTEXT.md D-07 and confirmed by negative tests.

## Self-Check: PASSED

- FOUND: src/jarvis/__main__.py (165 lines, contains all required patterns)
- FOUND: tests/test_voice.py (247 lines, 22 tests)
- FOUND: commit 262e28b (Task 1 — feat)
- FOUND: commit d288845 (Task 2 — test)
- All 115 tests pass (22 voice + 93 existing)
- `python -m jarvis --help` shows --voice flag
- `voice_mode` parameter present in main_async() signature

---
*Phase: 03-voice-pipeline*
*Completed: 2026-04-04*
