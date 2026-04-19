---
phase: 35-schema-type-foundation
plan: P01
subsystem: database
tags: [drizzle-orm, sqlite, better-sqlite3, vitest, typed-memories, migrations]

# Dependency graph
requires: []
provides:
  - typed_memories Drizzle table definition with typedMemoriesEnum and typedMemoriesRelations
  - migration 0003_typed_memories.sql with CHECK constraint enforced at SQLite level
  - Wave 0 tests: schema structure, fresh migration, v1.7 upgrade without data loss
affects:
  - 36-memory-writer
  - 37-context-builder

# Tech tracking
tech-stack:
  added:
    - real column type from drizzle-orm/sqlite-core (for confidence float column)
  patterns:
    - Drizzle schema enum pattern: text('col', { enum: [...] }) for TS safety, CHECK() in migration SQL for DB enforcement
    - Migration SQL manually authored to match project format (no drizzle-kit generate needed)
    - Wave 0 TDD: RED test stubs committed before GREEN implementation

key-files:
  created:
    - apps/backend-ts/src/memory/migrations/0003_typed_memories.sql
    - apps/backend-ts/test/memory/schema-typed-memories.test.ts
    - apps/backend-ts/test/memory/migration-fresh.test.ts
    - apps/backend-ts/test/memory/migration-upgrade.test.ts
  modified:
    - apps/backend-ts/src/memory/schema.ts
    - apps/backend-ts/src/memory/migrations/meta/_journal.json

key-decisions:
  - "source_id FK is nullable in Phase 35 — Phase 36 (Memory Writer) populates it when writing extracted memories"
  - "CHECK constraint authored manually in migration SQL, not auto-generated — Drizzle text enum provides only TS safety, SQLite needs explicit CHECK for runtime enforcement"
  - "conversationsRelations extended with typedMemories: many(typedMemories) to enable JOIN queries in Phase 36+"

patterns-established:
  - "Pattern 1: Manual migration SQL — author 0003_typed_memories.sql to match 0002_voice_calls.sql format; do not rely on drizzle-kit generate for schema with CHECK constraints"
  - "Pattern 2: Wave 0 TDD — write failing tests first (RED), commit, then write implementation (GREEN), commit separately"

requirements-completed: [MTYPE-05]

# Metrics
duration: 3min
completed: 2026-04-19
---

# Phase 35 Plan P01: Schema & Type Foundation Summary

**typed_memories Drizzle table with SQLite CHECK constraint on enum type, migration 0003, and 9 Wave 0 vitest tests proving structure + fresh/upgrade migration paths**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-19T14:28:48Z
- **Completed:** 2026-04-19T14:32:00Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 7

## Accomplishments
- Defined `typedMemories` Drizzle table in schema.ts with 9 columns, FK cascade on conversationId, nullable FK on sourceId, and real confidence column
- Authored `0003_typed_memories.sql` with `CHECK(type IN ('semantic','episodic','procedural'))` enforced at the SQLite level — invalid types throw at DB, not application layer
- Updated `_journal.json` with idx=3 entry so Drizzle migrator picks up the new migration in the correct order
- Extended `conversationsRelations` with `typedMemories: many(typedMemories)` for future join support
- Created 3 Wave 0 test files (9 tests) proving: table structure, CHECK constraint rejection, nullable columns, fresh migration path, and v1.7 upgrade without data loss

## Task Commits

Each task was committed atomically:

1. **Task 1: Write Wave 0 test stubs (RED phase)** - `a56028a` (test)
2. **Task 2: Extend schema.ts + author migration 0003 (GREEN phase)** - `74a0b7a` (feat)

## Files Created/Modified
- `apps/backend-ts/src/memory/schema.ts` - Added `real` import, `typedMemoriesEnum`, `typedMemories` sqliteTable, `typedMemoriesRelations`, extended `conversationsRelations`
- `apps/backend-ts/src/memory/migrations/0003_typed_memories.sql` - CREATE TABLE with CHECK constraint and two FK references
- `apps/backend-ts/src/memory/migrations/meta/_journal.json` - Appended idx=3 entry for 0003_typed_memories
- `apps/backend-ts/test/memory/schema-typed-memories.test.ts` - Table structure + CHECK constraint + nullable column tests
- `apps/backend-ts/test/memory/migration-fresh.test.ts` - Fresh :memory: DB migration path tests
- `apps/backend-ts/test/memory/migration-upgrade.test.ts` - v1.7 DB upgrade without data loss tests

## Decisions Made
- source_id FK is nullable: allows Phase 36 to populate it after extraction without needing data upfront
- CHECK constraint manually authored in SQL: Drizzle's `text({ enum: [...] })` only provides TypeScript type safety, not runtime SQLite enforcement
- conversationsRelations extended proactively for typed join support in future phases

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing test failure in `src/memory/manager.test.ts` (MemoryManager > saveTurn > "### Recall from past conversations" assertion) existed before this plan's changes. Verified by stashing changes and confirming the failure persists. Logged as pre-existing, out of scope for this plan.

## Known Stubs

None - all schema columns are wired. The typed_memories table is empty at rest (no data seeded by this plan); Phase 36 (Memory Writer) will populate it.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 36 (Memory Writer) unblocked: `typed_memories` table schema and migration are in place
- `createStoreForTests()` in store.ts already runs all 4 migrations (including 0003) when called in tests
- source_id is nullable — Phase 36 can begin writing memories without message-level linking first
- Concern: Pre-existing `manager.test.ts` failure may need attention before Phase 36 test suite is considered fully green

---
*Phase: 35-schema-type-foundation*
*Completed: 2026-04-19*
