---
phase: 6
slug: fastapi-core
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x + pytest-asyncio 0.23.x |
| **Config file** | `pyproject.toml` (existing) |
| **Quick run command** | `python -m pytest tests/ -x -q --timeout=30` |
| **Full suite command** | `python -m pytest tests/ -v --timeout=60` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `python -m pytest tests/ -x -q --timeout=30`
- **After every plan wave:** Run `python -m pytest tests/ -v --timeout=60`
- **Before `/gsd:verify-work`:** Full suite must be green (234 existing + new API tests)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 0 | API-01..04 | unit | `python -m pytest tests/api/ -x -q` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | API-01 | integration | `python -m pytest tests/api/test_chat.py -x -q` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 1 | API-02 | integration | `python -m pytest tests/api/test_stream.py -x -q` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 1 | API-03,04 | integration | `python -m pytest tests/api/test_health.py -x -q` | ❌ W0 | ⬜ pending |
| 06-04-01 | 04 | 2 | API-01..04 | regression | `python -m pytest tests/ -v --timeout=60` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/api/__init__.py` — package init
- [ ] `tests/api/test_chat.py` — stubs para API-01 (POST /chat)
- [ ] `tests/api/test_stream.py` — stubs para API-02 (GET /chat/stream SSE)
- [ ] `tests/api/test_health.py` — stubs para API-03 e API-04 (/health, /health/ready)
- [ ] `tests/api/conftest.py` — fixtures: TestClient, mock ChatSession

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SSE tokens chegam incrementalmente (não buffered) | API-02 | httpx TestClient não emula SSE real-time; requer cliente SSE real | `curl -N "http://localhost:8000/chat/stream?message=oi"` e observar tokens chegando progressivamente |
| `python -m jarvis` CLI funciona após instalar FastAPI | API-01..04 | Requer terminal interativo | Subir `python -m jarvis`, enviar mensagem, confirmar resposta normal |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
