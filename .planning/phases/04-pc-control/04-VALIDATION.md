---
phase: 4
slug: pc-control
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x + pytest-asyncio 0.23.x |
| **Config file** | `pyproject.toml` (existing) |
| **Quick run command** | `pytest tests/test_tools_pc_control.py -x -q` |
| **Full suite command** | `pytest tests/ -x -q` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pytest tests/test_tools_pc_control.py -x -q`
- **After every plan wave:** Run `pytest tests/ -x -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 0 | TOOL-01 | unit stub | `pytest tests/test_tools_pc_control.py -x -q` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | TOOL-01 | unit | `pytest tests/test_tools_pc_control.py::test_file_tools -x -q` | ✅ | ⬜ pending |
| 4-01-03 | 01 | 1 | TOOL-02 | unit | `pytest tests/test_tools_pc_control.py::test_app_tools -x -q` | ✅ | ⬜ pending |
| 4-01-04 | 01 | 1 | TOOL-03 | unit | `pytest tests/test_tools_pc_control.py::test_system_tools -x -q` | ✅ | ⬜ pending |
| 4-02-01 | 02 | 0 | TOOL-01 | unit stub | `pytest tests/test_action_executor.py -x -q` | ❌ W0 | ⬜ pending |
| 4-02-02 | 02 | 2 | TOOL-01 | integration | `pytest tests/test_action_executor.py::test_file_actions -x -q` | ✅ | ⬜ pending |
| 4-02-03 | 02 | 2 | TOOL-02 | integration | `pytest tests/test_action_executor.py::test_app_actions -x -q` | ✅ | ⬜ pending |
| 4-02-04 | 02 | 2 | TOOL-03 | integration | `pytest tests/test_action_executor.py::test_system_actions -x -q` | ✅ | ⬜ pending |
| 4-03-01 | 03 | 0 | TOOL-04 | unit stub | `pytest tests/test_confirmation.py -x -q` | ❌ W0 | ⬜ pending |
| 4-03-02 | 03 | 2 | TOOL-04 | unit | `pytest tests/test_confirmation.py::test_destructive_confirm -x -q` | ✅ | ⬜ pending |
| 4-04-01 | 04 | 0 | TOOL-05 | unit stub | `pytest tests/test_tool_logger.py -x -q` | ❌ W0 | ⬜ pending |
| 4-04-02 | 04 | 2 | TOOL-05 | unit | `pytest tests/test_tool_logger.py::test_log_entries -x -q` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_tools_pc_control.py` — stubs para TOOL-01, TOOL-02, TOOL-03
- [ ] `tests/test_action_executor.py` — stubs para ActionExecutor (TOOL-01..03)
- [ ] `tests/test_confirmation.py` — stubs para confirmação destrutiva (TOOL-04)
- [ ] `tests/test_tool_logger.py` — stubs para ToolLogger/SQLite (TOOL-05)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Volume/brightness adjust no desktop Linux real | TOOL-03 | pactl/brightnessctl não disponíveis no ambiente de teste | Executar `python -m jarvis` e pedir "aumenta o volume" em desktop Linux com PulseAudio |
| Abrir app por nome (xdg-open) | TOOL-02 | Requer display gráfico | Executar `python -m jarvis` e pedir "abre o firefox" |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
