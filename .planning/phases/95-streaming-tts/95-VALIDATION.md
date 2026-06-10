---
phase: 95
slug: streaming-tts
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-10
---

# Phase 95 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.x (dev group) |
| **Config file** | `apps/desktop-py/pyproject.toml` `[tool.pytest.ini_options]` |
| **Quick run command** | `cd apps/desktop-py && python -m pytest tests/test_sentence_chunker.py tests/test_tts.py -x -q` |
| **Full suite command** | `cd apps/desktop-py && python -m pytest tests/ -x -q` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/desktop-py && python -m pytest tests/test_sentence_chunker.py tests/test_tts.py -x -q`
- **After every plan wave:** Run `cd apps/desktop-py && python -m pytest tests/ -x -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Phase gate (P-3):** `pytest tests/test_sentence_chunker.py::test_pt_br_corpus_50 -x` MUST pass GREEN before Phase 95 ships. If RED → deploy regex fallback (D-02).
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists |
|--------|----------|-----------|-------------------|-------------|
| STTS-01 | Tokens accumulated and flushed at sentence boundary | unit | `pytest tests/test_sentence_chunker.py::test_feed_emits_sentence -x` | ❌ W0 |
| STTS-01 | `_read_sse_stream` enqueues sentences instead of accumulating | unit | `pytest tests/test_chat.py::test_sse_stream_enqueues_sentences -x` | ❌ W0 |
| STTS-02 | Dr./Sr./Sra./etc./Exmo. do not produce 1-word chunks | unit | `pytest tests/test_sentence_chunker.py::test_pt_br_abbreviations -x` | ❌ W0 |
| STTS-02 | 50-sentence PT-BR validation corpus passes (P-3 gate) | unit | `pytest tests/test_sentence_chunker.py::test_pt_br_corpus_50 -x` | ❌ W0 |
| STTS-03 | Worker thread consumes queue without blocking SSE loop | unit | `pytest tests/test_tts.py::test_tts_worker_nonblocking -x` | ❌ W0 |
| STTS-03 | `is_speaking()` remains True during multi-sentence drain | unit | `pytest tests/test_tts.py::test_is_speaking_multisent_drain -x` | ❌ W0 |
| STTS-04 | TTFA log line emitted for first sentence | unit | `pytest tests/test_tts.py::test_ttfa_log_emitted -x` | ❌ W0 |
| STTS-04 | TTFA ≤300ms p95 for Kokoro path | integration/manual | Manual measurement on machine with Kokoro — automated proxy via mock timing | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_sentence_chunker.py` — unit tests for SentenceChunker (STTS-01, STTS-02, P-3 corpus gate)
- [ ] `tests/test_tts.py` — worker/drain/TTFA tests (STTS-03, STTS-04)
- [ ] `apps/desktop-py/assets/nltk_data/tokenizers/punkt_tab/portuguese/` — 4 vendor files (~355 KB)
- [ ] Add `nltk>=3.8.2,<4` to `[project.dependencies]` in `pyproject.toml`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TTFA ≤300ms p95 on real Kokoro | STTS-04 | Requires GPU + real Kokoro synthesis; CI proxy uses mock timing | Run real conversation turn, read TTFA loguru lines, confirm p95 ≤300ms over ≥20 turns |
| Audio not choppy on numbered lists / abbreviations | STTS-02 | Subjective audio quality | Speak a turn containing "Dr. Silva" and a numbered list; confirm no 1-word audio chunks |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
