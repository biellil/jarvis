---
phase: 79-pc-control-app-file
plan: "03"
subsystem: pc-control
tags: [pc-control, file-ops, whitelist, confirmation, sse, tdd]
dependency_graph:
  requires: [79-02]
  provides: [PCTRL-04, PCTRL-05, task:pc_action SSE handler, init_pc_control wiring]
  affects: [chat.py, __main__.py, pc_control.py]
tech_stack:
  added: []
  patterns: [Path.resolve() whitelist traversal protection, queue drain before timeout polling, lazy import inside SSE branch]
key_files:
  created: []
  modified:
    - apps/desktop-py/src/jarvis_desktop/pc_control.py
    - apps/desktop-py/src/jarvis_desktop/chat.py
    - apps/desktop-py/src/jarvis_desktop/__main__.py
    - apps/desktop-py/tests/test_pc_control.py
decisions:
  - "Queue drain before confirmation timer: stale utterances removed before arming 10s window to prevent false-positive acceptance from prior speech"
  - "_get_voice_queue and _speak_prompt extracted as private helpers for monkeypatching in tests"
  - "task:pc_action uses lazy import of pc_control inside branch to avoid circular import at module level"
  - "set_state('executing_pc_action') silently ignored by ui.py (invalid state) — no crash, future extension point"
  - "Thread-based test for confirm_destructive: 'sim' put after 0.2s delay to simulate post-drain voice arrival"
metrics:
  duration: "14 minutes"
  completed_date: "2026-05-21"
  tasks_completed: 2
  files_changed: 4
---

# Phase 79 Plan 03: PC Control Wave 2 — read_file, confirm_destructive, SSE wiring Summary

**One-liner:** read_file with Path.resolve() whitelist + 50 KB truncation, confirm_destructive with stale-queue drain and 100ms polling, wired to task:pc_action SSE handler in chat.py and init_pc_control as Step 6 in __main__.py.

## What Was Built

### Task 1: read_file + confirm_destructive + _is_path_allowed (TDD)

Replaced three Wave 2 stubs in `pc_control.py`:

**`_is_path_allowed(user_path, whitelist_dirs)`**
- Uses `Path(user_path).expanduser().resolve()` to detect `../` traversal and symlink escapes
- Returns True only if resolved path is equal to or under any whitelisted directory via `is_relative_to()`

**`read_file(path, config)`**
- Validates path via `_is_path_allowed` — raises `PermissionError` if outside whitelist
- Reads raw bytes, tries UTF-8 then Latin-1, raises `ValueError` for binary-only files
- Truncates at 50 KB (`_READ_TRUNCATE_BYTES = 51200`) with pt-BR warning: `[arquivo cortado — tamanho total: N KB]`

**`confirm_destructive(prompt, timeout=10)`**
- Drains stale queue entries with `get_nowait()` loop before arming timer
- Speaks prompt via `_speak_prompt(msg)` helper (monkeypatchable)
- Polls queue at 0.1s intervals; accepts "sim", "yes", "confirmar" (case-insensitive)
- Returns `True` on match, `False` on timeout

**`_get_voice_queue()` / `_speak_prompt(msg)`** — private helpers extracted for test monkeypatching.

**`execute_pc_action`** — updated to dispatch `read_file` and destructive actions (`delete_file`, `move_file`, `rename_file`) through `confirm_destructive`.

**Test updates:** Removed `xfail` markers from 4 Wave 2 tests. Updated `test_confirm_destructive_voice_input` to put "sim" via background thread after 0.2s (simulates post-drain voice arrival correctly).

### Task 2: Wire pc_control into chat.py and __main__.py

**`chat.py` — `_handle_agentic_event`:**
- Added `elif event_type == "task:pc_action":` branch
- Lazy imports `pc_control` inside branch (avoids circular import)
- Calls `execute_pc_action(action, params, config)`
- Routes result to `_post_task_resume` with `"confirm"`, `"cancel"`, or `"error"` kind

**`__main__.py`:**
- Added Step 6: `init_pc_control(config)` before `chat_loop`
- Updated docstring: Step 7 is now chat loop (was Step 6)
- Step 7 comment updated to reflect new numbering

## Test Results

```
55 passed, 1 xfailed, 14 xpassed — full suite green
```

11/11 test_pc_control.py tests pass (all Wave 1 + Wave 2 graduated).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Test for confirm_destructive voice input needed threading approach**

- **Found during:** Task 1 GREEN phase
- **Issue:** Original xfail test put "sim" in queue before calling `confirm_destructive`. The drain phase removed it before polling started, causing the test to always return False.
- **Fix:** Updated `test_confirm_destructive_voice_input` to use a background thread that puts "sim" after 0.2s delay — correctly simulates voice arriving after the drain completes.
- **Files modified:** `apps/desktop-py/tests/test_pc_control.py`
- **Commit:** 1456ab7

## Self-Check: PASSED

- pc_control.py: FOUND
- chat.py: FOUND
- __main__.py: FOUND
- Commit 1456ab7: FOUND
- Commit 5217171: FOUND
