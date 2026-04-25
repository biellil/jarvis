---
phase: 36-memory-writer
plan: P02
subsystem: memory
tags: [chromadb, sqlite, langchain, typed-memory, vectors, tdd]

# Dependency graph
requires:
  - phase: 36-P01
    provides: "Extraction type from MemoryExtractor (extractionSchema Zod union)"
  - phase: 35-schema-type-foundation
    provides: "typed_memories SQLite schema, MemoryStore.saveTypedMemory(), MemoryVectors.initTypedCollections()"

provides:
  - "MemoryVectors.addTypedMemory(docId, text, type, metadata?) — routes to correct ChromaDB typed collection"
  - "MemoryVectors.queryMemoriesByType(userText, type, topK) — top-k semantic search on typed collections"
  - "MemoryManager.llm?: BaseChatModel optional field"
  - "MemoryManager.saveTypedMemory(convId, extraction) — dual-write SQLite + ChromaDB in single try/catch"

affects:
  - "36-P03 (ChatSession wiring — will call saveTypedMemory)"
  - "37 (Context Builder — will call queryMemoriesByType)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED/GREEN per task — test file committed before implementation"
    - "MEM-05 error parity: addTypedMemory and queryMemoriesByType both catch/warn/never-throw"
    - "Typed collection routing: type string maps to Map<string, Collection> key"

key-files:
  created:
    - apps/backend-ts/test/memory/vectors-typed.test.ts
    - apps/backend-ts/test/memory/manager-typed.test.ts
  modified:
    - apps/backend-ts/src/memory/vectors.ts
    - apps/backend-ts/src/memory/manager.ts

key-decisions:
  - "sourceId left as undefined (null in SQLite) in saveTypedMemory — Phase 36 defers FK population per STATE.md decision"
  - "initTypedCollections() remains private — tests override it by replacing the method on the instance directly"
  - "MemoryManager mock uses class-based vi.mock factories (not mockImplementation arrow) to satisfy 'new' keyword"

patterns-established:
  - "Mock class constructors in vitest: export class MockFoo { method = vi.fn() } inside vi.mock factory"
  - "Override private method for testing: vectors['initTypedCollections'] = vi.fn().mockImplementation(...)"

requirements-completed: [MTYPE-01, MTYPE-02, MTYPE-03, MTYPE-04, MEMW-02]

# Metrics
duration: 5min
completed: 2026-04-25
---

# Phase 36 Plan P02: Memory Writer — Vectors + Manager Typed Methods Summary

**MemoryVectors gains addTypedMemory + queryMemoriesByType routed to typed ChromaDB collections; MemoryManager gains optional llm field + saveTypedMemory dual-writing to SQLite and ChromaDB in a single try/catch**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-25T20:38:41Z
- **Completed:** 2026-04-25T20:43:27Z
- **Tasks:** 2
- **Files modified:** 4 (2 src + 2 test)

## Accomplishments

- `MemoryVectors.addTypedMemory()` routes documents to the correct typed ChromaDB collection (semantic/episodic/procedural) via `typedCollections` Map
- `MemoryVectors.queryMemoriesByType()` queries a single typed collection returning `QueryResult[]` with `similarity = 1 - distance`, handles empty collections via `count()` check
- `MemoryManager.saveTypedMemory()` dual-writes to SQLite via `store.saveTypedMemory()` and ChromaDB via `vectors.addTypedMemory()` in one try/catch — never throws
- All 4 methods follow MEM-05 error parity: errors are caught, logged with `console.warn`, and swallowed
- 10 tests passing (4 vectors-typed + 6 manager-typed), full suite 183/184 (1 pre-existing failure unrelated to this plan)

## Task Commits

Each task was committed atomically with TDD RED then GREEN:

1. **Task 1 RED: vectors-typed tests** - `67bcf6e` (test)
2. **Task 1 GREEN: addTypedMemory + queryMemoriesByType** - `3197253` (feat)
3. **Task 2 RED: manager-typed tests** - `dec8241` (test)
4. **Task 2 GREEN: llm field + saveTypedMemory** - `bd434a8` (feat)

_TDD pattern: 2 tasks × 2 commits each = 4 atomic commits_

## Files Created/Modified

- `apps/backend-ts/src/memory/vectors.ts` — Added `addTypedMemory()` and `queryMemoriesByType()` after `getAllDocIds()`
- `apps/backend-ts/src/memory/manager.ts` — Added `import type { Extraction }`, `llm?` to options, `readonly llm` field, `saveTypedMemory()` before `close()`
- `apps/backend-ts/test/memory/vectors-typed.test.ts` — 4 tests using mock collections via instance method override
- `apps/backend-ts/test/memory/manager-typed.test.ts` — 6 tests using class-based vi.mock factories

## Decisions Made

- `sourceId` is left as `undefined` in `saveTypedMemory` — SQLite stores NULL, FK population deferred per STATE.md decision from Phase 35
- `initTypedCollections()` kept `private` — test overrides the method via `vectors['initTypedCollections'] = vi.fn()` on the instance to inject mock collections
- Class-based vi.mock factories used for MemoryStore and MemoryVectors to support `new` keyword in MemoryManager constructor

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing @tsconfig/node22 in worktree**
- **Found during:** Task 1 RED — running vitest in the worktree
- **Issue:** Worktree `apps/backend-ts/node_modules` was missing `@tsconfig/node22` package (listed in devDependencies), causing tsconfig.json resolution failure and preventing any test from running
- **Fix:** `npm install --save-dev @tsconfig/node22` inside `apps/backend-ts` of the worktree
- **Files modified:** `apps/backend-ts/node_modules/@tsconfig/` (not committed — runtime dependency install)
- **Verification:** `npx vitest run test/memory/store-typed.test.ts` passed with 6 tests before writing new tests
- **Committed in:** n/a (dependency install, not a source change)

**2. [Rule 1 - Bug] Fixed vi.mock factory to use class syntax**
- **Found during:** Task 2 RED — initial manager-typed.test.ts used `vi.fn().mockImplementation(() => ({...}))` for constructors
- **Issue:** Arrow function mock implementations cannot be called with `new` — vitest threw "is not a constructor"
- **Fix:** Replaced with `class MockMemoryStore { method = vi.fn() }` pattern inside `vi.mock` factory
- **Files modified:** `apps/backend-ts/test/memory/manager-typed.test.ts`
- **Verification:** All 6 manager-typed tests pass after fix
- **Committed in:** `dec8241` (RED commit, adjusted test file)

---

**Total deviations:** 2 auto-fixed (1 blocking dependency, 1 bug in test mock pattern)
**Impact on plan:** Both fixes necessary for tests to run correctly. No scope creep.

## Issues Encountered

- Pre-existing failure in `src/memory/manager.test.ts` (1 test, `saveTurn persists messages...`) was present before this plan and excluded from scope per Phase 35-P01-SUMMARY. Full suite: 183/184 passing.

## Known Stubs

None — all methods are fully wired to their dependencies (store, vectors).

## Next Phase Readiness

- `MemoryManager.saveTypedMemory()` is ready to be called from ChatSession in Phase 36-P03
- `MemoryVectors.queryMemoriesByType()` is ready for Phase 37 (Context Builder) top-k retrieval per type
- All typed collection routing is in place; no further infrastructure needed before P03 wiring

---
*Phase: 36-memory-writer*
*Completed: 2026-04-25*
