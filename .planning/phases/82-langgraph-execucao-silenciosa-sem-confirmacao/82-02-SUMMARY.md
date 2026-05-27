---
phase: 82-langgraph-execucao-silenciosa-sem-confirmacao
plan: "02"
subsystem: desktop-py/chat
tags: [silent-mode, agentic, config, tdd]
dependency_graph:
  requires: []
  provides: [agentic_step_progress config field, step event filter, task:auto-approved handler, menu item 6]
  affects: [apps/desktop-py/src/jarvis_desktop/config.py, apps/desktop-py/src/jarvis_desktop/chat.py]
tech_stack:
  added: []
  patterns: [TDD red-green, pydantic field extension, SSE event filter]
key_files:
  created:
    - apps/desktop-py/tests/test_chat_silent.py
  modified:
    - apps/desktop-py/src/jarvis_desktop/config.py
    - apps/desktop-py/src/jarvis_desktop/chat.py
    - apps/desktop-py/tests/test_config.py
decisions:
  - "agentic_step_progress field placed after debug_events in JarvisConfig, following Phase 78 pattern"
  - "Step filter added as early-return before task:plan if-chain — avoids fall-through side effects"
  - "task:auto-approved handler placed before else: block — explicit handler, not caught by debug fallback"
metrics:
  duration: "~6 minutes"
  completed: "2026-05-27"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 4
---

# Phase 82 Plan 02: Silent Mode for Agentic Step Events

**One-liner:** Added `agentic_step_progress` config flag (default False) that silences `task:step:start`/`task:step:end` terminal output while always showing errors and cancellations; `task:auto-approved` handler added as silent no-op.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Campo agentic_step_progress em config.py + testes | f73ab50 | config.py, test_config.py |
| 2 | Filtro de eventos step + handler task:auto-approved + menu item 6 | 7bd9aef | chat.py, test_chat_silent.py |

## Changes Made

### config.py
- Added `agentic_step_progress: bool = Field(default=False, ...)` after `debug_events` field (~line 40)
- Follows existing Phase 78 pattern for boolean config flags

### chat.py — `_handle_agentic_event` (~line 190)
- Early-return filter added after `task_id` parse:
  ```python
  if event_type in ("task:step:start", "task:step:end"):
      if not config.agentic_step_progress:
          return None  # silent suppression
  ```
- New `elif event_type == "task:auto-approved":` handler before `elif event_type == "action":` — silently returns None, prints `[debug]` when debug_events=True

### chat.py — `_show_config_menu` (~line 589)
- Item 6 added to menu display: `6. Progresso tarefas  [sim/nao]`
- `elif choice == "6":` handler toggles `config.agentic_step_progress`

## Tests Created

**test_chat_silent.py** (9 tests — all passing):
- `test_step_start_suppressed_when_flag_false` — PY-02: no print when flag=False
- `test_step_start_shown_when_flag_true` — PY-02b: prints description when flag=True
- `test_step_end_suppressed_when_flag_false` — PY-02c: no print when flag=False
- `test_step_end_shown_when_flag_true` — PY-02d: prints when flag=True
- `test_task_error_always_shown` — PY-03: error always visible
- `test_task_cancelled_always_shown` — PY-03b: cancel always visible
- `test_task_awaiting_failure_decision_always_shown` — PY-03c: failure decision always visible
- `test_auto_approved_silent_when_debug_false` — EVT-01: returns None, no print
- `test_auto_approved_debug_print_when_debug_true` — EVT-01b: prints [debug] when debug_events=True

**test_config.py** (3 new tests):
- `test_agentic_step_progress_default` — PY-01a
- `test_agentic_step_progress_from_config_json` — PY-01b
- `test_agentic_step_progress_forward_compat` — PY-01c

## Verification

```bash
cd apps/desktop-py && uv run pytest tests/test_config.py tests/test_chat_silent.py -q
```
Result: 23 passed (14 config + 9 chat_silent), 0 failures.

Full suite: 77 passed, 6 xfailed, 14 xpassed, 2 pre-existing failures (test_pc_control::test_open_folder_native and test_voice_modes::test_ptt_mode_hotkey — unrelated to this plan, confirmed pre-existing before task 1 changes).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all implementations wired to real config field and actual SSE event dispatch logic.

## Self-Check: PASSED

- config.py contains `agentic_step_progress`: FOUND
- chat.py contains step event filter: FOUND
- chat.py contains task:auto-approved handler: FOUND
- chat.py contains menu item 6 (Progresso tarefas): FOUND
- test_chat_silent.py exists: FOUND
- commit f73ab50 exists: FOUND
- commit 7bd9aef exists: FOUND
