---
phase: 76-voice-modes
plan: "01"
subsystem: voice
tags: [openwakeword, tts, python, pytest, desktop-py]

# Dependency graph
requires:
  - phase: 75-text-to-speech-tts
    provides: tts.py with _kokoro_speak/_elevenlabs_speak/_murf_speak and stop_tts()
provides:
  - openwakeword==0.6.0 in pyproject.toml with uv tflite-runtime override
  - wake_word_threshold: float field in JarvisConfig (default 0.7)
  - is_speaking() -> bool public function in tts.py
  - _is_playing: bool module flag tracking active TTS state
  - mock_openwakeword_model + mock_voice_queue fixtures in conftest.py
  - test_voice_modes.py with 8 tests + 1 xfail covering PYMODE-01/02/03 + D-06/07/08
affects: [76-02-voice-modes-implementation, 76-03-chat-integration]

# Tech tracking
tech-stack:
  added:
    - openwakeword==0.6.0 (wake word detection; onnxruntime backend on Windows/macOS)
    - scikit-learn==1.8.0 (transitive dep of openwakeword)
    - scipy==1.17.1 (transitive dep of openwakeword)
  patterns:
    - uv override-dependencies for cross-platform tflite-runtime constraint (Python 3.12 + Linux)
    - _is_playing bool flag with try/finally in all TTS playback paths for thread-safe state
    - Module-level public is_speaking() getter pattern for inter-module coordination

key-files:
  created:
    - apps/desktop-py/tests/conftest.py (extended — Phase 76 fixtures added)
  modified:
    - apps/desktop-py/pyproject.toml (openwakeword dep + uv override)
    - apps/desktop-py/src/jarvis_desktop/config.py (wake_word_threshold field)
    - apps/desktop-py/src/jarvis_desktop/tts.py (_is_playing flag + is_speaking())

key-decisions:
  - "uv override-dependencies for tflite-runtime: openwakeword 0.6.0 requires tflite on Linux but has no cp312 wheels; override restricts tflite to linux + python<3.12 so uv resolves on Windows dev"
  - "_is_playing bool flag (not _stop_event inversion): _stop_event starts in unknown state at module load; dedicated bool provides unambiguous active-playback signal"
  - "try/finally pattern in all speak paths: ensures _is_playing is always cleared on exit regardless of exception, preventing permanent D-06 block"

patterns-established:
  - "Inter-module coordination via public getter (is_speaking()) rather than exposing module state directly"
  - "uv override-dependencies for cross-platform dependency constraints in pyproject.toml"

requirements-completed:
  - PYMODE-01
  - PYMODE-02
  - PYMODE-03

# Metrics
duration: 5min
completed: "2026-05-18"
---

# Phase 76 Plan 01: Voice Modes Foundation Summary

**openwakeword dependency added, is_speaking() D-06 contract established in tts.py, JarvisConfig extended with wake_word_threshold, and full voice_modes test suite (8 passing + 1 xfail) wired to conftest fixtures**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-18T18:47:04Z
- **Completed:** 2026-05-18T18:52:10Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added openwakeword==0.6.0 to pyproject.toml with cross-platform uv override for tflite-runtime (no cp312 wheels on Linux)
- Added `wake_word_threshold: float = Field(default=0.7)` to JarvisConfig enabling configurable detection sensitivity
- Added `_is_playing: bool` flag and `is_speaking() -> bool` to tts.py with try/finally tracking in all three speak paths (_kokoro_speak, _elevenlabs_speak, _murf_speak)
- Added `mock_openwakeword_model` and `mock_voice_queue` fixtures to conftest.py; test_voice_modes.py already exists with 8 passing tests + 1 xfail

## Task Commits

1. **Task 1: openwakeword dep + wake_word_threshold + is_speaking()** - `2030855` (feat)
2. **Task 2: Phase 76 conftest fixtures** - `60aedff` (test)

## Files Created/Modified

- `apps/desktop-py/pyproject.toml` - Added openwakeword==0.6.0 dependency + [tool.uv] override for tflite-runtime
- `apps/desktop-py/src/jarvis_desktop/config.py` - Added wake_word_threshold: float field to JarvisConfig
- `apps/desktop-py/src/jarvis_desktop/tts.py` - Added _is_playing flag, is_speaking() function, and _is_playing tracking in all speak paths
- `apps/desktop-py/tests/conftest.py` - Added Phase 76 fixtures: mock_openwakeword_model, mock_voice_queue

## Decisions Made

- Used `_is_playing: bool` flag (not `not _stop_event.is_set()`) because `_stop_event` starts in unknown state at module load — dedicated bool provides unambiguous signal
- `try/finally` in all three speak paths ensures `_is_playing = False` always runs on exit (exception or normal return)
- uv `override-dependencies` constrains tflite-runtime to `sys_platform == 'linux' and python_version < '3.12'` — openwakeword uses onnxruntime on Windows, not tflite

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed uv cross-platform resolution for openwakeword==0.6.0**
- **Found during:** Task 1 (verification — `uv sync --extra dev`)
- **Issue:** openwakeword 0.6.0 has a Linux-only `tflite-runtime>=2.8.0` dependency; tflite-runtime has no cp312 wheels, causing `uv sync` to fail with "unsatisfiable" on Python 3.12
- **Fix:** Added `[tool.uv]` section with `override-dependencies` restricting tflite-runtime to `sys_platform == 'linux' and python_version < '3.12'`
- **Files modified:** apps/desktop-py/pyproject.toml
- **Verification:** `uv sync --extra dev` completed; `pytest tests/test_tts.py` exits 0 (7 passed)
- **Committed in:** `2030855` (Task 1 commit)

**2. [Rule 0 - Already Done] test_voice_modes.py already complete from parallel Plan 76-02**
- **Found during:** Task 2 (task execution)
- **Issue:** test_voice_modes.py already existed with 8 full passing tests (not xfail stubs) because Plan 76-02 ran in parallel and already implemented voice_modes.py
- **Fix:** No action needed — acceptance criteria satisfied (all required test functions present, pytest exits 0)
- **Scope:** Added conftest.py Phase 76 fixtures (mock_openwakeword_model, mock_voice_queue) as planned

---

**Total deviations:** 1 auto-fixed (tflite-runtime uv resolution), 1 already-done (parallel plan already implemented)
**Impact on plan:** All acceptance criteria met. uv fix required for package installation. test_voice_modes.py is ahead of plan (full tests vs stubs) — positive outcome.

## Issues Encountered

- tflite-runtime has no Python 3.12 wheels — uv strict cross-platform resolution blocked `uv sync`. Resolved with `[tool.uv] override-dependencies`.

## Next Phase Readiness

- Plan 76-02 (voice_modes.py state machine) already shipped — wake word loop, always-listening VAD, PTT loop all implemented
- Plan 76-03 (chat.py refactor to consume voice queue) is the remaining work; test stub exists at `test_chat_loop_consumes_voice_queue` (xfail)
- All 31 tests pass (8 voice_modes + existing suites); 1 xfail for Plan 03

## Self-Check: PASSED

All created/modified files verified:
- `apps/desktop-py/pyproject.toml` — FOUND (contains openwakeword==0.6.0)
- `apps/desktop-py/src/jarvis_desktop/config.py` — FOUND (contains wake_word_threshold)
- `apps/desktop-py/src/jarvis_desktop/tts.py` — FOUND (contains def is_speaking, _is_playing)
- `apps/desktop-py/tests/conftest.py` — FOUND (contains mock_openwakeword_model, mock_voice_queue)
- `apps/desktop-py/tests/test_voice_modes.py` — FOUND
- `.planning/phases/76-voice-modes/76-01-SUMMARY.md` — FOUND

All commits verified:
- `2030855` — FOUND (feat: Task 1)
- `60aedff` — FOUND (test: Task 2)

Test suite: 31 passed, 1 xfailed — all green.

---
*Phase: 76-voice-modes*
*Completed: 2026-05-18*
