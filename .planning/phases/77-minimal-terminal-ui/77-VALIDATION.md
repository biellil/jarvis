---
phase: 77
slug: minimal-terminal-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-18
---

# Phase 77 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x + pytest-asyncio 0.23.x |
| **Config file** | `apps/desktop-py/pyproject.toml` (existing) |
| **Quick run command** | `cd apps/desktop-py && uv run pytest tests/test_ui.py -x -q` |
| **Full suite command** | `cd apps/desktop-py && uv run pytest tests/ -x -q` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/desktop-py && uv run pytest tests/test_ui.py -x -q`
- **After every plan wave:** Run `cd apps/desktop-py && uv run pytest tests/ -x -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 77-01-01 | 01 | 0 | PYUI-01 | unit | `uv run pytest tests/test_ui.py::test_init_ui -xq` | ❌ W0 | ⬜ pending |
| 77-01-02 | 01 | 1 | PYUI-01 | unit | `uv run pytest tests/test_ui.py::test_set_state -xq` | ❌ W0 | ⬜ pending |
| 77-01-03 | 01 | 1 | PYUI-01 | unit | `uv run pytest tests/test_ui.py::test_status_format -xq` | ❌ W0 | ⬜ pending |
| 77-02-01 | 02 | 2 | PYUI-02 | unit | `uv run pytest tests/test_ui.py::test_config_menu_parse -xq` | ❌ W0 | ⬜ pending |
| 77-02-02 | 02 | 2 | PYUI-02 | unit | `uv run pytest tests/test_ui.py::test_config_menu_apply -xq` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop-py/tests/test_ui.py` — stubs for PYUI-01 (init_ui, set_state, status format) and PYUI-02 (config menu parse, apply)
- [ ] Existing `apps/desktop-py/pyproject.toml` — pytest already configured, no new install needed

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Status line persists at bottom while SSE tokens stream | PYUI-01 | Requires live terminal with rich.Live running | Run `pnpm dev:desktop-py`, type a message, observe status line stays fixed at bottom while response streams |
| Config menu pauses voice capture | PYUI-02 | Requires microphone + voice mode active | Activate wake_word mode, type `/config`, verify no "listening" log while menu is open |
| Voice mode change takes effect immediately | PYUI-02 | Requires voice hardware | Type `/config`, select voice mode, change to always_listening, verify mode starts without restart |
| Whisper model reload doesn't crash mid-session | PYUI-02 | Live runtime behavior | Type `/config`, change Whisper model while session active, send a message via PTT, verify transcription works |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
