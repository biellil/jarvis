---
phase: 02-memory
plan: 02
subsystem: memory
tags: [chromadb, embeddings, profile-extraction, tdd, sentence-transformers]
dependency_graph:
  requires: [02-01]
  provides: [MemoryVectors, is_explicit_profile_command, extract_profile_facts]
  affects: [02-03]
tech_stack:
  added: []
  patterns: [ChromaDB embedded mode, SentenceTransformerEmbeddingFunction, async LLM extraction]
key_files:
  created:
    - src/jarvis/memory/vectors.py
    - src/jarvis/memory/profile.py
    - tests/test_memory_vectors.py
    - tests/test_profile.py
  modified:
    - src/jarvis/config.py
decisions:
  - "MemoryVectors created once in __init__ (PersistentClient not per-call) — avoids ChromaDB perf pitfall"
  - "query_memories clamps n_results to collection.count() to avoid ChromaDB errors on small collections"
  - "add_memory skips empty metadatas kwarg — ChromaDB rejects empty dicts"
  - "Code fence stripping handles multi-line ```json blocks from LLM responses"
metrics:
  duration_seconds: 266
  completed_date: "2026-04-04"
  tasks_completed: 2
  files_created: 4
  files_modified: 1
---

# Phase 02 Plan 02: ChromaDB Vector Memory and Profile Extraction Summary

**One-liner:** ChromaDB MemoryVectors with sentence-transformers all-MiniLM-L6-v2 embeddings and LLM-driven profile extraction with explicit trigger detection (PT/EN).

## What Was Built

Two standalone memory modules that are prerequisites for session integration (02-03):

1. **`src/jarvis/memory/vectors.py`** — `MemoryVectors` class wrapping ChromaDB in embedded mode. Uses `SentenceTransformerEmbeddingFunction` with `all-MiniLM-L6-v2` for local offline embeddings. Collection metadata stores the embedding model name for versioning (MEM-05). `add_memory` upserts documents; `query_memories` returns top-K semantically similar strings.

2. **`src/jarvis/memory/profile.py`** — `is_explicit_profile_command` detects Portuguese and English trigger phrases (accented and unaccented variants). `extract_profile_facts` calls an LLM asynchronously and parses the JSON response into a `dict[str, str]`, stripping markdown code fences if needed. All errors return `{}` and log warnings via loguru.

Also added `src/jarvis/memory/store.py` and `src/jarvis/memory/__init__.py` as 02-01 prerequisites not yet present in this worktree, and updated `src/jarvis/config.py` with `sqlite_path` and `chroma_path` fields.

## Tasks Completed

| Task | Name | Commits | Files |
|------|------|---------|-------|
| 1 | ChromaDB vector memory module | a711c98 (RED), b9b13c1 (GREEN) | vectors.py, test_memory_vectors.py |
| 2 | User profile extraction module | 25fd7e9 (RED), 59afde0 (GREEN) | profile.py, test_profile.py |

## Decisions Made

1. **MemoryVectors instantiated once** — `PersistentClient` created in `__init__`, not per-call. Avoids the ChromaDB performance pitfall of recreating the client on every operation.

2. **n_results clamping** — `query_memories` calls `collection.count()` and clamps `n_results` to the actual count. This prevents ChromaDB from raising an error when requesting more results than documents in the collection.

3. **Empty metadata skip** — `add_memory` only passes `metadatas` kwarg when the dict is non-empty. ChromaDB raises on `metadatas=[{}]`.

4. **Code fence stripping** — `extract_profile_facts` detects `` ``` `` prefix and strips the opening/closing fence lines before JSON parsing. LLMs often wrap JSON responses in `` ```json `` blocks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing prerequisite] Added 02-01 memory foundation files**
- **Found during:** Task 1 setup
- **Issue:** Worktree `agent-ad235f7e` was based on commit `0a69812` (01-04 docs), which predates the 02-01 implementation (MemoryStore, memory/__init__.py). These files were absent.
- **Fix:** Created `src/jarvis/memory/__init__.py`, `src/jarvis/memory/store.py` (full MemoryStore implementation), and updated `src/jarvis/config.py` with `sqlite_path`/`chroma_path` fields — matching the 02-01 output.
- **Files modified:** src/jarvis/memory/__init__.py, src/jarvis/memory/store.py, src/jarvis/config.py
- **Commit:** a711c98

## Known Stubs

None — all functionality is fully wired with real ChromaDB and real embeddings.

## Test Coverage

- `tests/test_memory_vectors.py` — 7 tests: init, metadata, add/query, empty collection, upsert idempotency, n_results clamping, metadata storage
- `tests/test_profile.py` — 12 tests: 8 explicit trigger cases (PT/EN), 4 extract_profile_facts cases (JSON, empty, code fence, LLM error)
- Full suite: 51 tests passing, no regressions

## Self-Check: PASSED

- [x] src/jarvis/memory/vectors.py exists
- [x] src/jarvis/memory/profile.py exists
- [x] tests/test_memory_vectors.py exists
- [x] tests/test_profile.py exists
- [x] Commits a711c98, b9b13c1, 25fd7e9, 59afde0 exist
- [x] All 19 new tests pass; 51 total tests pass
