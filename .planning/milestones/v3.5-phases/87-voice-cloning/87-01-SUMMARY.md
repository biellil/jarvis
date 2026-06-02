---
phase: 87-voice-cloning
plan: 01
subsystem: testing
tags: [pytest, tdd, voice-cloning, chatterbox, tts, soundfile]

# Dependency graph
requires:
  - phase: 86-chatterbox-tts
    provides: _chatterbox_engine, _start_chatterbox_warmup, _chatterbox_speak, mock_chatterbox_engine fixture

provides:
  - 4 Phase 87 test fixtures in conftest.py (voice_reference_wav, voice_reference_mp3, voice_reference_short_wav, voice_reference_wrong_ext)
  - 8 RED tests for VCLONE-01/02/03 in test_tts.py
  - Test contract defining expected behavior for chatterbox_audio_prompt_path field, generate() audio_prompt_path kwarg, and warmup audio validation

affects: [87-voice-cloning]

# Tech tracking
tech-stack:
  added: [soundfile (installed, was missing from venv)]
  patterns: [TDD RED phase — tests define contract before implementation]

key-files:
  created: []
  modified:
    - apps/desktop-py/tests/conftest.py
    - apps/desktop-py/tests/test_tts.py

key-decisions:
  - "3 of 8 tests pass accidentally because warmup succeeds without validation — expected per plan (valid_wav, valid_mp3, empty_path)"
  - "soundfile installed via pip install soundfile (was in pyproject.toml but not in venv)"

patterns-established:
  - "Voice cloning fixtures generate synthetic WAV via numpy zeros + soundfile.write — no real audio needed"
  - "Duration fixture naming: voice_reference_{descriptor} pattern for voice cloning tests"

requirements-completed:
  - VCLONE-01
  - VCLONE-02
  - VCLONE-03

# Metrics
duration: 15min
completed: 2026-05-29
---

# Phase 87 Plan 01: Voice Cloning RED Tests Summary

**8 TDD RED tests defining audio validation, config persistence, and generate() kwarg behavior for Chatterbox voice cloning via chatterbox_audio_prompt_path field**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-29T13:36:00Z
- **Completed:** 2026-05-29T13:42:01Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added 4 voice cloning test fixtures to conftest.py using soundfile+numpy synthetic audio generation
- Added 8 RED test functions covering all VCLONE-01/02/03 behaviors
- 4 tests actively fail RED (config field missing, generate() arg missing, audio validation missing)
- 3 tests pass accidentally (warmup succeeds for valid audio even without validation — correct for RED phase)
- 27 existing Phase 75/86 tests pass — zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add voice_reference_wav and voice_reference_mp3 fixtures to conftest.py** - `d02be90` (test)
2. **Task 2: Add 7 RED tests to test_tts.py for VCLONE-01/02/03** - `66c33b1` (test)

## Files Created/Modified

- `apps/desktop-py/tests/conftest.py` - Added Phase 87 section with 4 fixtures: voice_reference_wav (8s WAV), voice_reference_mp3 (.mp3 extension), voice_reference_short_wav (3s, fails duration check), voice_reference_wrong_ext (.ogg, fails extension check)
- `apps/desktop-py/tests/test_tts.py` - Added Phase 87 section with 8 test functions for VCLONE-01/02/03

## Decisions Made

- 3 tests pass accidentally because warmup currently ignores `chatterbox_audio_prompt_path` — this is expected RED phase behavior. These tests will become meaningful GREEN/RED tests once Plan 02 adds validation logic.
- `soundfile` was listed in pyproject.toml but not installed in the dev venv. Installed via `pip install soundfile` (Rule 3 - blocking fix).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing soundfile package**
- **Found during:** Task 1 (fixture verification)
- **Issue:** `import soundfile as sf` raised `ModuleNotFoundError` — package in pyproject.toml but not installed in venv
- **Fix:** Ran `pip install soundfile`
- **Files modified:** None (venv only)
- **Verification:** `python -c "import soundfile; print(soundfile.__version__)"` → `0.13.1`
- **Committed in:** d02be90 (Task 1 commit — no pyproject.toml change needed, already listed)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** soundfile install unblocked fixture creation. No scope creep.

## Issues Encountered

- 3 of 8 tests pass accidentally (valid_wav, valid_mp3, empty_path): these test _chatterbox_available=True after warmup, which the current code already achieves since warmup succeeds without audio path validation. This is documented behavior in the plan ("Fails RED (or passes accidentally — must verify behavior)"). These tests will assert RED once Plan 02 adds validation that validates the path before running warmup.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 87-02 can implement `chatterbox_audio_prompt_path` field in JarvisConfig, pass it to generate(), and add audio validation in warmup
- All 4 meaningful RED tests will turn GREEN after Plan 02 implementation
- 3 accidentally-passing tests will remain GREEN (correct behavior)
- conftest.py fixtures are production-ready for Plan 02 implementation tests

---
*Phase: 87-voice-cloning*
*Completed: 2026-05-29*
