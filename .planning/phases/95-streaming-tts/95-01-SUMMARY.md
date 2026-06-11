---
phase: 95-streaming-tts
plan: "01"
subsystem: desktop-py/tts
tags: [nltk, punkt_tab, tts, streaming, wave-0, test-stubs]
dependency_graph:
  requires: []
  provides:
    - "punkt_tab PT-BR offline data at apps/desktop-py/assets/nltk_data/"
    - "xfail test stubs for SentenceChunker (Plans 02 make green)"
    - "xfail test stubs for TTS worker (Plan 03 makes green)"
  affects:
    - "apps/desktop-py/tests/test_sentence_chunker.py"
    - "apps/desktop-py/tests/test_tts_worker.py"
tech_stack:
  added:
    - "nltk>=3.8.2,<4 (pyproject.toml dependency)"
  patterns:
    - "Vendored NLTK data in assets/nltk_data — offline CI without internet"
    - "xfail stubs with strict=False for Nyquist rule compliance before implementation"
key_files:
  created:
    - "apps/desktop-py/assets/nltk_data/tokenizers/punkt_tab/portuguese/abbrev_types.txt"
    - "apps/desktop-py/assets/nltk_data/tokenizers/punkt_tab/portuguese/collocations.tab"
    - "apps/desktop-py/assets/nltk_data/tokenizers/punkt_tab/portuguese/ortho_context.tab"
    - "apps/desktop-py/assets/nltk_data/tokenizers/punkt_tab/portuguese/sent_starters.txt"
    - "apps/desktop-py/tests/test_sentence_chunker.py"
    - "apps/desktop-py/tests/test_tts_worker.py"
  modified:
    - "apps/desktop-py/pyproject.toml"
decisions:
  - "TTS worker test stubs placed in test_tts_worker.py (per PLAN.md) — VALIDATION.md references test_tts.py; discrepancy noted, test_tts_worker.py is discoverable and correct for Wave 0"
  - "nltk installed in venv via pip for verification (pyproject.toml pin ensures uv sync covers it)"
metrics:
  duration: "~5 minutes"
  completed: "2026-06-11T00:02:28Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 7
  files_modified: 1
---

# Phase 95 Plan 01: Wave 0 Foundation — punkt_tab Vendor + Test Stubs Summary

Wave 0 foundation: vendored punkt_tab PT-BR NLTK data into the repo, pinned nltk in pyproject.toml, and created 11 failing test stubs that define the acceptance contract for Plans 02-04.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Vendor punkt_tab PT-BR and pin nltk | 4e3436f | pyproject.toml + 4 assets |
| 2 | Create Wave 0 test stubs for sentence_chunker and TTS worker | 4985c4e | test_sentence_chunker.py, test_tts_worker.py |

## Verification Results

- `punkt_tab OK: PunktTokenizer` — offline load verified from vendored path
- All 11 tests XFAIL (exit code 0) — no ERROR, no unexpected PASS
- corpus list in `test_pt_br_corpus_50` has exactly 50 entries
- No `nltk.download()` calls in any test file

## Deviations from Plan

### Minor Discrepancy Noted

**1. [Informational] test_tts_worker.py vs test_tts.py location**
- **Found during:** Task 2
- **Issue:** PLAN.md specifies creating `tests/test_tts_worker.py`; VALIDATION.md references the same tests at `tests/test_tts.py`. The PLAN.md is the authoritative execution document.
- **Fix:** Created `tests/test_tts_worker.py` as the plan requires. Plan 03 will add TTS worker implementation and can decide the final test file location at that point.
- **Impact:** Minimal — pytest discovers tests by name regardless of file. All test IDs from VALIDATION.md exist in the collected suite.

## Known Stubs

All test stubs are intentional Wave 0 artifacts. The stub modules (`sentence_chunker.py`, TTS worker additions) do not exist yet — that is the purpose of Plans 02-03.

| File | Line | Stub | Resolved by |
|------|------|------|-------------|
| tests/test_sentence_chunker.py | all | SentenceChunker not implemented | Plan 02 |
| tests/test_tts_worker.py | all | TTS worker not implemented in tts.py | Plan 03 |

## Self-Check: PASSED

Files verified present:
- `apps/desktop-py/assets/nltk_data/tokenizers/punkt_tab/portuguese/ortho_context.tab` — FOUND (363124 bytes)
- `apps/desktop-py/tests/test_sentence_chunker.py` — FOUND
- `apps/desktop-py/tests/test_tts_worker.py` — FOUND
- `apps/desktop-py/pyproject.toml` contains `"nltk>=3.8.2,<4"` — CONFIRMED

Commits verified:
- `4e3436f` — FOUND
- `4985c4e` — FOUND
