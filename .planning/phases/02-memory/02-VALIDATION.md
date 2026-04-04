---
phase: 2
slug: memory
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2 + pytest-asyncio 1.3.0 |
| **Config file** | `pyproject.toml` — `[tool.pytest.ini_options]` com `asyncio_mode = "auto"` |
| **Quick run command** | `PYTHONPATH=src python3 -m pytest tests/ -x -q` |
| **Full suite command** | `PYTHONPATH=src python3 -m pytest tests/ -v` |
| **Estimated runtime** | ~15 seconds (excluindo primeiro download do modelo all-MiniLM-L6-v2 ~22 MB) |

---

## Sampling Rate

- **After every task commit:** Run `PYTHONPATH=src python3 -m pytest tests/ -x -q`
- **After every plan wave:** Run `PYTHONPATH=src python3 -m pytest tests/ -v`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-02-01 | 02-02 | 1 | MEM-03, MEM-05 | unit | `PYTHONPATH=src python3 -m pytest tests/test_memory_vectors.py -x -q` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02-02 | 1 | MEM-03 | unit | `PYTHONPATH=src python3 -m pytest tests/test_memory_vectors.py::test_add_and_query -x -q` | ❌ W0 | ⬜ pending |
| 02-03-01 | 02-03 | 1 | MEM-03 | unit | `PYTHONPATH=src python3 -m pytest tests/test_profile.py -x -q` | ❌ W0 | ⬜ pending |
| 02-03-02 | 02-03 | 1 | MEM-04 | unit | `PYTHONPATH=src python3 -m pytest tests/test_session_memory.py::test_memory_injection -x -q` | ❌ W0 | ⬜ pending |
| 02-03-03 | 02-03 | 2 | MEM-02 | integration | `PYTHONPATH=src python3 -m pytest tests/test_session_memory.py::test_save_calls_db -x -q` | ❌ W0 | ⬜ pending |
| 02-04-01 | 02-04 | 2 | MEM-01, MEM-02 | integration | `PYTHONPATH=src python3 -m pytest tests/test_session_memory.py -x -q` | ❌ W0 | ⬜ pending |
| 02-04-02 | 02-04 | 2 | MEM-04, MEM-05 | integration | `PYTHONPATH=src python3 -m pytest tests/test_session.py tests/test_memory_store.py -x -q` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_memory_vectors.py` — stubs para MEM-03, MEM-05 (ChromaDB collection, add_memory, query_memories, metadata)
- [ ] `tests/test_profile.py` — stubs para MEM-03 (is_explicit_profile_command, extract_profile_facts)
- [ ] `tests/test_session_memory.py` — stubs para MEM-02, MEM-04 (memory injection, incremental save, session end)

Arquivos existentes que devem continuar passando:
- `tests/test_memory_store.py` (12 tests) — baseline MEM-01/MEM-05
- `tests/test_session.py` — Phase 1; deve passar com ChatSession estendido

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| JARVIS recupera contexto de sessão passada em conversa real | MEM-05 | Requer 2 sessões reais com dados | 1) Iniciar JARVIS, dizer "Meu nome é X", Ctrl+C. 2) Reiniciar, perguntar "Como eu me chamo?". Verificar resposta. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
