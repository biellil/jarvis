---
phase: 73
slug: terminal-chat
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-18
---

# Phase 73 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x + pytest-asyncio 0.23.x |
| **Config file** | `apps/desktop-py/pyproject.toml` [tool.pytest.ini_options] |
| **Quick run command** | `cd apps/desktop-py && uv run pytest tests/test_chat.py -xvs` |
| **Full suite command** | `cd apps/desktop-py && uv run pytest tests/ -xvs` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/desktop-py && uv run pytest tests/test_chat.py -xvs`
- **After every plan wave:** Run `cd apps/desktop-py && uv run pytest tests/ -xvs`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| api_key config | TBD | 1 | PYCHAT-02 | unit | `pytest tests/test_config.py::test_api_key_env_load -xvs` | ❌ Wave 0 | ⬜ pending |
| api_key file override | TBD | 1 | PYCHAT-02 | unit | `pytest tests/test_config.py::test_api_key_file_override -xvs` | ❌ Wave 0 | ⬜ pending |
| SSE parse tokens | TBD | 1 | PYCHAT-01 | unit | `pytest tests/test_chat.py::test_parse_sse_tokens -xvs` | ❌ Wave 0 | ⬜ pending |
| SSE buffer incomplete | TBD | 1 | PYCHAT-01 | unit | `pytest tests/test_chat.py::test_buffer_incomplete_sse_line -xvs` | ❌ Wave 0 | ⬜ pending |
| Auth header conditional | TBD | 1 | PYCHAT-02 | unit | `pytest tests/test_chat.py::test_auth_header_conditional -xvs` | ❌ Wave 0 | ⬜ pending |
| Gateway offline startup | TBD | 1 | PYCHAT-02 | integration | `pytest tests/test_chat.py::test_gateway_offline_at_startup -xvs` | ❌ Wave 0 | ⬜ pending |
| Terminal scroll history | TBD | — | PYCHAT-03 | manual | (scroll up after multi-message session) | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop-py/tests/test_chat.py` — stubs for PYCHAT-01 SSE parsing, PYCHAT-02 auth and error tests
- [ ] `apps/desktop-py/tests/test_config.py` — extend with `test_api_key_*` tests (PYCHAT-02)
- [ ] `apps/desktop-py/tests/conftest.py` — mock gateway fixture for SSE responses (if needed)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Terminal scroll history | PYCHAT-03 | Natural terminal scrollback has no programmatic API | Start client, send 3+ messages, scroll up to confirm earlier messages visible |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
