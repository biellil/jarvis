---
phase: 04-pc-control
plan: "02"
subsystem: executor
tags: [executor, linux, psutil, subprocess, pathlib, confirmation, sqlite, tdd]

# Dependency graph
requires:
  - phase: 04-pc-control
    plan: "01"
    provides: ToolLogger class, ALL_TOOLS, tool payload pattern (D-02)
  - phase: 02-memory
    provides: MemoryStore SQLite patterns (MEM-05 error handling)

provides:
  - ActionExecutor class with async execute() dispatch method
  - 9 Linux handler functions (handle_list_files, handle_search_files, handle_move_file, handle_delete_file, handle_open_app, handle_close_app, handle_set_volume, handle_set_brightness, handle_list_processes)
  - Destructive action confirmation flow via inject confirm_callback or stdin prompt
  - src/jarvis/executor/ package

affects: [04-03-agent-wiring, future-ui-client]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ActionExecutor dispatch table: dict mapping action strings to handler functions"
    - "confirm_callback injectable for testing (AsyncMock-compatible); default uses asyncio.to_thread(input)"
    - "Linux handlers return {status, ...} dicts — errors caught and returned as {status: error, message: ...}"
    - "FileNotFoundError for pactl/brightnessctl returns informative install instructions"

key-files:
  created:
    - src/jarvis/executor/__init__.py
    - src/jarvis/executor/base.py
    - src/jarvis/executor/linux.py
    - tests/test_action_executor.py
    - tests/test_confirmation.py
  modified: []

key-decisions:
  - "confirm_callback is injectable — tests use AsyncMock(return_value=True/False); production uses asyncio.to_thread(input) for ARCH-02 compliance"
  - "Handlers return {status, ...} dicts; exceptions are caught in execute() and returned as {status: error, message: str(e)}"
  - "handle_open_app tries direct Popen first, falls back to xdg-open — covers both executables and .desktop-registered apps"
  - "handle_close_app uses substring match (app_lower in proc_name) for flexible process finding"

# Metrics
duration: 3min
completed: 2026-04-05
---

# Phase 4 Plan 02: ActionExecutor Summary

**ActionExecutor dispatches tool payloads to Linux handlers with confirmation flow, ToolLogger wiring, and graceful error handling for missing system tools**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-05T19:53:49Z
- **Completed:** 2026-04-05T19:56:23Z
- **Tasks:** 2
- **Files modified:** 5 (5 created, 0 modified)

## Accomplishments

- Created `src/jarvis/executor/` package with 3 files (__init__.py, base.py, linux.py)
- ActionExecutor.execute() dispatch table routing 9 actions to Linux handler functions
- Destructive confirmation: delete_file with `requires_confirmation=True` triggers confirm_callback before execution
- Non-destructive actions (move_file, close_app) skip confirmation entirely
- All 9 Linux handlers: pathlib/shutil for files, subprocess.Popen for apps, pactl/brightnessctl for system, psutil for processes
- FileNotFoundError for pactl/brightnessctl returns human-readable install instructions
- ToolLogger.log() called on every execute() with success/error/cancelled outcome
- 19 tests pass (13 in test_action_executor.py, 6 in test_confirmation.py)

## Task Commits

Each task committed atomically:

1. **Task 1 RED: Failing tests for ActionExecutor** - `63aa25f` (test)
2. **Task 1 GREEN: ActionExecutor + Linux handlers** - `7663b09` (feat)
3. **Task 2: Confirmation flow tests** - `3619340` (test)

## Files Created/Modified

- `src/jarvis/executor/__init__.py` - Package export: `from jarvis.executor.base import ActionExecutor`
- `src/jarvis/executor/base.py` - ActionExecutor class with dispatch table, confirmation flow, ToolLogger integration
- `src/jarvis/executor/linux.py` - 9 standalone handler functions for all Linux actions
- `tests/test_action_executor.py` - 13 tests for dispatch, file ops, app ops, system ops, error handling, logging
- `tests/test_confirmation.py` - 6 tests for confirmation flow (confirmed/denied/no-confirmation/callback-args/logging)

## Decisions Made

- confirm_callback injectable for testing — no stdin in unit tests (ARCH-02 compliant)
- handle_open_app uses direct Popen first, falls back to xdg-open for broader app support
- handle_close_app uses case-insensitive substring match for flexible process name lookup
- Handlers return structured dicts; ActionExecutor catches all exceptions and converts to error dicts

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None — all 9 handlers fully implemented with real Linux system calls.

## Next Phase Readiness

- Plan 03 (agent wiring) can now import ActionExecutor and call `await executor.execute(tool_name, payload, params)` after LLM tool calls
- confirm_callback can be wired to the session's output mechanism for natural language confirmation prompts
- ToolLogger is already instantiated in Plan 01 tests; Plan 03 will use the shared DB instance

## Self-Check: PASSED

- src/jarvis/executor/__init__.py — FOUND
- src/jarvis/executor/base.py — FOUND
- src/jarvis/executor/linux.py — FOUND
- tests/test_action_executor.py — FOUND
- tests/test_confirmation.py — FOUND
- Commit 63aa25f — FOUND
- Commit 7663b09 — FOUND
- Commit 3619340 — FOUND
- 19 tests pass

---
*Phase: 04-pc-control*
*Completed: 2026-04-05*
