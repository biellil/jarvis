---
phase: 80-pc-control-system-controls
plan: "03"
subsystem: pc-control
tags: [media-control, sse-routing, pynput, playerctl, pc-control]
dependency_graph:
  requires: [80-02]
  provides: [media_control, event-action-sse-routing]
  affects: [chat.py, pc_control.py]
tech_stack:
  added: []
  patterns: [playerctl-subprocess, pynput-media-keys, sse-args-normalization]
key_files:
  created: []
  modified:
    - apps/desktop-py/src/jarvis_desktop/pc_control.py
    - apps/desktop-py/src/jarvis_desktop/chat.py
    - apps/desktop-py/tests/test_pc_control.py
decisions:
  - pynput media keys for Windows/macOS vs playerctl subprocess for Linux (D-03)
  - args-to-params normalization in event:action branch (D-01)
  - silent success for volume/media commands (no echo to terminal)
metrics:
  duration_minutes: 10
  completed_date: "2026-05-21"
  tasks_completed: 2
  files_modified: 3
requirements:
  - PCTRL-08
  - PCTRL-07
---

# Phase 80 Plan 03: Media Control + SSE Action Routing Summary

**One-liner:** media_control via pynput (Windows/macOS) and playerctl (Linux); non-agentic event:action SSE path in chat.py normalizes args→params and dispatches without task_id.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement media_control in pc_control.py | 9dd2a3e | pc_control.py, test_pc_control.py |
| 2 | Wire event: action SSE routing in chat.py | 4d03942 | chat.py, test_pc_control.py |

## What Was Built

**Task 1 — media_control in pc_control.py:**
- `media_control(command)` public function: validates command against `{"play_pause", "next_track", "prev_track"}`, raises `ValueError` for unknown commands
- `_media_control_pynput(command)` for Windows/macOS: maps commands to `Key.media_play_pause`, `Key.media_next`, `Key.media_previous` via pynput Controller
- `_media_control_playerctl(command)` for Linux: maps to `playerctl play-pause`, `playerctl next`, `playerctl previous` via subprocess
- Added `elif action == "media_control"` in `execute_pc_action()` before the `else: raise ValueError` block
- Existing `_audit_log()` in `execute_pc_action()` finally block captures all media actions automatically

**Task 2 — event: action SSE routing in chat.py:**
- Added `elif event_type == "action":` branch in `_handle_agentic_event()` after the `task:pc_action` block
- Normalizes gateway's `"args"` key to `"params"` before calling `execute_pc_action()` (D-01)
- No `_post_task_resume()` call — non-agentic actions have no `task_id`
- Silent success for volume/media; prints error message only on failure

## Test Results

```
66 passed, 1 xfailed, 14 xpassed in 22.96s
```

New tests added:
- `test_media_control_play_pause` — Linux playerctl play-pause
- `test_media_control_next_track` — Linux playerctl next
- `test_media_control_prev_track` — Linux playerctl previous
- `test_media_control_invalid_command` — returns result=error with "Unknown media command"
- `test_media_control_windows` — Windows pynput press/release KEY_PLAY_PAUSE
- `test_handle_sse_action_event_volume` — args→params normalization for adjust_volume (replaces xfail)
- `test_handle_sse_action_event_media` — args→params normalization for media_control (new)

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

Files exist:
- `apps/desktop-py/src/jarvis_desktop/pc_control.py` — contains `def media_control`, `def _media_control_pynput`, `def _media_control_playerctl`, `elif action == "media_control"`
- `apps/desktop-py/src/jarvis_desktop/chat.py` — contains `elif event_type == "action":`, `params = data.get("args", {})` without `_post_task_resume` inside the branch
- `apps/desktop-py/tests/test_pc_control.py` — contains 7 new passing tests

Commits exist:
- `9dd2a3e` — feat(80-03): implement media_control in pc_control.py
- `4d03942` — feat(80-03): wire event: action SSE routing in chat.py
