---
phase: 02-memory
plan: 01
subsystem: database
tags: [sqlite, chromadb, sentence-transformers, memory, persistence]

requires:
  - phase: 01-foundation
    provides: Settings (BaseSettings), conftest.py fixture pattern, loguru already installed

provides:
  - MemoryStore class with full SQLite CRUD for conversations, messages, summaries, user_profile
  - Settings extended with sqlite_path and chroma_path fields
  - chromadb==1.5.5 and sentence-transformers>=3.0,<6 installed and declared in pyproject.toml
  - jarvis.memory package init

affects: [02-02, 02-03, 02-04, session.py, __main__.py]

tech-stack:
  added:
    - chromadb==1.5.5
    - sentence-transformers>=3.0,<6
  patterns:
    - "MemoryStore: all mutating methods wrap try/except + logger.warning, never raise (MEM-05)"
    - "SQLite upsert pattern: INSERT ... ON CONFLICT(key) DO UPDATE SET"
    - "In-memory SQLite for tests: MemoryStore(':memory:') in fixtures"
    - "datetime.now(timezone.utc).isoformat() for all timestamps (timezone-aware)"

key-files:
  created:
    - src/jarvis/memory/__init__.py
    - src/jarvis/memory/store.py
    - tests/test_memory_store.py
  modified:
    - src/jarvis/config.py
    - tests/conftest.py
    - pyproject.toml

key-decisions:
  - "TDD order: tests committed first (RED), then implementation (GREEN) — 2 commits per task"
  - "MemoryStore.__init__ receives db_path directly (not settings) — decoupled for testability"
  - "start_conversation returns Optional[int] — None on write error (graceful degradation, MEM-05)"
  - "close() wraps sqlite3 close in try/except — consistent error-safe interface"

patterns-established:
  - "Pattern: SQLite table DDL in CREATE_SQL module-level constant, executed via executescript on init"
  - "Pattern: upsert via INSERT ... ON CONFLICT(key) DO UPDATE SET for user_profile table"
  - "Pattern: all timestamps as timezone-aware ISO 8601 via datetime.now(timezone.utc).isoformat()"

requirements-completed: [MEM-01, MEM-05]

duration: 19min
completed: 2026-04-02
---

# Phase 02 Plan 01: Memory Foundation (SQLite + Config Extension) Summary

**SQLite MemoryStore with 4-table schema (conversations/messages/summaries/user_profile), Settings extended with memory paths, and chromadb+sentence-transformers added as dependencies**

## Performance

- **Duration:** 19 min
- **Started:** 2026-04-02T23:37:05Z
- **Completed:** 2026-04-02T23:56:11Z
- **Tasks:** 1 (TDD — 2 commits: RED + GREEN)
- **Files modified:** 6

## Accomplishments

- Created `src/jarvis/memory/store.py` with `MemoryStore` class: full CRUD for all 4 tables, all write errors caught and logged via loguru (MEM-05), never raised
- Extended `Settings` with `sqlite_path` (default: `data/jarvis.db`) and `chroma_path` (default: `data/chroma`) per D-05
- Added `chromadb==1.5.5` and `sentence-transformers>=3.0,<6` to `pyproject.toml` and installed
- 12 new tests pass; full suite (44 tests) green with zero regressions

## Task Commits

Each task was committed atomically (TDD = 2 commits):

1. **Task 1 (RED): add failing tests for MemoryStore SQLite layer** - `d302f73` (test)
2. **Task 1 (GREEN): implement MemoryStore SQLite layer and extend config** - `66f8c8a` (feat)

## Files Created/Modified

- `src/jarvis/memory/__init__.py` — memory package init (docstring only)
- `src/jarvis/memory/store.py` — MemoryStore class: DDL, start/end conversation, save_messages, save_summary, upsert_profile, get_profile_facts, close
- `src/jarvis/config.py` — added sqlite_path and chroma_path fields to Settings
- `tests/conftest.py` — added sqlite_path=":memory:" and chroma_path="/tmp/test_chroma" to mock_settings fixture
- `tests/test_memory_store.py` — 12 tests covering all tables, CRUD, upsert, and write-error handling
- `pyproject.toml` — added chromadb==1.5.5 and sentence-transformers>=3.0,<6 to dependencies

## Decisions Made

- `MemoryStore.__init__` takes `db_path: str` directly rather than reading from `settings` — this keeps the class decoupled and trivially testable with `":memory:"` in pytest fixtures
- `start_conversation` returns `Optional[int]` — returns `None` on write error (graceful degradation per MEM-05); callers in later plans must handle `None` return
- Used `executescript` for DDL to run all 4 CREATE TABLE statements in one call (SQLite requirement for multi-statement scripts)
- Pinned sentence-transformers as `>=3.0,<6` (not `==3.x`) because current PyPI latest is 5.3.0 and encode() API is backward compatible

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None — MemoryStore is fully implemented. All methods write real data to SQLite.

## Next Phase Readiness

- `MemoryStore` is ready for use by Plan 02-02 (ChromaDB vectors layer)
- `MemoryStore` is ready for use by Plan 02-03 (session wiring — `start_conversation`, `save_messages`, `save_summary`)
- `settings.sqlite_path` and `settings.chroma_path` ready for consumption by all memory modules
- `chromadb` and `sentence_transformers` importable — Plan 02-02 can proceed immediately

---
*Phase: 02-memory*
*Completed: 2026-04-02*
