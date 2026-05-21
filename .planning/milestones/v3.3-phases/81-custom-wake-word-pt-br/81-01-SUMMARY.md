---
phase: 81-custom-wake-word-pt-br
plan: "01"
subsystem: desktop-py/voice
tags: [wake-word, testing, pep723, scaffold, wave0]
dependency_graph:
  requires: []
  provides: [WAKE-01-stub, WAKE-02-stub, WAKE-03-stub, WAKE-05-stub, train_wake_word_scaffold]
  affects: [apps/desktop-py/tests, apps/desktop-py/tools]
tech_stack:
  added: []
  patterns: [xfail-stub-wave0, pep723-inline-script, argparse-cli]
key_files:
  created:
    - apps/desktop-py/tests/test_train_wake_word.py
    - apps/desktop-py/tools/train_wake_word.py
  modified: []
decisions:
  - xfail removed from test_pep723_metadata and test_script_runs_with_help because scaffold exists in same plan wave
  - uv run used in test_script_runs_with_help (not sys.executable -m uv) for correct PEP 723 isolation
metrics:
  duration_minutes: 15
  completed_date: "2026-05-21"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 81 Plan 01: Wave 0 Scaffold — Wake Word Training Stubs

Wave 0 Nyquist scaffold: 9-test xfail suite + PEP 723 CLI skeleton that makes `uv run tools/train_wake_word.py --help` succeed.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create test_train_wake_word.py with xfail stubs | d7b70ad | apps/desktop-py/tests/test_train_wake_word.py |
| 2 | Create tools/train_wake_word.py PEP 723 skeleton | d349fe2 | apps/desktop-py/tools/train_wake_word.py, tests/test_train_wake_word.py |

## Verification Results

- `uv run pytest tests/test_train_wake_word.py -v`: 2 passed, 7 xfailed (0 errors, 0 unexpected failures)
- `python tools/train_wake_word.py --help`: exit 0, prints pt-BR description
- `python tools/train_wake_word.py --dry-run`: exit 0, prints [DRY-RUN] messages
- `grep "# /// script" apps/desktop-py/tools/train_wake_word.py`: matches line 1
- Full suite: 31 passed, 8 xfailed, 14 xpassed (3 pre-existing stt failures unrelated to this plan)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed xfail from test_pep723_metadata and test_script_runs_with_help**
- **Found during:** Task 2 verification
- **Issue:** After creating the script in Task 2, tests test_pep723_metadata and test_script_runs_with_help became XPASS(strict), causing pytest to report them as failures. The plan notes these xfails should be removed once the script exists.
- **Fix:** Removed @pytest.mark.xfail decorator from the two structural tests; they now pass as real tests verifying the scaffold.
- **Files modified:** apps/desktop-py/tests/test_train_wake_word.py
- **Commit:** d349fe2

### Deferred Items

Pre-existing failures in test_stt.py (3 tests: `test_init_whisper_model_loads_successfully`, `test_transcribe_audio_returns_text`, `test_vad_silence_threshold`) — `AttributeError: 'str' object has no attribute 'whisper_model_locked'` in stt.py line 264. These pre-date this plan and are out of scope.

## Known Stubs

| File | Stub | Reason |
|------|------|--------|
| apps/desktop-py/tools/train_wake_word.py | `_record_sample()` raises NotImplementedError | Implemented in Plan 81-02 |
| apps/desktop-py/tools/train_wake_word.py | `_run_recording_session()` raises NotImplementedError | Implemented in Plan 81-02 |
| apps/desktop-py/tools/train_wake_word.py | `_calibrate_baseline()` raises NotImplementedError | Implemented in Plan 81-02 |
| apps/desktop-py/tools/train_wake_word.py | `_download_negative_corpus()` raises NotImplementedError | Implemented in Plan 81-02 |
| apps/desktop-py/tools/train_wake_word.py | `_record_ambient_noise()` raises NotImplementedError | Implemented in Plan 81-02 |
| apps/desktop-py/tools/train_wake_word.py | `_generate_tts_negatives()` raises NotImplementedError | Implemented in Plan 81-02 |
| apps/desktop-py/tools/train_wake_word.py | `_train_verifier()` raises NotImplementedError | Implemented in Plan 81-02 |
| apps/desktop-py/tools/train_wake_word.py | `_calibrate_threshold()` raises NotImplementedError | Implemented in Plan 81-02 |
| apps/desktop-py/tools/train_wake_word.py | `main()` flow raises NotImplementedError (non-dry-run) | Implemented in Plan 81-02 |

These stubs are intentional — this is a Wave 0 Nyquist plan. Plan 81-02 implements all stubs.

## Self-Check: PASSED

- [x] apps/desktop-py/tests/test_train_wake_word.py exists
- [x] apps/desktop-py/tools/train_wake_word.py exists
- [x] Commits d7b70ad and d349fe2 exist in git log
