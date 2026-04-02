---
phase: 02
slug: memory
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x |
| **Config file** | pyproject.toml (`[tool.pytest.ini_options]`) |
| **Quick run command** | `python3 -m pytest tests/ -x -q` |
| **Full suite command** | `python3 -m pytest tests/ -q` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `python3 -m pytest tests/ -x -q`
- **After every plan wave:** Run `python3 -m pytest tests/ -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 0 | MEM-01 | unit | `python3 -m pytest tests/test_memory.py -x -q` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | MEM-01 | unit | `python3 -m pytest tests/test_memory.py::test_save_conversation -x -q` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 0 | MEM-02 | unit | `python3 -m pytest tests/test_memory.py::test_retrieve_memories -x -q` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | MEM-02 | integration | `python3 -m pytest tests/test_memory.py::test_inject_memories -x -q` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 0 | MEM-03 | unit | `python3 -m pytest tests/test_profile.py -x -q` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 1 | MEM-03 | unit | `python3 -m pytest tests/test_profile.py::test_implicit_extraction -x -q` | ❌ W0 | ⬜ pending |
| 02-04-01 | 04 | 1 | MEM-04 | unit | `python3 -m pytest tests/test_session.py::test_rolling_summary -x -q` | ⬜ W1 | ⬜ pending |
| 02-04-02 | 04 | 1 | MEM-05 | unit | `python3 -m pytest tests/test_memory.py::test_persistence_fallback -x -q` | ❌ W0 | ⬜ pending |
| 02-05-01 | 05 | 2 | CONV-06 | integration | `python3 -m pytest tests/test_session.py -x -q` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_memory.py` — stubs for MEM-01, MEM-02, MEM-05 (SQLite + ChromaDB)
- [ ] `tests/test_profile.py` — stubs for MEM-03 (user profile)
- [ ] `pyproject.toml` — add `chromadb>=1.5,<2`, `sentence-transformers>=3.0,<6`
- [ ] `pip install -e . --break-system-packages` — install new deps

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Memory injection quality in real conversation | MEM-02 | Requires live LLM + subjective relevance assessment | Run `python3 -m jarvis`, have a conversation, close, reopen, ask about previous topic — verify JARVIS references it naturally |
| Implicit profile extraction accuracy | MEM-03 | LLM call with variable output | State a preference ("prefiro código sem comentários"), restart session, ask for code — verify preference applied |
| Rolling summary preserves context | MEM-04 | Requires forcing context limit | Set low `CONTEXT_WINDOW=1000` in .env, have long conversation, verify JARVIS still references early turns after compression |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
