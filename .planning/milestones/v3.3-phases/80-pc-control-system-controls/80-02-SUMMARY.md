---
phase: 80-pc-control-system-controls
plan: "02"
subsystem: pc-control
tags: [volume, mute, pycaw, pactl, osascript, system-controls]
dependency_graph:
  requires: [80-01]
  provides: [adjust_volume, toggle_mute, 6 OS backends]
  affects: [pc_control.execute_pc_action, test_pc_control.py]
tech_stack:
  added: []
  patterns: [_PLATFORM branching, lazy pycaw import, subprocess.run for pactl/osascript]
key_files:
  created: []
  modified:
    - apps/desktop-py/src/jarvis_desktop/pc_control.py
    - apps/desktop-py/tests/test_pc_control.py
decisions:
  - "D-02 honored: pycaw (Windows lazy import), pactl subprocess (Linux), osascript subprocess (macOS)"
  - "Tests use monkeypatch.setattr(pc_control, '_PLATFORM', 'linux'/'win32') for OS-agnostic coverage"
  - "sign = '+' if delta >= 0 else '' pattern for pactl positive delta formatting"
metrics:
  duration: 95s
  completed_date: "2026-05-21"
  tasks_completed: 1
  files_changed: 2
requirements:
  - PCTRL-07
---

# Phase 80 Plan 02: Volume Control — Summary

**One-liner:** adjust_volume and toggle_mute implemented with pycaw (Windows), pactl (Linux), and osascript (macOS) backends wired into execute_pc_action().

## What Was Built

Added `adjust_volume(delta)` and `toggle_mute()` public functions to `pc_control.py`, each with 3 OS-specific private backends:

- `_adjust_volume_windows(delta)` — pycaw IAudioEndpointVolume COM interface, lazy import
- `_adjust_volume_linux(delta)` — `pactl set-sink-volume @DEFAULT_SINK@ {+/-N}%` via subprocess
- `_adjust_volume_macos(delta)` — osascript reads current volume, computes new, sets via AppleScript
- `_toggle_mute_windows()` — pycaw GetMute/SetMute toggle
- `_toggle_mute_linux()` — `pactl set-sink-mute @DEFAULT_SINK@ toggle` via subprocess
- `_toggle_mute_macos()` — osascript reads muted state, flips it

Two new `elif` branches in `execute_pc_action()` dispatch to these functions. The existing `finally: _audit_log(...)` block already logs every call.

## Test Changes

Graduated 3 xfail stubs to passing tests with monkeypatched `_PLATFORM="linux"` asserting exact `pactl` subprocess calls. Added `test_adjust_volume_windows` using `mock_pycaw` fixture asserting `SetMasterVolumeLevelScalar` called.

**Final test count:** 15 passed, 4 xfailed (media_control + SSE stubs), 1 xpassed.

## Commits

| Task | Commit | Files |
|------|--------|-------|
| 1 — implement adjust_volume + toggle_mute | e6215b6 | pc_control.py, test_pc_control.py |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all volume/mute functions are fully implemented.

## Self-Check: PASSED

- `apps/desktop-py/src/jarvis_desktop/pc_control.py` — modified (e6215b6)
- `apps/desktop-py/tests/test_pc_control.py` — modified (e6215b6)
- Commit e6215b6 exists in git log
