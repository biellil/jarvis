---
phase: 79-pc-control-app-file
plan: 02
subsystem: pc-control
tags: [python, pytest, tdd, pc-control, psutil, subprocess, audit-log, threading, wave-1]

# Dependency graph
requires:
  - phase: 79-01
    provides: pc_control.py Wave 0 skeleton + xfail test stubs + conftest fixtures

provides:
  - "launch_app using shutil.which() + _ALIAS_MAP alias fallback; subprocess.Popen (no shell=True)"
  - "close_app using psutil.process_iter() + proc.kill(); AccessDenied → PermissionError"
  - "open_folder with OS-specific launcher (explorer.exe / open / xdg-open)"
  - "execute_pc_action dispatching open_app/close_app/open_folder + Wave 2 NotImplementedError stubs"
  - "_audit_log writing JSON Lines to ~/.jarvis/audit.json with threading.Lock"
  - "psutil>=6.0 dependency in pyproject.toml"

affects:
  - 79-03 (Wave 2 — read_file, confirm_destructive, _is_path_allowed)

# Tech tracking
tech-stack:
  added:
    - psutil>=6.0 (process iteration and termination — cross-platform)
  patterns:
    - "_ALIAS_MAP dict[str, dict[str, str]] keyed by sys.platform — O(1) lookup, no if/elif chains"
    - "shutil.which() primary + alias dict fallback — prefers PATH-installed app over hardcoded path"
    - "proc.info['name'].lower().rstrip('.exe') for Windows-safe case-insensitive process matching"
    - "finally block in execute_pc_action guarantees _audit_log even on exception"
    - "_audit_lock threading.Lock for thread-safe append-only audit.json writes"

key-files:
  created: []
  modified:
    - apps/desktop-py/src/jarvis_desktop/pc_control.py
    - apps/desktop-py/tests/test_pc_control.py
    - apps/desktop-py/pyproject.toml
    - apps/desktop-py/uv.lock

key-decisions:
  - "macOS launch_app uses 'open -a AppName' for GUI apps not resolvable via PATH"
  - "close_app strips .exe suffix from both target and proc_name for Windows-safe matching"
  - "wave-1 test graduation: removed xfail markers from PCTRL-01/02/03/06; added 2 new positive tests (not_found cases)"
  - "execute_pc_action stores Wave 2 actions (read_file/delete_file/move_file/rename_file) as NotImplementedError stubs"

# Metrics
duration: 12min
completed: 2026-05-21
---

# Phase 79 Plan 02: PC Control Wave 1 Implementation Summary

**Wave 1 of pc_control.py — launch_app (shutil.which + alias dict), close_app (psutil), open_folder (OS-specific), execute_pc_action + _audit_log (JSON Lines, threading.Lock) — PCTRL-01/02/03/06 validated**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-21T18:00:00Z
- **Completed:** 2026-05-21T18:12:00Z
- **Tasks:** 1 (TDD: RED → GREEN)
- **Files modified:** 4

## Accomplishments

- Added `psutil>=6.0` to `pyproject.toml`; uv synced psutil 7.2.2
- Implemented `_ALIAS_MAP` constant with per-OS aliases for win32/darwin/linux
- Implemented `_resolve_app_alias(app_name)` — O(1) dict lookup by sys.platform
- Implemented `launch_app(app_name)` — shutil.which() primary, alias dict fallback, subprocess.Popen (no shell=True); macOS uses `open -a "App Name"`
- Implemented `close_app(app_name)` — psutil.process_iter() with name match, proc.kill(), handles NoSuchProcess + AccessDenied
- Implemented `open_folder(path)` — expanduser().resolve(), OS-specific launcher (explorer.exe/open/xdg-open)
- Implemented `execute_pc_action()` — dispatches open_app/close_app/open_folder + Wave 2 stubs + finally → _audit_log
- Implemented `_audit_log()` — JSON Lines to ~/.jarvis/audit.json with _audit_lock threading.Lock
- Graduated Wave 1 xfail tests: 4 tests promoted to passing; added 2 additional positive tests (not_found cases)
- Full test suite: 51 passed, 5 xfailed (Wave 2 stubs), 14 xpassed — zero regressions

## Task Commits

1. **Task 1: Wave 1 implementation — psutil dep + app/folder operations** - `4ea87bf` (feat)

## Files Created/Modified

- `apps/desktop-py/src/jarvis_desktop/pc_control.py` — `_ALIAS_MAP`, `_PLATFORM`, `_resolve_app_alias`, `launch_app`, `close_app`, `open_folder`, `execute_pc_action`, `_audit_log` implemented; Wave 2 stubs unchanged
- `apps/desktop-py/tests/test_pc_control.py` — Removed xfail from PCTRL-01/02/03/06; added `test_launch_app_not_found`, `test_close_app_not_found`
- `apps/desktop-py/pyproject.toml` — Added `"psutil>=6.0"` to dependencies
- `apps/desktop-py/uv.lock` — psutil 7.2.2 locked

## Decisions Made

- macOS `launch_app` uses `open -a "App Name"` for non-PATH apps (e.g., "Google Chrome") — standard macOS pattern for GUI app launch
- `.rstrip('.exe')` on both target and proc_name for Windows-safe case-insensitive process matching — handles "notepad" matching "notepad.exe"
- `execute_pc_action` records Wave 2 actions (read_file/delete_file/move_file/rename_file) as `NotImplementedError("Wave 2")` to preserve audit trail for unimplemented actions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Added test_launch_app_not_found and test_close_app_not_found**
- **Found during:** Task 1 GREEN phase
- **Issue:** Plan's xfail tests only tested happy path. ValueError behavior for not-found cases was implemented but untested.
- **Fix:** Added 2 additional tests covering the not-found error paths
- **Files modified:** `apps/desktop-py/tests/test_pc_control.py`
- **Commit:** `4ea87bf`

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing error path tests)
**Impact on plan:** Improves coverage. No scope creep.

## Known Stubs

- `read_file()` — raises `NotImplementedError("Wave 2")` — Wave 2 (plan 79-03)
- `confirm_destructive()` — raises `NotImplementedError("Wave 2")` — Wave 2 (plan 79-03)
- `_is_path_allowed()` — raises `NotImplementedError("Wave 2")` — Wave 2 (plan 79-03)

These stubs are intentional. The plan's scope (79-02) is Wave 1 only. Wave 2 is delivered in 79-03.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None — psutil installs via `uv sync` with no system dependencies.

## Next Phase Readiness

- Wave 1 complete — PCTRL-01/02/03/06 validated
- Wave 2 (79-03) implements read_file, confirm_destructive, _is_path_allowed — 4 xfail tests will graduate
- All Wave 2 xfail tests remain correctly failing (strict=True)

---
*Phase: 79-pc-control-app-file*
*Completed: 2026-05-21*
