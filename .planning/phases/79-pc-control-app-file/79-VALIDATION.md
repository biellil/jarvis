---
phase: 79
slug: pc-control-app-file
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-21
---

# Phase 79 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x + pytest-asyncio 0.23.x |
| **Config file** | `apps/desktop-py/tests/conftest.py` (existing shared fixtures) |
| **Quick run command** | `uv run pytest apps/desktop-py/tests/test_pc_control.py -x -v` |
| **Full suite command** | `uv run pytest apps/desktop-py/tests/ -v` |
| **Estimated runtime** | ~10 seconds (unit mocks only) |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest apps/desktop-py/tests/test_pc_control.py -x`
- **After every plan wave:** Run `uv run pytest apps/desktop-py/tests/ -v`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 79-01-01 | 01 | 0 | PCTRL-01..06 | unit stubs | `uv run pytest apps/desktop-py/tests/test_pc_control.py -x` | ❌ W0 | ⬜ pending |
| 79-01-02 | 01 | 1 | PCTRL-01 | unit | `uv run pytest apps/desktop-py/tests/test_pc_control.py::test_launch_app_via_which -x` | ❌ W0 | ⬜ pending |
| 79-01-03 | 01 | 1 | PCTRL-02 | unit | `uv run pytest apps/desktop-py/tests/test_pc_control.py::test_close_app_psutil -x` | ❌ W0 | ⬜ pending |
| 79-01-04 | 01 | 1 | PCTRL-03 | unit | `uv run pytest apps/desktop-py/tests/test_pc_control.py::test_open_folder_native -x` | ❌ W0 | ⬜ pending |
| 79-02-01 | 02 | 2 | PCTRL-04 | unit | `uv run pytest apps/desktop-py/tests/test_pc_control.py::test_read_file_truncation -x` | ❌ W0 | ⬜ pending |
| 79-02-02 | 02 | 2 | PCTRL-05 | unit | `uv run pytest apps/desktop-py/tests/test_pc_control.py::test_confirm_destructive_voice_input -x` | ❌ W0 | ⬜ pending |
| 79-02-03 | 02 | 2 | PCTRL-06 | unit | `uv run pytest apps/desktop-py/tests/test_pc_control.py::test_audit_log_format -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop-py/tests/test_pc_control.py` — stubs xfail para PCTRL-01..06 (6 funções mínimo)
- [ ] `apps/desktop-py/src/jarvis_desktop/pc_control.py` — skeleton do módulo com API pública (stubs que raise NotImplementedError)
- [ ] `apps/desktop-py/tests/conftest.py` — fixture `mock_psutil` (mocka psutil.process_iter e psutil.Popen)
- [ ] `apps/desktop-py/tests/conftest.py` — fixture `mock_subprocess_popen` (mocka subprocess.Popen)
- [ ] `apps/desktop-py/tests/conftest.py` — fixture `tmp_audit_log` (isola ~/.jarvis/audit.json em tmp dir)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| App abre visualmente no OS | PCTRL-01 | Requer desktop session real | Dizer "abre o Chrome" e confirmar que Chrome abre na tela |
| Explorador nativo abre na pasta certa | PCTRL-03 | Requer desktop session real | Dizer "abre a pasta Downloads" e confirmar que Explorer abre em ~/Downloads |
| Countdown de 10s no terminal visível | PCTRL-05 | Comportamento de UX | Tentar ação destrutiva e confirmar que countdown aparece e aborta após 10s sem resposta |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
