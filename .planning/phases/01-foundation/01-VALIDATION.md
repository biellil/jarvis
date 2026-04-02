---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2 + pytest-asyncio 1.3.0 |
| **Config file** | `pyproject.toml` `[tool.pytest.ini_options]` — Wave 0 creates this |
| **Quick run command** | `pytest tests/ -x -q` |
| **Full suite command** | `pytest tests/ -v` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pytest tests/ -x -q`
- **After every plan wave:** Run `pytest tests/ -v`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | ARCH-03 | unit | `pytest tests/test_startup.py::test_version_pins -x` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 0 | ARCH-04 | unit | `pytest tests/test_startup.py::test_lm_studio_unreachable -x` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 0 | ARCH-04 | unit | `pytest tests/test_startup.py::test_missing_package -x` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 1 | LLM-01 | unit | `pytest tests/test_llm_factory.py -x` | ❌ W0 | ⬜ pending |
| 1-02-02 | 02 | 1 | LLM-01 | unit | `pytest tests/test_llm_factory.py::test_provider_switch -x` | ❌ W0 | ⬜ pending |
| 1-02-03 | 02 | 1 | LLM-02 | unit | `pytest tests/test_capabilities.py -x` | ❌ W0 | ⬜ pending |
| 1-02-04 | 02 | 1 | LLM-02 | unit | `pytest tests/test_capabilities.py::test_vision_detection -x` | ❌ W0 | ⬜ pending |
| 1-03-01 | 03 | 1 | ARCH-01 | unit | `pytest tests/test_platform.py -x` | ❌ W0 | ⬜ pending |
| 1-04-01 | 04 | 2 | CONV-01 | integration | `pytest tests/test_session.py -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `pyproject.toml` — project packaging, entry point, pytest config (`[tool.pytest.ini_options]`)
- [ ] `tests/__init__.py` — test package init
- [ ] `tests/conftest.py` — shared fixtures (mock LLM, env setup)
- [ ] `tests/test_llm_factory.py` — stubs for LLM-01
- [ ] `tests/test_capabilities.py` — stubs for LLM-02
- [ ] `tests/test_session.py` — stubs for CONV-01
- [ ] `tests/test_startup.py` — stubs for ARCH-03, ARCH-04
- [ ] `tests/test_platform.py` — stubs for ARCH-01
- [ ] Framework install: `pip install pytest==9.0.2 pytest-asyncio==1.3.0`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Rich-styled prompt renders correctly | CONV-01 | Visual output, not assertable | Run `python -m jarvis`, verify colored prompt appears |
| Streaming tokens appear in real-time | CONV-01 | Timing-dependent visual behavior | Ask JARVIS a question, verify tokens stream progressively |
| Banner shows correct LLM capabilities at startup | LLM-02 | Output format varies by model | Start JARVIS with LM Studio active, verify capability table |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
