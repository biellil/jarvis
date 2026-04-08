---
phase: 16-memory-layer
plan: 02
status: complete
requirements: [MEM-TS-02, MEM-TS-03]
commits:
  - d155586  # ✅ test(16-02): testes falhando para MemoryStore e ToolLogger
  - 66fe1cd  # ✨ feat(16-02): implementa MemoryStore e ToolLogger com paridade Python
---

# Phase 16 Plan 02: MemoryStore + ToolLogger (TypeScript) — Summary

One-liner: Drizzle-backed `MemoryStore` and `ToolLogger` classes mirroring `src/jarvis/memory/store.py` 1:1, with MEM-05 error-resilience and full CRUD + persistence coverage under vitest.

## What shipped

- `apps/backend-ts/src/memory/store.ts`
  - `MemoryStore` class: `startConversation`, `endConversation`, `saveMessages`, `saveSummary`, `upsertProfile` (via drizzle `onConflictDoUpdate` on `userProfile.key`), `getProfileFacts`, `close`.
  - `ToolLogger` class: `log(toolName, params, outcome, error?)`, `close`.
  - `createStoreForTests(dbPath)` helper — opens a fresh better-sqlite3 handle, enables `foreign_keys`, runs drizzle `migrate()` against `src/memory/migrations`, returns `{ db, sqlite }`.
  - Constructor duality: `new MemoryStore()` reuses the singleton from `./db.js`; `new MemoryStore(dbPath)` owns its own connection (so `close()` only closes what it owns).
  - All mutating methods wrapped in try/catch with `console.warn(...)` — MEM-05 parity, never throws.
  - `nowIso()` helper = `new Date().toISOString()`, matching Python's UTC ISO format.
- `apps/backend-ts/src/memory/index.ts` — barrel re-exporting schema, `db`, `runMigrations`, `MemoryStore`, `ToolLogger`, `createStoreForTests`, plus `MessageInput` / `ProfileFact` types.
- `apps/backend-ts/src/memory/store.test.ts` — 12 vitest cases:
  - `startConversation` returns id > 0
  - `endConversation` sets `ended_at`
  - `saveMessages` persists role/content/createdAt
  - `saveSummary` persists summary row
  - `upsertProfile` inserts then replaces same key in place (single row)
  - `getProfileFacts` ordered by insertion
  - Persistence across reopen against tmp file
  - Invalid convId on `saveMessages` does NOT throw (FK violation caught)
  - Invalid id on `endConversation` does NOT throw
  - `ToolLogger.log` serializes params_json
  - `ToolLogger.log` with error outcome persists `error`
  - `ToolLogger.log` with invalid outcome does NOT throw

## Verification

- `pnpm vitest run src/memory/store.test.ts` → **12/12 passing**
- `pnpm tsc --noEmit` → clean (strict mode)

## Deviations

**[Rule 3 — Blocking infra]** `better-sqlite3` native binding was not compiled in the pnpm store, causing `Cannot find module '.../Release/better_sqlite3.node'` when vitest loaded `./db.js`. Fixed by running `npm run install` inside `node_modules/.pnpm/better-sqlite3@12.8.0/.../better-sqlite3/` to trigger `prebuild-install`, which placed `better_sqlite3.node` in `build/Release/`. No source change — environment-only fix. If this recurs after a fresh `pnpm install`, use `pnpm approve-builds` (interactive) to whitelist `better-sqlite3` for automatic builds.

## Requirements covered

- **MEM-TS-02** — MemoryStore CRUD (conversations, messages, summaries, user_profile) ported to TypeScript with persistence verified.
- **MEM-TS-03** — ToolLogger audit log ported with JSON params serialization.

## Hand-off notes for Plan 16-03 (ChatSession)

- Import via `import { MemoryStore, ToolLogger } from './memory/index.js'` (or `'./memory/store.js'`).
- Default constructor (`new MemoryStore()`) reuses the global `db` singleton — safe for production use in ChatSession.
- `saveMessages` expects `createdAt` as ISO string — caller controls the timestamp, so you can pass per-message timestamps when saving a batch at the end of a turn (D-05 pattern).
- `upsertProfile` source enum: `'implicit' | 'explicit'`. Strict type available via `schema.userProfileSourceEnum`.
- `close()` is a no-op when using the singleton — only closes connections owned by that instance.
- Error policy: every method swallows errors and warns. Callers should NOT wrap calls in try/catch for persistence errors; trust the MEM-05 contract.

## Self-Check: PASSED

- `apps/backend-ts/src/memory/store.ts` — exists
- `apps/backend-ts/src/memory/store.test.ts` — exists
- `apps/backend-ts/src/memory/index.ts` — exists
- Commits `d155586`, `66fe1cd` — present in `git log`
- Tests green, tsc clean
