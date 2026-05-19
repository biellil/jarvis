---
phase: 72
slug: python-infrastructure-setup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-18
---

# Phase 72 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x |
| **Config file** | `apps/desktop-py/pyproject.toml` `[tool.pytest.ini_options]` |
| **Quick run command** | `cd apps/desktop-py && uv run pytest tests/ -q` |
| **Full suite command** | `cd apps/desktop-py && uv run pytest tests/ -v` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/desktop-py && uv run pytest tests/ -q`
- **After every plan wave:** Run `cd apps/desktop-py && uv run pytest tests/ -v`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 72-01-01 | 01 | 1 | PYSETUP-01 | smoke | `cd apps/desktop-py && uv sync && echo ok` | ❌ W0 | ⬜ pending |
| 72-01-02 | 01 | 1 | PYSETUP-01 | unit | `cd apps/desktop-py && uv run pytest tests/test_config.py -q` | ❌ W0 | ⬜ pending |
| 72-02-01 | 02 | 1 | PYSETUP-02 | manual | pnpm dev:desktop-py from root | N/A | ⬜ pending |
| 72-02-02 | 02 | 1 | PYSETUP-03 | unit | `grep -q GATEWAY_URL .env.example && echo ok` | ✅ | ⬜ pending |
| 72-03-01 | 03 | 2 | PYSETUP-04 | unit | `cd apps/desktop-py && uv run pytest tests/test_config_persistence.py -q` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop-py/tests/__init__.py` — test package init
- [ ] `apps/desktop-py/tests/test_config.py` — stubs for PYSETUP-01 (config loading/defaults)
- [ ] `apps/desktop-py/tests/test_config_persistence.py` — stubs for PYSETUP-04 (persist/load round-trip)
- [ ] `apps/desktop-py/tests/conftest.py` — shared fixtures (tmp_home for ~/.jarvis isolation)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `pnpm dev:desktop-py` runs from root | PYSETUP-02 | Requires pnpm workspace resolution and live Python process | Run from repo root; verify output shows "JARVIS Desktop Python" and gateway status |
| Gateway health check shows ✔ online | PYSETUP-02 | Requires gateway running | Start gateway (`pnpm dev:gateway`), then run `pnpm dev:desktop-py`; verify "Gateway: ✔ online" |
| Config survives restart | PYSETUP-04 | Requires file I/O across process boundaries | Run, observe defaults written; modify config.json; restart; verify modified values loaded |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
