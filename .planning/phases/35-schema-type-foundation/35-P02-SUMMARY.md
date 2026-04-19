---
phase: 35-schema-type-foundation
plan: P02
subsystem: database
tags: [drizzle-orm, sqlite, chromadb, vitest, typed-memories, consistency-check, memory-store]

# Dependency graph
requires:
  - 35-P01 (typed_memories table, migration 0003, schema.ts exports)
provides:
  - TypedMemoryEntry interface + saveTypedMemory, getTypedMemories, getAllTypedMemories on MemoryStore
  - getAllDocIds() + initTypedCollections() on MemoryVectors (3 typed ChromaDB collections)
  - validateMemoryConsistency() in consistency.ts — non-blocking startup consistency check
  - void validateMemoryConsistency() wired in index.ts server startup
affects:
  - 36-memory-writer (write path unblocked: saveTypedMemory API ready)
  - 37-context-builder (read path: getTypedMemories per type)

# Tech tracking
tech-stack:
  added:
    - and, desc (drizzle-orm) — used in getTypedMemories compound where clause
  patterns:
    - MEM-05 error suppression: all new store methods catch + warn, never throw
    - Typed ChromaDB collections are additive — existing jarvis_memories collection unchanged
    - Non-blocking startup check pattern: void fn().catch(() => {}) in app.listen callback
    - Type-import-only in consistency.ts to avoid circular dependency risk

key-files:
  created:
    - apps/backend-ts/src/memory/consistency.ts
    - apps/backend-ts/test/memory/store-typed.test.ts
    - apps/backend-ts/test/memory/consistency-check.test.ts
  modified:
    - apps/backend-ts/src/memory/store.ts
    - apps/backend-ts/src/memory/vectors.ts
    - apps/backend-ts/src/memory/manager.ts
    - apps/backend-ts/src/index.ts

key-decisions:
  - "MemoryManager.store and .vectors changed from private to readonly public — required for index.ts to pass them to validateMemoryConsistency"
  - "consistency.ts is a standalone file (not a manager method) to allow easy unit testing with mocked vectors"
  - "initTypedCollections() has its own Promise guard separate from init() — typed init can fail independently without corrupting base collection init"

patterns-established:
  - "Pattern 3: Typed ChromaDB collections via getOrCreateCollection — additive to existing single-collection setup"
  - "Pattern 4: validateMemoryConsistency as standalone async function with catch-all — errors never bubble to startup"

requirements-completed: [MTYPE-05, REL-02]

# Metrics
duration: 8min
completed: 2026-04-19
---

# Phase 35 Plan P02: Typed Store Methods + Consistency Check Summary

**saveTypedMemory/getTypedMemories/getAllTypedMemories on MemoryStore, getAllDocIds() across 3 ChromaDB typed collections on MemoryVectors, non-blocking validateMemoryConsistency() on startup — 9 new tests passing**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-19T14:35:22Z
- **Completed:** 2026-04-19T14:43:00Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 7

## Accomplishments

- Added `TypedMemoryEntry` interface to store.ts, exported for use by Phase 36 Memory Writer
- Implemented `saveTypedMemory()` — Drizzle insert into typedMemories with MEM-05 catch+warn
- Implemented `getTypedMemories(convId, type, limit?)` — compound WHERE with `and(eq, eq)` + `orderBy(desc)` for newest-first retrieval
- Implemented `getAllTypedMemories()` — full table scan used by consistency check
- Added `initTypedCollections()` to MemoryVectors — lazy-initializes `memories_semantic`, `memories_episodic`, `memories_procedural` ChromaDB collections; additive, preserves `jarvis_memories` collection
- Added `getAllDocIds()` to MemoryVectors — unions IDs from all 3 typed collections into a `Set<string>`, returns empty Set on error
- Created `consistency.ts` with `validateMemoryConsistency(store, vectors)` — logs WARN on mismatch, never throws (REL-02)
- Changed `store` and `vectors` on MemoryManager from `private readonly` to `readonly` (public) to allow index.ts access
- Wired `void validateMemoryConsistency(memory.store, memory.vectors).catch(() => {})` in app.listen callback — non-blocking
- Created 2 test files with 9 tests: store-typed (6 tests) and consistency-check (3 tests) — all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Write test stubs (RED phase)** — `05f0242` (test)
2. **Task 2: Implement typed store/vectors/consistency + startup wire (GREEN phase)** — `4ebdf3f` (feat)

## Files Created/Modified

- `apps/backend-ts/src/memory/store.ts` — Added `and, desc` imports; added `TypedMemoryEntry` interface; added `saveTypedMemory`, `getTypedMemories`, `getAllTypedMemories` methods
- `apps/backend-ts/src/memory/vectors.ts` — Added `typedCollections` Map + `typedInitPromise`; added `initTypedCollections()` and `getAllDocIds()` methods
- `apps/backend-ts/src/memory/consistency.ts` — New file: `validateMemoryConsistency(store, vectors)` standalone function
- `apps/backend-ts/src/memory/manager.ts` — `store` and `vectors` changed from `private readonly` to `readonly` (public)
- `apps/backend-ts/src/index.ts` — Import `validateMemoryConsistency`; added void call in app.listen callback
- `apps/backend-ts/test/memory/store-typed.test.ts` — 6 tests for typed store methods
- `apps/backend-ts/test/memory/consistency-check.test.ts` — 3 tests for consistency check with mocked ChromaDB

## Decisions Made

- MemoryManager.store and .vectors changed to public readonly: required for index.ts to call validateMemoryConsistency with the correct store/vectors instances. This is a controlled access change — MemoryManager still owns the lifecycle.
- consistency.ts as standalone file: makes it testable with a fake vectors object (no real ChromaDB needed). Imported with `type` imports to avoid circular dependencies.
- Typed collections use `embeddingFunction: null` (same as base collection) — embeddings will be supplied by the caller in Phase 36.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] MemoryManager.store and .vectors were private**
- **Found during:** Task 2 (Step 4 — modifying index.ts)
- **Issue:** Plan instructed accessing `memory.store` and `memory.vectors` in index.ts, but both were `private readonly` in MemoryManager, preventing access
- **Fix:** Changed `private readonly store` and `private readonly vectors` to `readonly store` and `readonly vectors` (public readonly) in manager.ts
- **Files modified:** `apps/backend-ts/src/memory/manager.ts`
- **Commit:** `4ebdf3f`

## Issues Encountered

- Pre-existing test failure in `src/memory/manager.test.ts` (requires live ChromaDB server for vector recall assertion) — verified pre-existing by stashing changes. Not caused by this plan. Out of scope.

## Known Stubs

None — all methods are fully wired. The typed ChromaDB collections (`memories_semantic`, `memories_episodic`, `memories_procedural`) are created lazily on first `getAllDocIds()` call. The collections will be empty until Phase 36 Memory Writer starts inserting.

## User Setup Required

None.

## Next Phase Readiness

- Phase 36 (Memory Writer) is fully unblocked:
  - `store.saveTypedMemory(entry)` — write path ready
  - `store.getTypedMemories(convId, type)` — read path ready
  - ChromaDB typed collections initialized on demand
- REL-02 consistency check runs on every startup — mismatches logged as WARN, no startup failure risk

## Self-Check: PASSED

- FOUND: apps/backend-ts/src/memory/store.ts (saveTypedMemory present)
- FOUND: apps/backend-ts/src/memory/vectors.ts (getAllDocIds present)
- FOUND: apps/backend-ts/src/memory/consistency.ts (validateMemoryConsistency present)
- FOUND: apps/backend-ts/src/index.ts (void validateMemoryConsistency call present)
- FOUND: apps/backend-ts/test/memory/store-typed.test.ts
- FOUND: apps/backend-ts/test/memory/consistency-check.test.ts
- FOUND: .planning/phases/35-schema-type-foundation/35-P02-SUMMARY.md
- Commit 05f0242: FOUND (RED test stubs)
- Commit 4ebdf3f: FOUND (GREEN implementation)

---
*Phase: 35-schema-type-foundation*
*Completed: 2026-04-19*
