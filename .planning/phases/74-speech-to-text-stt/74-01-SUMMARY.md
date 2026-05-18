---
phase: 74-speech-to-text-stt
plan: 01
subsystem: voice
tags: [faster-whisper, sounddevice, pynput, stt, tdd, config]

# Dependency graph
requires:
  - phase: 73-terminal-chat
    provides: JarvisConfig with api_key field, Phase 73 test infrastructure
provides:
  - STT dependency declarations in pyproject.toml (faster-whisper==1.2.1, sounddevice==0.5.5, pynput>=1.7.0)
  - JarvisConfig extended with ptt_key and silence_threshold_ms fields
  - Wave 0 xfail test stubs for stt module (PYSTT-01, PYSTT-02, PYSTT-03)
  - STT test fixtures (mock_whisper_model, mock_audio_array, mock_sounddevice)
affects: [74-02, 75-tts, 76-voice-modes]

# Tech tracking
tech-stack:
  added: [faster-whisper==1.2.1, sounddevice==0.5.5, pynput>=1.7.0]
  patterns: [Wave 0 xfail stubs before implementation, mock_whisper_model patches sys.modules for import isolation]

key-files:
  created:
    - apps/desktop-py/tests/test_stt.py
  modified:
    - apps/desktop-py/pyproject.toml
    - apps/desktop-py/src/jarvis_desktop/config.py
    - apps/desktop-py/tests/conftest.py
    - apps/desktop-py/tests/test_config.py
    - apps/desktop-py/uv.lock

key-decisions:
  - "pynput constraint relaxed to >=1.7.0 — pynput 2.x does not exist on PyPI (latest is 1.8.2); plan had >=2.0.0 which is unsatisfiable"
  - "Wave 0 stubs use xfail(strict=False) matching existing pattern from Phases 72-73"
  - "mock_whisper_model patches sys.modules directly for import isolation — stt.py not yet created"

patterns-established:
  - "Phase 74 xfail stubs: import inside test body to catch ImportError as xfail, not ERROR"
  - "STT fixtures patch faster_whisper and sounddevice at sys.modules level before stt.py is imported"

requirements-completed: [PYSTT-01, PYSTT-02, PYSTT-03]

# Metrics
duration: 12min
completed: 2026-05-18
---

# Phase 74 Plan 01: STT Foundation — Dependencies, Config, and Wave 0 Stubs Summary

**STT dependency declarations, JarvisConfig PTT/VAD fields, and 5 Wave 0 xfail stubs established for Plan 02 implementation.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-18T18:00:00Z
- **Completed:** 2026-05-18T18:12:00Z
- **Tasks:** 2 completed
- **Files modified:** 5

## Accomplishments

- Added faster-whisper==1.2.1, sounddevice==0.5.5, pynput>=1.7.0 to pyproject.toml
- Extended JarvisConfig with ptt_key (default "ctrl+shift+q") and silence_threshold_ms (default 500)
- Created test_stt.py with 5 xfail stubs covering PYSTT-01, PYSTT-02, PYSTT-03
- Added mock_whisper_model, mock_audio_array, mock_sounddevice fixtures to conftest.py
- Added test_load_config_ptt_key_default and test_load_config_ptt_key_from_file to test_config.py
- pytest tests/ -v: 9 passed, 5 xfailed — exit 0

## Task Commits

1. **Task 1: Add STT deps + extend JarvisConfig** - `1c7cf0a` (feat)
2. **Task 2: Wave 0 xfail stubs + conftest fixtures + config tests** - `56bef95` (test)
3. **uv.lock update** - `4d0cd7f` (chore)

## Files Created/Modified

- `apps/desktop-py/pyproject.toml` - Added faster-whisper==1.2.1, sounddevice==0.5.5, pynput>=1.7.0
- `apps/desktop-py/src/jarvis_desktop/config.py` - Added ptt_key and silence_threshold_ms fields to JarvisConfig
- `apps/desktop-py/tests/test_stt.py` - 5 xfail stubs for PYSTT-01/02/03
- `apps/desktop-py/tests/conftest.py` - mock_whisper_model, mock_audio_array, mock_sounddevice fixtures
- `apps/desktop-py/tests/test_config.py` - 2 ptt_key tests (default + from file)
- `apps/desktop-py/uv.lock` - Updated lockfile with STT deps

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] pynput>=2.0.0 constraint unsatisfiable**
- **Found during:** Task 1 (uv sync resolution)
- **Issue:** Plan specified `pynput>=2.0.0` but pynput 2.x does not exist on PyPI; latest version is 1.8.2
- **Fix:** Relaxed constraint to `pynput>=1.7.0` — covers all recent stable releases
- **Files modified:** `apps/desktop-py/pyproject.toml`
- **Commit:** `1c7cf0a`

## Self-Check: PASSED

- [x] `apps/desktop-py/tests/test_stt.py` exists
- [x] `apps/desktop-py/src/jarvis_desktop/config.py` has ptt_key field
- [x] `apps/desktop-py/pyproject.toml` has faster-whisper==1.2.1
- [x] `pytest tests/ -v` exits 0 with 5 xfailed, 9 passed
- [x] Commits 1c7cf0a, 56bef95, 4d0cd7f verified in git log
