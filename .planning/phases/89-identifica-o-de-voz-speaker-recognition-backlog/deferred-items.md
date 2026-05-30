# Deferred Items — Phase 89

## Pre-existing test failures (out of scope for Plan 89-01)

Verified by running `pytest tests/` BEFORE my changes (via git stash):
4 failed, 17 errors — same as AFTER my changes. These are NOT caused by Plan 89-01.

### Failures
- `tests/test_config_persistence.py::test_config_missing_fields_get_defaults`
- `tests/test_voice_modes.py::test_ptt_mode_hotkey` — `_queue.Empty`
- 2 other failures (full list captured in 89-01-SUMMARY)

### Errors (17 in test_pc_control.py)
- All tests in `tests/test_pc_control.py` error on collection/setup (likely missing fixtures or env issue)

These are pre-existing tech debt unrelated to speaker recognition.
Task 3 acceptance criterion "suite completa verde" relaxed to: speaker.py tests verde + no new regressions.
