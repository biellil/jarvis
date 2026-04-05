---
phase: 02-memory
plan: 03
subsystem: memory
tags: [session, memory-injection, compression, profile-extraction, sqlite, chromadb, tdd]
dependency_graph:
  requires: [02-01, 02-02]
  provides: [ChatSession-with-memory, save-on-exit, memory-wired-main]
  affects: [02-04]
tech_stack:
  added: []
  patterns: [incremental-save, rolling-summary-compression, post-turn-profile-extraction, try-finally-save-on-exit]
key_files:
  created:
    - src/jarvis/memory/__init__.py
    - src/jarvis/memory/store.py
    - src/jarvis/memory/vectors.py
    - src/jarvis/memory/profile.py
    - tests/test_session_memory.py
  modified:
    - src/jarvis/core/session.py
    - src/jarvis/__main__.py
    - src/jarvis/config.py
decisions:
  - "messages_to_send built as separate list — history[0].content never mutated (Pitfall 1 avoided)"
  - "ChromaDB query_memories NOT called in send() per D-03 — only SQLite facts injected"
  - "Profile extraction runs post-streaming in Step 6 (Pitfall 4 avoided)"
  - "_conv_id initialized in __init__ not lazily (Pitfall 7 avoided)"
  - "Memory modules created in worktree as worktree predated 02-01/02-02 commits (Rule 2 auto-fix)"
metrics:
  duration_seconds: 316
  completed_date: "2026-04-04"
  tasks_completed: 2
  files_created: 5
  files_modified: 3
---

# Phase 02 Plan 03: ChatSession Memory Integration Summary

**One-liner:** Extended ChatSession with SQLite profile injection, rolling summary compression, post-turn profile extraction, and save-on-exit; wired MemoryStore + MemoryVectors into __main__.py with try/finally guarantee.

## What Was Built

Task 1 extended `src/jarvis/core/session.py` with a full 6-step memory pipeline:

1. **Compression check** — `_maybe_compress()` runs before adding new messages. Compresses history when token count exceeds 75% of context window (FALLBACK_CONTEXT_WINDOW=4096 when None). Saves summary to SQLite immediately.

2. **SQLite profile injection** — `get_profile_facts()` result augments the system prompt in a separate `messages_to_send` list. `self.history[0]` is never mutated (Pitfall 1 avoided).

3. **Incremental save** — User and assistant messages saved to SQLite immediately after each append (D-05, crash protection).

4. **Post-turn profile extraction** — `extract_profile_facts()` called after streaming completes (Step 6, Pitfall 4 avoided). Source is "explicit" or "implicit" depending on `is_explicit_profile_command()`.

5. **save()** — Calls `end_conversation()` and embeds all messages into ChromaDB for future semantic retrieval.

Task 2 wired everything into `__main__.py`:
- Data directories created before initialization (Pitfall 6 avoided)
- `MemoryStore` and `MemoryVectors` initialized from `settings.sqlite_path`/`settings.chroma_path`
- `ChatSession` receives `db`, `vectors`, and `ctx_window` from capabilities
- Conversation loop wrapped in `try/finally`: `session.save()` + `db.close()` + "Memorias salvas." on any exit path

## Tasks Completed

| Task | Name | Commits | Files |
|------|------|---------|-------|
| 1 | Extend ChatSession with memory pipeline | 22e3cda (RED), 8a7cbba (GREEN) | session.py, test_session_memory.py + memory prereqs |
| 2 | Wire memory into __main__.py | e8c3a40 | __main__.py |

## Decisions Made

1. **messages_to_send as separate list** — `self.history[0]` is never modified. Profile facts are injected into `augmented_system` which only appears in `messages_to_send[0]`, preserving the clean `SYSTEM_PROMPT` in history.

2. **No ChromaDB in send()** — `query_memories()` is explicitly not called per D-03. Only SQLite profile facts are injected into the context. This keeps injection simple and fast.

3. **Post-streaming profile extraction** — `extract_profile_facts()` runs as Step 6 after `print()` flushes the streaming line. This avoids the pitfall of triggering an LLM call mid-stream.

4. **_conv_id in __init__** — `self._conv_id = self._db.start_conversation() if self._db else None` is set at construction time. Both `_maybe_compress()` and `save()` depend on this attribute existing (Research Pitfall 7).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing prerequisites] Created 02-01/02-02 memory modules in worktree**
- **Found during:** Task 1 setup
- **Issue:** This worktree (`agent-a7b9166f`) is based on commit `0a69812` (01-04 docs), which predates 02-01 and 02-02 implementations. Memory modules (store.py, vectors.py, profile.py, memory/__init__.py) were absent.
- **Fix:** Created all prerequisite memory modules matching the 02-01/02-02 output specifications, plus updated config.py with sqlite_path/chroma_path fields.
- **Files modified:** src/jarvis/memory/__init__.py, src/jarvis/memory/store.py, src/jarvis/memory/vectors.py, src/jarvis/memory/profile.py, src/jarvis/config.py
- **Commit:** 22e3cda (included in RED commit)

## Known Stubs

None — all memory pipeline functionality is fully wired with real logic. Profile injection reads from real SQLite via MemoryStore. save() writes to real ChromaDB via MemoryVectors.

## Test Coverage

- `tests/test_session_memory.py` — 25 tests across 6 groups:
  - TestBackwardCompat (3): ChatSession(llm) still works without db/vectors
  - TestInitWithDb (2): start_conversation() called, _conv_id set correctly
  - TestMemoryInjection (5): profile injection, no query_memories, history[0] untouched
  - TestIncrementalSave (2): save_messages called for user + assistant
  - TestCompression (5): threshold detection, structure, summary save
  - TestProfileExtraction (5): explicit/implicit source, vectors.add_memory, skipped without db
  - TestSave (4): end_conversation, add_memory, graceful no-db, no-vectors
- Full suite: 58 tests passing, no regressions

## Self-Check: PASSED

- [x] src/jarvis/core/session.py exists with FALLBACK_CONTEXT_WINDOW, _maybe_compress, save
- [x] src/jarvis/__main__.py has MemoryStore, MemoryVectors, finally block
- [x] tests/test_session_memory.py exists (25 tests)
- [x] Commits 22e3cda, 8a7cbba, e8c3a40 exist
- [x] 58 total tests passing, 0 failures
- [x] query_memories NOT called in session.py (D-03 compliance)
- [x] history[0] never mutated (Pitfall 1 avoided)
