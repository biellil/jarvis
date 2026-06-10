---
phase: 93-hybrid-memory-retrieval
plan: 01
subsystem: database
tags: [sqlite, fts5, hybrid-search, rrf, memory, chromadb, better-sqlite3]

# Dependency graph
requires: []
provides:
  - "sqlite exported from db.ts (raw Database instance accessible to other modules)"
  - "FTS5 virtual table typed_memories_fts with INSERT/UPDATE/DELETE triggers and backfill"
  - "HybridRetriever class with weighted RRF: semantic=0.6, keyword=0.25, recency=0.15, k=60"
  - "HMEM-01: retrieve() combining semantic + keyword + recency signals"
  - "HMEM-02: FTS5 virtual table stays in sync with typed_memories via triggers"
  - "HMEM-03: RRF scoring with configurable weights and topK"
affects: [93-02, 93-03, memory-context-builder, chat-session]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FTS5 setup via s.exec() in constructor — idempotent CREATE IF NOT EXISTS + backfill"
    - "Weighted RRF scoring: score = w_s/(k+rank_s) + w_k/(k+rank_k) + w_r/(k+rank_r)"
    - "FTS5 phrase sanitization: escape double-quotes, wrap in quotes; fallback to token search"
    - "Keyword-only recall: keyword-only candidates fetch content from typed_memories directly"

key-files:
  created:
    - apps/backend-ts/src/memory/hybrid-retriever.ts
    - apps/backend-ts/src/memory/__tests__/store.fts5.test.ts
    - apps/backend-ts/src/memory/__tests__/hybrid-retriever.test.ts
  modified:
    - apps/backend-ts/src/memory/db.ts
    - apps/backend-ts/src/memory/store.ts

key-decisions:
  - "sqlite exported from db.ts via export { sqlite } — minimal change, single source of truth"
  - "setupFts5() called in both constructor paths (test dbPath + production globalSqlite) — FTS5 always available"
  - "setupFts5() wrapped in try/catch — never throws (MEM-05 parity)"
  - "FTS5 backfill uses NOT IN subquery — idempotent on repeated constructor calls"
  - "HybridRetriever takes Database.Database and MemoryVectors by injection — testable without real ChromaDB"
  - "Test 2 uses distinct content terms to isolate keyword-only boost signal from recency noise"

patterns-established:
  - "FTS5 trigger pattern: typed_memories_fts_ai/au/ad via s.exec() in single string (multi-statement)"
  - "HybridRetriever injection pattern: sqlite + vectors constructor args, opts with defaults"
  - "RRF formula: w * (1 / (k + rank)), sum across all signals present"

requirements-completed: [HMEM-01, HMEM-02, HMEM-03]

# Metrics
duration: 6min
completed: 2026-06-10
---

# Phase 93 Plan 01: FTS5 Infrastructure + HybridRetriever Summary

**SQLite FTS5 virtual table with auto-sync triggers wired into MemoryStore constructor, and HybridRetriever combining semantic (60%), keyword FTS5 (25%), and recency (15%) via weighted RRF with k=60**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-10T17:25:53Z
- **Completed:** 2026-06-10T17:31:46Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 5

## Accomplishments
- db.ts now exports the raw sqlite Database instance, enabling other modules to use FTS5 without reconstructing a connection
- MemoryStore constructor creates typed_memories_fts FTS5 table + 3 triggers (AI/AU/AD) + backfills existing rows on every initialization path
- HybridRetriever.retrieve() implements full 3-signal RRF pipeline: parallel ChromaDB queries + FTS5 keyword search + recency from created_at timestamps

## Task Commits

Each task was committed atomically:

1. **Task 1: Export sqlite from db.ts + FTS5 setup in MemoryStore** - `7eaea90` (feat)
2. **Task 2: HybridRetriever class with weighted RRF** - `1c68d41` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `apps/backend-ts/src/memory/db.ts` - Added `export { sqlite }` to expose raw Database instance
- `apps/backend-ts/src/memory/store.ts` - Added `setupFts5()` method + calls in both constructor paths
- `apps/backend-ts/src/memory/hybrid-retriever.ts` - New: HybridRetriever class with full retrieve() pipeline
- `apps/backend-ts/src/memory/__tests__/store.fts5.test.ts` - New: 5 FTS5 unit tests (table, INSERT, UPDATE, DELETE, backfill)
- `apps/backend-ts/src/memory/__tests__/hybrid-retriever.test.ts` - New: 5 HybridRetriever unit tests (basic, RRF weights, recency, keyword-only, topK)

## Decisions Made
- Exported sqlite from db.ts with minimal change (`export { sqlite }`) — single-line addition, no restructuring
- setupFts5() uses a single multi-statement `s.exec()` call — SQLite exec() accepts semicolon-separated statements
- Test 2 was redesigned from the plan's original math (which had a flaw in recency tie-breaking with identical timestamps) to use distinct content terms that isolate keyword-only boost

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test 2 RRF assertion failure due to recency rank ambiguity**
- **Found during:** Task 2 (HybridRetriever GREEN phase)
- **Issue:** Plan's Test 2 used same `now` timestamp for both memories + a 3rd memory (mem-c), making recency ranks non-deterministic. The expected assertion `scoreB > scoreA` failed because mem-a picked up recency rank=1 while mem-b got rank=2.
- **Fix:** Redesigned test to use same fixed timestamp for both memories (equal recency) and distinct content terms where only mem-b matches the query keyword — making the keyword boost the sole differentiator.
- **Files modified:** apps/backend-ts/src/memory/__tests__/hybrid-retriever.test.ts
- **Verification:** All 5 hybrid-retriever tests pass green
- **Committed in:** 1c68d41 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug in test logic)
**Impact on plan:** The fix corrects a test that would have been flaky in production. The HybridRetriever implementation itself matches the plan exactly.

## Issues Encountered
None — implementation was straightforward. The only issue was a test assertion design flaw in the plan's math example, fixed inline.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - HybridRetriever.retrieve() is fully implemented and wired to real SQLite FTS5.

## Next Phase Readiness
- HybridRetriever is ready to be wired into the ContextBuilder (Plan 02)
- FTS5 table is live in MemoryStore for both test and production paths
- The `sqlite` export from db.ts enables any module to query FTS5 directly

---
*Phase: 93-hybrid-memory-retrieval*
*Completed: 2026-06-10*
