---
phase: 82-langgraph-execucao-silenciosa-sem-confirmacao
plan: 01
subsystem: backend-ts/agent
tags: [langgraph, approval-memory, sqlite, drizzle, tdd]
dependency_graph:
  requires: []
  provides: [D-01, D-02, D-03]
  affects: [apps/backend-ts/src/agent/graph.ts, apps/backend-ts/src/memory/schema.ts]
tech_stack:
  added: [crypto.createHash SHA-256, approved_plans SQLite table]
  patterns: [TDD RED-GREEN, vi.mock for Drizzle isolation, ISO string TTL comparison]
key_files:
  created:
    - apps/backend-ts/src/agent/approval.ts
    - apps/backend-ts/src/agent/__tests__/approval.test.ts
    - apps/backend-ts/src/memory/migrations/0006_approved_plans.sql
  modified:
    - apps/backend-ts/src/memory/schema.ts
    - apps/backend-ts/src/memory/migrations/meta/_journal.json
    - apps/backend-ts/src/agent/graph.ts
    - apps/backend-ts/src/agent/__tests__/graph.test.ts
    - apps/backend-ts/src/agent/__tests__/graph.e2e.test.ts
decisions:
  - "approvalDb as any cast in graph.ts — Drizzle infers schema-typed DB; approval.ts uses generic DrizzleDb<typeof schema>; types differ only in generic parameter, runtime behavior identical"
  - "Approval check after generatePlan(), before interrupt() — ensures plan content is available for key generation"
  - "vi.mock for approval module in both graph.test.ts and graph.e2e.test.ts — prevents SQLite persistence causing non-deterministic interrupt behavior across test runs"
  - "ISO string lexicographic comparison for TTL (expiresAt > now) — ISO 8601 is lexicographically ordered, no datetime() SQLite function needed"
  - "canonicalPlanKey sorts descriptions alphabetically — order-invariant hash regardless of LLM step ordering variation"
metrics:
  duration: "~15m"
  completed_date: "2026-05-27"
  tasks: 2
  files: 9
---

# Phase 82 Plan 01: Schema + Migration + approval.ts + Conditional interrupt Summary

SQLite-backed plan approval memory: `approved_plans` table + `approval.ts` (4 functions) + 3-branch conditional interrupt in LangGraph planner node. Plans already approved skip interrupt silently; critical actions always interrupt.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Schema + migration + approval.ts (TDD) | f4dc130 | 0006_approved_plans.sql, schema.ts, approval.ts, approval.test.ts, _journal.json |
| 2 | Conditional interrupt in graph.ts | 4c28aaa | graph.ts, graph.test.ts, graph.e2e.test.ts |

## What Was Built

### Task 1 — Schema + approval.ts

**Migration** (`0006_approved_plans.sql`): DDL for `approved_plans` table with `key` (SHA-256, UNIQUE), `plan_json`, `approved_at`, `expires_at`, `created_at`. Journal updated with idx=6 entry.

**Schema** (`schema.ts`): `approvedPlans` Drizzle table added after `reminders` block under Phase 82 comment header.

**approval.ts** — 4 exported functions:
- `hasCriticalAction(plan)` — keyword scan on all step descriptions (lowercase). Keywords: deletar/delete/remover/remove/apagar/erase/unlink/rm/trash/permission/chmod/chown/registry/system config/configuração do sistema
- `canonicalPlanKey(plan)` — SHA-256 of sorted+lowercased+trimmed descriptions joined with `\n`. Sort ensures order-invariance.
- `isApprovedPlan(planKey, db)` — SELECT by key, compare `expiresAt > now` via ISO string lexicographic comparison
- `saveApproval(planKey, plan, db, ttlDays=90)` — INSERT with onConflictDoUpdate to renew TTL on re-approval

**Tests** (`approval.test.ts`) — 12 tests, all green:
- KWD-01, 01b, 01c, 01d, 01e: critical keyword detection (case-insensitive)
- KEY-01, 01b, 01c: canonical key determinism (order-invariant, differentiates distinct plans)
- APR-01, 02, 03, 04: DB operations (empty→false, save→true, expired→false, upsert renews TTL)

### Task 2 — Conditional interrupt in graph.ts

**graph.ts planner node** now has 3 branches:

```
1. hasCriticalAction(plan) === true → interrupt() always (safety)
2. isApprovedPlan(planKey, db) === true → task:auto-approved, skip interrupt
3. Neither → interrupt(), on confirm → saveApproval()
```

**New Phase 82 tests in graph.test.ts** (3 tests):
- APR-02: pre-approved plan emits `task:auto-approved` and reaches `task:done` without interrupt
- APR-03: critical keyword forces interrupt even when approval cache would hit
- KWD-check: new plan (no critical, not cached) goes through normal interrupt

**graph.e2e.test.ts**: Added `vi.mock('../approval.js')` and `vi.mock('../../memory/db.js')` to prevent shared SQLite singleton from making interrupt non-deterministic between test runs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test isolation for graph.e2e.test.ts**
- **Found during:** Task 2 verification
- **Issue:** `approvalDb` is a module-level singleton (real SQLite file). When graph tests ran in sequence, a plan confirmed in one test was persisted to the real DB, causing the e2e test's `isApprovedPlan` to return `true` unexpectedly. This made the graph skip interrupt(), causing `snapshot.tasks.length === 0` and test failure.
- **Fix:** Added `vi.mock('../approval.js', ...)` and `vi.mock('../../memory/db.js', ...)` to `graph.e2e.test.ts` with safe defaults (hasCriticalAction=false, isApprovedPlan=false, saveApproval=noop). Same pattern already used in graph.test.ts.
- **Files modified:** `apps/backend-ts/src/agent/__tests__/graph.e2e.test.ts`
- **Commit:** 4c28aaa

## Key Decisions

**approvalDb as any cast** — `db.ts` exports `drizzle(sqlite, { schema })` which resolves to `BetterSQLite3Database<typeof schema> & { $client }`. `approval.ts` uses `BetterSQLite3Database<typeof schema>` (the generic variant). TypeScript rejects the assignment due to the `& { $client }` intersection. `as any` sidesteps this — behavior at runtime is identical. Documented in code comment.

**ISO string TTL** — `expiresAt > now` works because ISO 8601 (`2026-08-25T...` > `2026-05-27T...`) is lexicographically ordered. No need for SQLite `datetime()` expressions which have limited Drizzle support.

**Journal update** — `drizzle-orm/better-sqlite3/migrator` uses `meta/_journal.json` to determine which migrations to apply. New migration required manual journal entry (idx=6) alongside the SQL file.

## Test Results

```
approval.test.ts: 12 passed (KWD-01*, KEY-01*, APR-01..04)
graph.test.ts: 16 passed (existing 13 + Phase 82: APR-02, APR-03, KWD-check)
graph.e2e.test.ts: 3 passed (AGENT-01, AGENT-04, AGENT-02 edit-loop)
```

Pre-existing failures (12 tests in tool-dispatch, chat-session-tools, pc-tools, chat-sse-action) are unrelated to Phase 82 and were present before this plan.

## Self-Check: PASSED

- [x] `apps/backend-ts/src/agent/approval.ts` — created, exports 4 functions
- [x] `apps/backend-ts/src/memory/migrations/0006_approved_plans.sql` — contains `CREATE TABLE \`approved_plans\``
- [x] `apps/backend-ts/src/memory/schema.ts` — exports `approvedPlans`
- [x] `apps/backend-ts/src/agent/graph.ts` — contains `hasCriticalAction(plan)` and `task:auto-approved`
- [x] Commits f4dc130 and 4c28aaa verified in git log
