---
phase: 04-pc-control
plan: "01"
subsystem: tools
tags: [langchain, tools, sqlite, psutil, pc-control, payload-pattern]

# Dependency graph
requires:
  - phase: 02-memory
    provides: MemoryStore SQLite patterns (MEM-05 error handling, _now() helper)
  - phase: 01-foundation
    provides: project structure, pyproject.toml, loguru logging

provides:
  - 9 @tool-decorated payload functions (list_files, search_files, move_file, delete_file, open_app, close_app, set_volume, set_brightness, list_processes)
  - ALL_TOOLS list for binding to LangChain LLM agent
  - ToolLogger class with tool_calls SQLite table for audit logging
  - src/jarvis/tools/ package with 3 modules + __init__.py

affects: [04-02-agent-wiring, 04-03-action-executor]

# Tech tracking
tech-stack:
  added: [psutil>=5.9 declared in pyproject.toml]
  patterns:
    - "@tool decorator pattern: functions return dict payloads, never execute system commands (D-02)"
    - "destructive tools include requires_confirmation=True in payload (D-03)"
    - "ToolLogger follows MemoryStore MEM-05 pattern: SQLite errors caught/logged, never re-raised"

key-files:
  created:
    - src/jarvis/tools/__init__.py
    - src/jarvis/tools/files.py
    - src/jarvis/tools/apps.py
    - src/jarvis/tools/system.py
    - tests/test_tools_pc_control.py
    - tests/test_tool_logger.py
  modified:
    - src/jarvis/memory/store.py
    - pyproject.toml

key-decisions:
  - "Tools return structured dict payloads (action + args), never execute subprocess/os calls — local ActionExecutor handles execution (D-02)"
  - "delete_file includes requires_confirmation=True; close_app does NOT — only irreversible/destructive actions require confirmation (D-03)"
  - "ToolLogger uses its own SQLite connection (can share same DB file as MemoryStore, initialized separately)"
  - "TOOL_CALLS_SQL constant follows same pattern as CREATE_SQL in MemoryStore"

patterns-established:
  - "Payload pattern: @tool functions are pure constructors returning {action, args} dicts"
  - "Destructive safety: requires_confirmation key in payload signals executor to prompt user before acting"
  - "ToolLogger.log() is fire-and-forget: never raises, logs warnings on SQLite errors"

requirements-completed: [TOOL-01, TOOL-02, TOOL-03, TOOL-05]

# Metrics
duration: 15min
completed: 2026-04-05
---

# Phase 4 Plan 01: PC Control Tools Summary

**9 @tool payload functions across files/apps/system modules plus ToolLogger audit class — tools return structured dicts for local execution, never call subprocess directly**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-05T19:33:00Z
- **Completed:** 2026-04-05T19:48:25Z
- **Tasks:** 2
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments

- Created `src/jarvis/tools/` package with 4 files (files.py, apps.py, system.py, __init__.py)
- 9 @tool functions using langchain_core.tools @tool decorator, all returning structured dict payloads
- ToolLogger class added to memory/store.py with tool_calls SQLite table (TOOL-05 audit requirement)
- ALL_TOOLS list exports all 9 tools for LangChain agent binding in Plan 02
- 24 unit tests pass (7 for ToolLogger, 17 for tools)

## Task Commits

Each task was committed atomically:

1. **Task 1: ToolLogger class + tool_calls SQLite table** - `784c906` (feat)
2. **Task 2: @tool payload functions — files, apps, system** - `fef3972` (feat)

## Files Created/Modified

- `src/jarvis/tools/__init__.py` - Package with ALL_TOOLS list (9 tools)
- `src/jarvis/tools/files.py` - list_files, search_files, move_file, delete_file
- `src/jarvis/tools/apps.py` - open_app, close_app
- `src/jarvis/tools/system.py` - set_volume, set_brightness, list_processes
- `src/jarvis/memory/store.py` - Added TOOL_CALLS_SQL constant + ToolLogger class + import json
- `pyproject.toml` - Added psutil>=5.9 to dependencies
- `tests/test_tool_logger.py` - 7 tests for ToolLogger (creates table, log success/cancelled/error, broken DB resilience, idempotent close, params JSON)
- `tests/test_tools_pc_control.py` - 17 tests covering all 9 tool payloads, ALL_TOOLS count/type, purity checks

## Decisions Made

- D-02 enforced strictly: no subprocess, shutil, psutil, or os.remove imports in tool modules — pure payload constructors
- D-03 confirmed: only `delete_file` gets `requires_confirmation: True`; `close_app` and `move_file` are reversible, no confirmation needed
- ToolLogger uses same MEM-05 error-handling pattern as MemoryStore: `except sqlite3.Error` caught, logged via loguru, never re-raised
- `TOOL_CALLS_SQL` placed before `CREATE_SQL` in store.py so the constant ordering mirrors declaration order

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None — all 9 tools return complete payloads. ALL_TOOLS is fully populated with real BaseTool instances.

## Next Phase Readiness

- Plan 02 can now bind `ALL_TOOLS` to the LangChain agent via `create_react_agent(llm, tools=ALL_TOOLS)`
- Plan 03 ActionExecutor can import `ALL_TOOLS` and map `action` keys to Linux subprocess calls
- ToolLogger is ready for Plan 02/03 to instantiate and pass to the agent loop

---
*Phase: 04-pc-control*
*Completed: 2026-04-05*
