---
phase: 84
slug: fix-pc-control-python-native-fallback
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-28
---

# Phase 84 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (Python) + vitest (Gateway) — existing |
| **Config file** | `apps/gateway/vitest.config.ts` + `apps/desktop-py/pyproject.toml` |
| **Quick run command** | `pnpm test:gateway --run` + `pytest tests/test_sse_listener.py -x` |
| **Full suite command** | `pnpm test` + `pytest --cov` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test:gateway --run tests/actions-ack.test.ts` + `pytest tests/test_sse_listener.py::test_sse_connection -x`
- **After every plan wave:** Run full `pnpm test` + `pytest --cov`
- **Before `/gsd:verify-work`:** Full suite must be green + manual smoke test
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 84-01-01 | 01 | 0 | REQ-84-01 | integration | `pytest tests/test_sse_listener.py::test_sse_connection_established -x` | ❌ W0 | ⬜ pending |
| 84-01-02 | 01 | 0 | REQ-84-02 | unit | `pytest tests/test_chat.py::test_build_request_headers_includes_client_id -x` | ❌ W0 | ⬜ pending |
| 84-01-03 | 01 | 0 | REQ-84-03 | integration | `pytest tests/test_action_dispatcher_python.py -x` | ❌ W0 | ⬜ pending |
| 84-01-04 | 01 | 0 | REQ-84-05 | integration | `pnpm test:gateway --run tests/actions-ack.test.ts` | ❌ W0 | ⬜ pending |
| 84-02-01 | 02 | 1 | REQ-84-01 | integration | `pytest tests/test_sse_listener.py -x` | ❌ W0 | ⬜ pending |
| 84-02-02 | 02 | 1 | REQ-84-02 | unit | `pytest tests/test_chat.py -x` | ❌ W0 | ⬜ pending |
| 84-03-01 | 03 | 2 | REQ-84-03 | integration | `pnpm test:gateway --run` | ❌ W0 | ⬜ pending |
| 84-03-02 | 03 | 2 | REQ-84-04 | unit | `pytest tests/test_pc_action_confirmation.py::test_confirm_destructive_timeout -x` | ✅ Exists | ⬜ pending |
| 84-04-01 | 04 | 3 | REQ-84-04 | integration | Manual smoke test | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_sse_listener.py` — stubs for SSE listener boot, reconnect, event dispatch
- [ ] `tests/test_action_dispatcher_python.py` — stubs for gateway Python SSE fallback dispatch
- [ ] `apps/gateway/src/routes/__tests__/actions-ack.test.ts` — stubs for POST /api/actions/ack
- [ ] `tests/test_chat.py::test_build_request_headers_includes_client_id` — stub for header injection

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| openFolder opens folder in Explorer | REQ-84-01 | Requires actual OS + Electron disconnected | 1. Stop Electron. 2. Start Python client. 3. Ask JARVIS "abre a pasta downloads". 4. Verify folder opens. |
| Terminal confirmation prompt shows | REQ-84-04 | Requires interactive terminal | 1. Python client running. 2. Ask JARVIS "abre a pasta documents". 3. Verify "Confirmar: abrir...? [s/n]" appears. 4. Type "s". 5. Verify folder opens. |
| Timeout auto-cancel | REQ-84-04 | Requires interactive terminal + timing | 1. Ask for openFolder. 2. Wait 5s without responding. 3. Verify "cancelado" message. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
