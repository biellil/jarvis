# Deferred Items — Phase 95 streaming-tts

## Pre-existing Issues (not caused by Phase 95)

### test_import_error_disables_session flakiness
- **File:** apps/desktop-py/tests/test_tts.py::test_import_error_disables_session
- **Found during:** Phase 95-03 regression check
- **Status:** Pre-existing — confirmed via git stash (failure existed before Phase 95-03 changes)
- **Description:** Test asserts `_chatterbox_available is False` after warmup but gets None. Likely a timing/threading issue with the warmup daemon thread and monkeypatched sys.modules. Test passed in a later run (non-deterministic).
- **Action needed:** Investigate and fix in a future quick task or Phase 90 follow-up
