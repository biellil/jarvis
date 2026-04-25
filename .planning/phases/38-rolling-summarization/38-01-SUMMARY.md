---
phase: 38-rolling-summarization
plan: "01"
subsystem: memory
tags: [tdd, rolling-summarization, tests, red-phase]
dependency_graph:
  requires:
    - phase-37-context-builder (MemoryManager.buildContext interface)
    - phase-35-schema-type-foundation (summaries table schema)
  provides:
    - RED tests for MSUM-01 (countMessages, getOldestMessages, deleteMessages, saveSummary)
    - RED tests for MSUM-02 (threshold guard, silent failure, _latestSummary cache)
    - RED tests for MSUM-03 (buildContext _latestSummary injection, position, priority)
  affects:
    - apps/backend-ts/src/memory/store.test.ts
    - apps/backend-ts/src/memory/manager.test.ts
tech_stack:
  added: []
  patterns:
    - vitest with vi.mock for MemoryStore and MemoryVectors
    - (store as any).method() for calling not-yet-implemented methods from tests
    - nested describe blocks for grouping RED tests inside existing MemoryStore suite
key_files:
  created:
    - apps/backend-ts/src/memory/manager.test.ts
  modified:
    - apps/backend-ts/src/memory/store.test.ts
decisions:
  - Used (store as any).method() instead of typed calls to avoid TypeScript errors for non-existent methods
  - Kept 7 RED store tests inside existing describe('MemoryStore') as nested describe block per plan pattern
  - Symlinked main repo node_modules to worktree for test execution in parallel agent context
metrics:
  duration_minutes: 15
  completed_date: "2026-04-25"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 38 Plan 01: RED Tests for Rolling Summarization Summary

**One-liner:** TDD RED phase — 16 failing tests covering MSUM-01/02/03 contracts for rolling summarization and buildContext with _latestSummary.

## What Was Built

Created the TDD RED test suite for the rolling summarization feature (Phase 38). Two test files were created/extended with failing tests that will become green once Wave 2 implements the production code.

### store.test.ts — 7 RED tests added

Added `describe('rolling summarization helpers')` block inside the existing `MemoryStore` describe:

| Test | Method Under Test | Expected Behavior |
|------|-------------------|-------------------|
| 1 | `countMessages` | Returns 4 for 4 user/assistant messages |
| 2 | `getOldestMessages` | Returns N oldest messages by id ASC |
| 3 | `deleteMessages` | Removes specified rows from SQLite |
| 4 | `getLatestSummary` | Returns content of most recent summary |
| 5 | `getLatestSummary` | Returns null when no summaries exist |
| 6 | `deleteMessages([])` | Does not throw on empty array |
| 7 | `countMessages(999999)` | Returns 0 for invalid convId without throw |

### manager.test.ts — 9 RED tests created

New file with full mock setup (MemoryStore + MemoryVectors via vi.mock):

**describe('MemoryManager.runRollingSummarization') — 6 tests:**
- count < 20: returns without calling LLM (MSUM-01 threshold)
- count >= 20: calls getOldestMessages(id, 10), invokes LLM, deleteMessages, saveSummary
- LLM returns empty string: skips deleteMessages and saveSummary
- LLM throws Error: resolves silently (MSUM-02 silent failure)
- After successful summary: _latestSummary accessible via buildContext
- convId=null: returns without calling any store method

**describe('MemoryManager.buildContext com _latestSummary (MSUM-03)') — 3 tests:**
- _latestSummary injected when rollingSum not passed explicitly
- Explicit rollingSum parameter takes priority over _latestSummary
- Summary appears between Perfil do usuário and Memórias semânticas (correct position)

## Verification Results

```
Test Files  2 failed | 4 passed (6)
Tests       16 failed | 39 passed (55)
```

- **39 existing tests: all GREEN** (store, vectors, embeddings, profile, voice-log)
- **16 new RED tests: all FAILING** (methods not yet implemented — expected)
  - `store.countMessages is not a function`
  - `store.getOldestMessages is not a function`
  - `store.deleteMessages is not a function`
  - `store.getLatestSummary is not a function`
  - `mm.runRollingSummarization is not a constructor/function`

## Deviations from Plan

None — plan executed exactly as written.

The only adaptation: the plan template showed `store.countMessages(...)` without `(store as any)` cast, but since TypeScript would error on non-existent methods, the `(store as any)` pattern was used consistently for all new method calls. This is standard TDD RED practice for TypeScript.

## Known Stubs

None. This is a test-only plan — no production code was written.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes were introduced. All changes are test files only.

## Self-Check: PASSED

- `apps/backend-ts/src/memory/manager.test.ts` — FOUND (248 lines)
- `apps/backend-ts/src/memory/store.test.ts` — FOUND (248 lines, extended)
- Commit `7c2306a` — FOUND
- 39 existing tests: GREEN — VERIFIED
- 16 new RED tests: FAILING — VERIFIED
