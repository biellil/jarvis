---
phase: 03-voice-pipeline
plan: 01
subsystem: voice
tags: [faster-whisper, whisper, stt, asyncio, lazy-loading, tdd]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: config.py Settings singleton pattern, loguru logging setup
provides:
  - WhisperTranscriber class with lazy WhisperModel loading and async-safe transcription
  - whisper_model and whisper_language Settings fields (configurable via .env)
  - faster-whisper==1.2.1 dependency in pyproject.toml
  - 9 unit tests for voice module (fully mocked, no model download)
affects: [03-02-PLAN, 03-voice-pipeline]

# Tech tracking
tech-stack:
  added: [faster-whisper==1.2.1]
  patterns:
    - asyncio.to_thread() bridges synchronous CPU-bound Whisper transcription to async event loop
    - Lazy model loading via _load_model() — model not loaded at instantiation, only on first use
    - Segments generator fully consumed inside thread before returning to async context

key-files:
  created:
    - src/jarvis/core/voice.py
    - tests/test_voice.py
  modified:
    - pyproject.toml
    - src/jarvis/config.py

key-decisions:
  - "WhisperTranscriber uses lazy loading pattern — model is None until first _load_model() call to avoid startup cost"
  - "asyncio.to_thread() chosen over thread pool executor directly — simpler, idiomatic Python 3.9+ pattern for ARCH-02"
  - "Segments generator consumed inside _transcribe_sync() thread — never returned across thread boundary (Pitfall 1)"
  - "FileNotFoundError guard checks path existence before entering thread pool — fast fail without thread overhead"
  - "vad_filter=True in faster-whisper call — Voice Activity Detection filters silence, reduces false transcriptions"

patterns-established:
  - "Pattern 1: Sync/async bridge — wrap CPU-bound sync calls with asyncio.to_thread() for event loop safety"
  - "Pattern 2: Lazy model loading — set _model = None at init, load in _load_model() only when needed"
  - "Pattern 3: TDD with mocked external models — patch WhisperModel to avoid 150MB download in tests"

requirements-completed: [CONV-02, ARCH-02]

# Metrics
duration: 3min
completed: 2026-04-04
---

# Phase 3 Plan 01: Voice STT Core Summary

**WhisperTranscriber with lazy-loaded faster-whisper, async-safe transcription via asyncio.to_thread(), and 9 mocked unit tests**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-04T21:13:10Z
- **Completed:** 2026-04-04T21:16:24Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created `WhisperTranscriber` class with lazy `WhisperModel` loading — model only loads on first `transcribe()` call
- Async `transcribe()` uses `asyncio.to_thread()` to offload blocking Whisper transcription, satisfying ARCH-02
- Segments generator fully consumed inside the thread (critical pitfall avoided — no generator leak across thread boundaries)
- Added `whisper_model="base"` and `whisper_language="pt"` to Settings with `.env` override support
- Added `faster-whisper==1.2.1` to `pyproject.toml` dependencies
- 9 unit tests passing — all mocked (no model download required), covering init, sync transcription, async compliance, and lazy loading

## Task Commits

Each task was committed atomically:

1. **Task 1: Add faster-whisper dependency and voice Settings fields** - `5a71623` (feat)
2. **Task 2: Create WhisperTranscriber with lazy loading, async transcription, and unit tests** - `120038d` (feat)

## Files Created/Modified

- `src/jarvis/core/voice.py` - WhisperTranscriber class (lazy loading, async transcription, FileNotFoundError guard)
- `tests/test_voice.py` - 9 unit tests (mocked WhisperModel, async compliance, lazy loading verification)
- `pyproject.toml` - Added faster-whisper==1.2.1 to dependencies list
- `src/jarvis/config.py` - Added whisper_model/whisper_language fields, also sqlite_path/chroma_path (previously missing)

## Decisions Made

- `asyncio.to_thread()` over manual `ThreadPoolExecutor` — idiomatic Python 3.9+ pattern, simpler, and sufficient for single-threaded assistant use
- `vad_filter=True` in every transcription call — Voice Activity Detection removes silence regions, reduces erroneous transcripts
- `device="auto"`, `compute_type="default"` in WhisperModel — lets faster-whisper choose GPU if available, CPU otherwise; no hardcoded assumption
- `FileNotFoundError` guard before thread dispatch — fast fail path avoids thread pool overhead for missing files

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added sqlite_path and chroma_path to Settings**
- **Found during:** Task 1 (reading src/jarvis/config.py)
- **Issue:** The plan's `<interfaces>` block showed `sqlite_path` and `chroma_path` fields in Settings, but the actual config.py file was missing them — they were referenced in the plan template but never added during Phase 2
- **Fix:** Added both fields with their documented defaults (`data/jarvis.db` and `data/chroma`) to the Settings class
- **Files modified:** src/jarvis/config.py
- **Verification:** `from jarvis.config import settings` imports cleanly, all existing tests still pass (41/41)
- **Committed in:** 5a71623 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical field)
**Impact on plan:** Auto-fix added previously absent but documented Settings fields. No scope creep — fields were planned in Phase 2 per the interfaces contract.

## Issues Encountered

None — plan executed cleanly with one small deviation auto-fixed.

## User Setup Required

None — faster-whisper is installed via pip and operates fully offline after model download. No API keys required. Model download happens on first real transcription call (not in tests).

## Next Phase Readiness

- `WhisperTranscriber` is ready for Plan 02 to wire into the CLI voice loop
- Plan 02 will add `--voice` CLI flag (argparse), `/voice <path>` command dispatch, and terminal state messages per D-08
- No blockers

## Self-Check: PASSED

- FOUND: src/jarvis/core/voice.py
- FOUND: tests/test_voice.py
- FOUND: 03-01-SUMMARY.md
- FOUND: commit 5a71623 (Task 1)
- FOUND: commit 120038d (Task 2)
- All 41 tests pass (9 voice + 32 existing)

---
*Phase: 03-voice-pipeline*
*Completed: 2026-04-04*
