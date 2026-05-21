---
phase: 80
slug: pc-control-system-controls
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-21
---

# Phase 80 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x |
| **Config file** | `apps/desktop-py/pyproject.toml` |
| **Quick run command** | `cd apps/desktop-py && uv run pytest tests/test_pc_control.py -x -q` |
| **Full suite command** | `cd apps/desktop-py && uv run pytest -x -q` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/desktop-py && uv run pytest tests/test_pc_control.py -x -q`
- **After every plan wave:** Run `cd apps/desktop-py && uv run pytest -x -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 80-01-01 | 01 | 0 | PCTRL-07, PCTRL-08 | unit stubs | `uv run pytest tests/test_pc_control.py -x -q` | ❌ W0 | ⬜ pending |
| 80-02-01 | 02 | 1 | PCTRL-07 | unit | `uv run pytest tests/test_pc_control.py::test_adjust_volume -x -q` | ❌ W0 | ⬜ pending |
| 80-02-02 | 02 | 1 | PCTRL-07 | unit | `uv run pytest tests/test_pc_control.py::test_toggle_mute -x -q` | ❌ W0 | ⬜ pending |
| 80-03-01 | 03 | 2 | PCTRL-08 | unit | `uv run pytest tests/test_pc_control.py::test_media_control -x -q` | ❌ W0 | ⬜ pending |
| 80-04-01 | 04 | 2 | PCTRL-07, PCTRL-08 | unit | `uv run pytest tests/test_chat.py -x -q` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop-py/tests/test_pc_control.py` — xfail stubs for adjust_volume, toggle_mute, media_control actions in execute_pc_action
- [ ] `apps/desktop-py/tests/test_pc_control.py` — conftest fixtures for mock pycaw/pactl/osascript/pynput/playerctl
- [ ] `apps/desktop-py/tests/test_chat.py` — xfail stub for `event: action` non-agentic routing

*Existing `tests/test_pc_control.py` and `tests/test_chat.py` infrastructure exists from Phase 79 — Wave 0 adds new stubs only.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Volume changes audibly on Windows | PCTRL-07 | Requires audio hardware + OS integration | Run JARVIS, say "aumenta o volume", verify system volume changes in Windows taskbar |
| Mute/unmute toggles correctly | PCTRL-07 | Requires audio hardware | Run JARVIS, say "muta", verify speaker icon shows muted |
| Media player responds to commands | PCTRL-08 | Requires active media player (Spotify, VLC, etc.) | Play music, say "pause a música", verify playback pauses |
| Audio device absent → error logged | PCTRL-07 | Requires simulated no-audio environment | Mock pycaw COMError, verify audit.json shows result=error |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
