---
phase: 75-text-to-speech-tts
plan: 01
subsystem: testing
tags: [tts, kokoro, elevenlabs, murf, pytest, xfail, wave0, python]

# Dependency graph
requires:
  - phase: 74-speech-to-text-stt
    provides: xfail Wave 0 pattern for STT tests; JarvisConfig ptt_key/silence_threshold_ms fields
provides:
  - TTS dependency declarations (kokoro>=0.9.4, soundfile, elevenlabs, murf) in pyproject.toml
  - JarvisConfig extended with kokoro_voice, local_only, elevenlabs_api_key, murf_api_key fields
  - Wave 0 xfail test stubs for 7 TTS behaviors (PYTTS-01..04)
  - test_tts_config_fields() green test asserting all Phase 75 config defaults
  - 4 TTS fixtures in conftest.py for Plan 02/03 use
affects: [75-02, 75-03, 76-voice-modes]

# Tech tracking
tech-stack:
  added: [kokoro>=0.9.4, soundfile, elevenlabs, murf (PyPI package)]
  patterns: [Wave 0 xfail stubs — define test contract before tts.py implementation, TTS fixtures mock kokoro module via sys.modules monkeypatching]

key-files:
  created:
    - apps/desktop-py/tests/test_tts.py
  modified:
    - apps/desktop-py/pyproject.toml
    - apps/desktop-py/src/jarvis_desktop/config.py
    - apps/desktop-py/tests/test_config.py
    - apps/desktop-py/tests/conftest.py
    - apps/desktop-py/uv.lock

key-decisions:
  - "murf PyPI package name is 'murf' not 'murf-python-sdk' — auto-fixed during Task 1 resolution"
  - "uv sync --extra dev required to install pytest in .venv (dev optional deps not synced by default)"
  - "Wave 0 xfail(strict=False) stubs cover all 7 PYTTS-01..04 behaviors; become passing in Plan 02/03"

patterns-established:
  - "TTS fixture pattern: mock kokoro module via sys.modules monkeypatch in conftest, not inline per test"
  - "mock_sounddevice_play fixture distinct from mock_sounddevice (play/wait/stop vs rec/wait)"

requirements-completed: [PYTTS-01, PYTTS-02, PYTTS-03, PYTTS-04]

# Metrics
duration: 25min
completed: 2026-05-18
---

# Phase 75 Plan 01: TTS Foundation Summary

**Wave 0 TTS test contract established: 7 xfail stubs for kokoro/ElevenLabs/Murf/local_only behaviors, JarvisConfig extended with 4 TTS fields, and pytest infrastructure ready for Plan 02 implementation**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-18T19:50:00Z
- **Completed:** 2026-05-18T20:15:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Extended JarvisConfig with kokoro_voice="pf_dora", local_only=False, elevenlabs_api_key="", murf_api_key="" (PYTTS-01/04 + D-05/D-08/D-10)
- Added kokoro>=0.9.4, soundfile, elevenlabs, murf to pyproject.toml dependencies
- Created test_tts.py with 7 xfail Wave 0 stubs covering all PYTTS-01..04 behaviors
- Added test_tts_config_fields() to test_config.py (green, non-xfail — config already implemented)
- Added 4 TTS fixtures to conftest.py (mock_kokoro_engine, mock_sounddevice_play, mock_elevenlabs_api, mock_murf_api)
- Full pytest suite: 15 passed, 7 xfailed, 4 xpassed

## Task Commits

Each task was committed atomically:

1. **Task 1: Add TTS dependencies to pyproject.toml and extend JarvisConfig** - `054ee04` (feat)
2. **Task 2: Write Wave 0 test stubs — test_tts.py, test_config.py additions, conftest fixtures** - `a5ee09b` (test)

## Files Created/Modified

- `apps/desktop-py/pyproject.toml` - Added kokoro>=0.9.4, soundfile, elevenlabs, murf deps
- `apps/desktop-py/src/jarvis_desktop/config.py` - Added 4 Phase 75 TTS config fields
- `apps/desktop-py/tests/test_tts.py` - Created: 7 xfail Wave 0 stubs for all TTS behaviors
- `apps/desktop-py/tests/test_config.py` - Appended test_tts_config_fields() (green)
- `apps/desktop-py/tests/conftest.py` - Appended 4 TTS fixtures
- `apps/desktop-py/uv.lock` - Updated with new TTS package resolutions

## Decisions Made

- `murf` is the correct PyPI package name (not `murf-python-sdk` which doesn't exist on PyPI) — auto-fixed during Task 1
- `uv sync --extra dev` needed to install pytest into the venv since dev optional deps aren't synced automatically by `uv run`
- Wave 0 xfail(strict=False) pattern mirrors exactly the STT Phase 74 approach — consistent test contract strategy

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed wrong PyPI package name: murf-python-sdk → murf**
- **Found during:** Task 2 verification (uv run pytest couldn't resolve dependencies)
- **Issue:** Plan specified `murf-python-sdk` as a PyPI dependency but that package doesn't exist on PyPI. The correct package is `murf` (murf-1.0.2).
- **Fix:** Changed `"murf-python-sdk"` to `"murf"` in pyproject.toml
- **Files modified:** apps/desktop-py/pyproject.toml
- **Verification:** `uv sync` resolved all packages successfully; 15 tests passed
- **Committed in:** a5ee09b (Task 2 commit — included with uv.lock update)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug — wrong package name)
**Impact on plan:** Fix was necessary for test suite to run. No scope creep.

## Issues Encountered

- `uv run pytest` used system Python (3.13) instead of the venv, causing `ModuleNotFoundError: No module named 'jarvis_desktop'`. Resolution: `uv sync --extra dev` to install pytest in venv, then run via `.venv/Scripts/pytest` directly.

## User Setup Required

None — no external service configuration required for this plan. TTS API keys (ElevenLabs, Murf) are needed for Plan 03 (cloud fallback) but are not required for Plan 02 (Kokoro offline).

## Next Phase Readiness

- Plan 02 (tts.py Kokoro implementation) can begin: test contract established, fixtures ready, config fields wired
- Plan 03 (cloud fallback + chat integration) follows Plan 02
- `mock_kokoro_engine` fixture mocks `sys.modules["kokoro"]` — Plan 02 must import kokoro as `from kokoro import Kokoro` for this to work
- `mock_elevenlabs_api` / `mock_murf_api` fixtures use `monkeypatch.setattr("jarvis_desktop.tts._elevenlabs_speak", ...)` — Plan 03 must expose these private functions by that name

## Self-Check: PASSED

- FOUND: apps/desktop-py/tests/test_tts.py
- FOUND: .planning/phases/75-text-to-speech-tts/75-01-SUMMARY.md
- FOUND: commit 054ee04 (Task 1)
- FOUND: commit a5ee09b (Task 2)
- FOUND: kokoro>=0.9.4 in pyproject.toml
- FOUND: kokoro_voice in config.py
- FOUND: local_only in config.py

---
*Phase: 75-text-to-speech-tts*
*Completed: 2026-05-18*
