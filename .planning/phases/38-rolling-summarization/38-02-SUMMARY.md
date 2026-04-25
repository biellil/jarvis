---
phase: 38-rolling-summarization
plan: "02"
subsystem: memory
tags: [tdd, rolling-summarization, green-phase, memory-manager, memory-store]
dependency_graph:
  requires:
    - 38-01  # RED tests that this plan makes GREEN
  provides:
    - rolling-summarization-core
    - memory-store-helpers
  affects:
    - apps/backend-ts/src/memory/store.ts
    - apps/backend-ts/src/memory/manager.ts
tech_stack:
  added: []
  patterns:
    - fire-and-forget async (MEM-05 parity)
    - drizzle-orm sql<T> template for count queries
    - threshold guard (count < 20) before LLM call
    - pitfall-3 protection (delete only after summary success)
key_files:
  modified:
    - apps/backend-ts/src/memory/store.ts
    - apps/backend-ts/src/memory/manager.ts
    - apps/backend-ts/src/memory/manager.test.ts
decisions:
  - "countMessages uses sql<number> cast(count(*) as integer) — drizzle doesn't infer number type from count() without explicit cast"
  - "deleteMessages only called after summary non-empty — protects against data loss on LLM failure"
  - "vi.fn().mockImplementation must use function(){} not arrow function for constructor mocks in Vitest"
metrics:
  duration: "~5 min"
  completed: "2026-04-25"
  tasks_completed: 2
  files_changed: 3
---

# Phase 38 Plan 02: MemoryStore helpers + MemoryManager rolling summarization Summary

**One-liner:** GREEN phase — 4 MemoryStore helpers + runRollingSummarization with threshold guard, fire-and-forget, and _latestSummary cache in MemoryManager.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | MemoryStore — 4 métodos helper de sumarização | 5ad8b3a | store.ts |
| 2 | MemoryManager — _latestSummary, runRollingSummarization, buildContext patch | 5df9764 | manager.ts, manager.test.ts |

## What Was Built

### MemoryStore (store.ts)

Added 4 helper methods implementing the MEM-05 pattern (catch + warn, never throw):

- **`countMessages(convId)`** — counts only `user`/`assistant` roles using `sql<number>\`cast(count(*) as integer)\``
- **`getOldestMessages(convId, limit)`** — returns N oldest messages ordered by `id ASC`, typed as `MessageWithId[]`
- **`deleteMessages(ids)`** — deletes by ID array; no-op on empty array
- **`getLatestSummary(convId)`** — returns content of most recent summary or `null`

Also exported `MessageWithId` interface (extends `MessageInput` + `id: number`).

### MemoryManager (manager.ts)

- **`_latestSummary: string | null = null`** — in-memory cache for latest summary
- **`runRollingSummarization(convId)`** — public async method:
  1. Early return on `null` convId
  2. Threshold check: `if (count < 20) return` — no LLM call
  3. Fetch 10 oldest messages
  4. Generate summary via LLM
  5. Pitfall-3 protection: `if (!summary) return` — no delete on empty summary
  6. Delete oldest, save summary, update `_latestSummary`
  7. All errors caught + logged, never re-thrown
- **`_generateRollingSummary(msgs)`** — private LLM invocation with JARVIS pt-BR prompt
- **`buildContext` patch** — `effectiveSummary = rollingSum ?? this._latestSummary ?? undefined`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vi.fn() mock arrow function incompatible with `new` in Vitest**
- **Found during:** Task 2 — first test run showed "is not a constructor"
- **Issue:** Wave 1 test file used `vi.fn().mockImplementation(() => ({...}))` with arrow functions. In Vitest, when mocking a class constructor, the implementation must be a regular `function(){}` to support `new`.
- **Fix:** Changed all mock implementations in `manager.test.ts` from arrow functions to `function(){}` form.
- **Files modified:** `apps/backend-ts/src/memory/manager.test.ts`
- **Commit:** 5df9764

### Execution Note

The worktree's `node_modules` for `apps/backend-ts` was incomplete (missing `@tsconfig/node22`), so tests were validated against the main repo's node_modules (same source files). Files were copied to the worktree path before the final commit.

## Test Results

```
Test Files  6 passed (6)
Tests       55 passed (55)   ← previously 16 RED, now all GREEN
```

- `store.test.ts`: 19 passed (7 new helper tests + 12 original)
- `manager.test.ts`: 9 passed (all new rolling summarization tests)
- `vectors.test.ts`, `embeddings.test.ts`, `profile.test.ts`, `voice-log.test.ts`: unchanged, still passing

## Known Stubs

None — all data flows are fully implemented.

## Threat Flags

No new network endpoints, auth paths, or trust boundaries introduced. All mitigations from the plan's threat model are implemented:

| Threat | Mitigation |
|--------|-----------|
| T-38-03: deleteMessages IDs from external input | IDs come exclusively from `getOldestMessages` via drizzle select |
| T-38-04: SQL injection in countMessages | Uses `eq(messages.conversationId, convId)` parametrized — convId is TypeScript `number` |
| T-38-06: LLM calls without threshold | `if (count < 20) return` before any LLM invocation |
| T-38-07: Delete before summary | `if (!summary) return` guards deleteMessages call |

## Self-Check: PASSED

- [x] store.ts exists and contains all 4 helper methods
- [x] manager.ts exists and contains _latestSummary, runRollingSummarization, buildContext patch
- [x] 38-02-SUMMARY.md created
- [x] Commit 5ad8b3a (store helpers) — FOUND
- [x] Commit 5df9764 (manager rolling sum) — FOUND
- [x] All 55 memory suite tests pass (16 RED → GREEN)
