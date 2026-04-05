---
phase: 02-memory
plan: 05
subsystem: memory
tags: [chromadb, retrieval, session, memory-injection]
dependency_graph:
  requires: [02-02, 02-03]
  provides: [MEM-02-read-path]
  affects: [src/jarvis/core/session.py]
tech_stack:
  added: []
  patterns: [graceful-degradation, semantic-retrieval-injection]
key_files:
  created: []
  modified:
    - src/jarvis/core/session.py
    - tests/test_session_memory.py
decisions:
  - "User explicitly overrode D-03: ChromaDB retrieval injection is now active in send()"
  - "query_memories call placed OUTSIDE the if self._db: block — vectors and db are independent"
  - "Graceful degradation: retrieval errors log warning and session continues (MEM-05)"
metrics:
  duration_seconds: 255
  completed_date: "2026-04-04"
  tasks_completed: 1
  files_modified: 2
requirements: [MEM-02]
---

# Phase 2 Plan 05: Wire ChromaDB query_memories into send() Summary

One-liner: ChromaDB semantic retrieval injected into ChatSession.send() Step 2 via query_memories(user_input), closing MEM-02 read path gap.

## What Was Built

Connected the ChromaDB read path into the live conversation pipeline. Every call to `send()` now:

1. Calls `self._vectors.query_memories(user_input)` to retrieve semantically similar past memories
2. Injects the top-K results as a "Memorias relevantes de sessoes anteriores" block into the augmented system prompt, alongside SQLite profile facts
3. Degrades gracefully if ChromaDB is unavailable — the session continues and logs a warning

## Changes Made

### src/jarvis/core/session.py

- Updated Step 2 comment: removed D-03 deferral note, updated to reflect active retrieval
- Added ChromaDB retrieval block after the SQLite profile facts injection:
  ```python
  if self._vectors:
      try:
          memories = self._vectors.query_memories(user_input)
          if memories:
              memories_block = "\n".join(f"- {m}" for m in memories)
              augmented_system += f"\n\nMemorias relevantes de sessoes anteriores:\n{memories_block}"
      except Exception as e:
          logger.warning(f"Memory retrieval failed: {e}")
  ```
- Updated module docstring to note ChromaDB retrieval is now active

### tests/test_session_memory.py

- Updated `make_mock_vectors()` to accept optional `memories` parameter and mock `query_memories`
- Replaced `test_no_query_memories_called` with 5 new tests:
  1. `test_query_memories_called_with_user_input` — asserts call with exact user input
  2. `test_memories_injected_into_system_prompt` — asserts injection into SystemMessage content
  3. `test_empty_memories_not_injected` — asserts no "Memorias relevantes" section when empty
  4. `test_no_vectors_still_works` — backward compat when vectors=None
  5. `test_query_memories_error_graceful` — session continues despite RuntimeError from ChromaDB

## Verification Results

```
PYTHONPATH=src pytest tests/ -x -q
62 passed in 10.43s
```

All 62 tests pass (30 in test_session_memory.py, 32 across other test modules).

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None — query_memories is fully wired. The read path is live.

## Self-Check: PASSED

- `src/jarvis/core/session.py` — exists, contains `query_memories` call on line 100
- `tests/test_session_memory.py` — exists, contains all 5 new test methods
- Commit `ef40158` — exists (verified via `git log --oneline -1`)
- 62 tests pass — verified
