---
phase: 84-fix-pc-control-python-native-fallback
plan: "03"
subsystem: pc-control
tags: [python, sse, client-id, uuid, confirmation, ack]

requires:
  - phase: 84-02
    provides: sse_listener.py daemon thread, JarvisConfig.client_id field, gateway ACK endpoint

provides:
  - __main__.py generates/loads persistent UUID in ~/.jarvis/client_id
  - __main__.py starts SSE listener before chat_loop (Step 7)
  - chat.py _post_action_ack() helper POSTs to /api/actions/ack
  - task:pc_action handler prompts for confirmation (5s timeout) for openFolder/openFile
  - viewContent returns denied ACK immediately (out of scope for Phase 84)

affects: [84-verification, desktop-py-chat, desktop-py-boot]

tech-stack:
  added: []
  patterns:
    - "_load_or_create_client_id() helper: persistent UUID in ~/.jarvis/client_id, read-or-create on every boot"
    - "confirm_destructive(prompt, timeout=5) reused from pc_control for SSE-dispatched actions"
    - "_post_action_ack() mirrors _post_task_resume() pattern but targets /api/actions/ack with requestId"

key-files:
  created: []
  modified:
    - apps/desktop-py/src/jarvis_desktop/__main__.py
    - apps/desktop-py/src/jarvis_desktop/chat.py

key-decisions:
  - "client_id file lives at ~/.jarvis/client_id (plain text UUID) — same dir as config.json, consistent with existing persistence pattern"
  - "confirm_destructive(timeout=5) reused for non-destructive openFolder/openFile — avoids duplicating timed-input logic"
  - "_post_task_resume() preserved intact — only task:pc_action branch switches to _post_action_ack; other agentic events unaffected"
  - "viewContent returns denied ACK immediately — cleanly declares out-of-scope without crashing the event loop"

requirements-completed:
  - REQ-84-02
  - REQ-84-04

duration: 15min
completed: 2026-05-28
---

# Phase 84 Plan 03: Python client boot wires client_id + SSE listener, task:pc_action uses confirmation + ACK POST

**Persistent UUID boot, SSE listener startup, and terminal confirmation prompt with 5s timeout before POSTing /api/actions/ack for PC control actions dispatched from gateway.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-28T14:40:00Z
- **Completed:** 2026-05-28T14:55:00Z
- **Tasks:** 2 code tasks + 1 human-verify checkpoint (not yet verified)
- **Files modified:** 2

## Accomplishments

- `__main__.py` now generates/loads a persistent UUID from `~/.jarvis/client_id` on every boot and passes it to `start_sse_listener()`
- `chat.py` has `_post_action_ack()` helper that POSTs `{requestId, status, content}` to `/api/actions/ack`
- `task:pc_action` handler prompts user for confirmation (5s timeout via `confirm_destructive`) for `openFolder`/`openFile` before executing and ACKing
- `viewContent` actions return `denied` ACK immediately without prompting (declared out-of-scope for Phase 84)
- All existing `test_chat.py` and `test_sse_listener.py` tests pass (7 passed, 1 xfailed, 3 xpassed)

## Task Commits

1. **Task 1: Wire client_id boot and SSE listener start in __main__.py** - `9f2ac9e` (feat)
2. **Task 2: Update task:pc_action handler in chat.py with confirmation and _post_action_ack** - `c05c11c` (feat)

## Files Created/Modified

- `apps/desktop-py/src/jarvis_desktop/__main__.py` - Added `_load_or_create_client_id()` helper, Step 6.5 (client_id), Step 7 (start_sse_listener), Step 8 (chat_loop renumbered)
- `apps/desktop-py/src/jarvis_desktop/chat.py` - Added `_post_action_ack()` helper; replaced `task:pc_action` branch with confirmation prompt + ACK POST logic

## Decisions Made

- `_load_or_create_client_id()` placed as a module-level function above `main()` so it can be unit-tested independently without importing the full boot sequence
- `confirm_destructive(prompt, timeout=5)` reused from `pc_control` — avoids duplicating timed-input logic for a conceptually identical prompt pattern
- `_post_task_resume()` intentionally preserved — it is still used by `task:awaiting-confirmation` and `task:awaiting-failure-decision` branches; only `task:pc_action` switches to `_post_action_ack`
- `viewContent` denied immediately without prompting — Phase 84 scope is `openFolder/openFile/closeFile` only; clean boundary prevents accidental execution

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing test failures (unrelated to Phase 84-03 changes):
- `test_config_persistence.py::test_config_missing_fields_get_defaults` — TTS provider default mismatch (present since before Phase 84)
- Gateway `path-validator.test.ts` and `action-dispatcher.test.ts` (2 failures) — present since Phase 84-01 test suite was committed

None of these are caused by Phase 84-03 changes. The `test_chat.py` and `test_sse_listener.py` suites (Phase 84 scope) are fully green.

## Known Stubs

None — all Phase 84-03 code paths are wired to real implementations.

## Next Phase Readiness

- Human verification checkpoint required (smoke test with gateway + Python client only, no Electron)
- After verification: Phase 84 complete — Python client handles PC control dispatch end-to-end without Electron
- Blocker: None — all code is in place pending human smoke test

---
*Phase: 84-fix-pc-control-python-native-fallback*
*Completed: 2026-05-28*

## Self-Check: PASSED

- `apps/desktop-py/src/jarvis_desktop/__main__.py` — exists and contains `_load_or_create_client_id`, `config.client_id = client_id`, `start_sse_listener(config, client_id)`
- `apps/desktop-py/src/jarvis_desktop/chat.py` — exists and contains `def _post_action_ack(`, `request_id = data.get("requestId", "")`, `confirm_destructive(prompt, timeout=5)`, `_post_action_ack(config, request_id, "confirmed"`, `def _post_task_resume(` (not removed)
- Commits `9f2ac9e` and `c05c11c` exist in git log
