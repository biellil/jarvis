---
phase: 16-memory-layer
plan: 01
status: complete
completed_at: 2026-04-08
commits:
  - 90fd48e  # chore(16-01): Install Drizzle ORM, better-sqlite3
  - 4d26d38  # feat(16-01): Define Drizzle ORM schema
  - 7238346  # feat(16-01): Create Drizzle DB client
  - 97b30ca  # feat(16-01): aplica migrations do Drizzle no startup
  - 8914b9c  # build(16-01): drizzle.config + migration inicial
---

# Plan 16-01 Summary — Drizzle ORM + SQLite Foundation

## Delivered

- `drizzle-orm`, `better-sqlite3`, `drizzle-kit`, `@types/better-sqlite3` instalados
- `apps/backend-ts/src/memory/schema.ts` — schema Drizzle com 5 tabelas (conversations, messages, summaries, userProfile, toolCalls) replicando `src/jarvis/memory/store.py`
- `apps/backend-ts/src/memory/db.ts` — cliente Drizzle sobre better-sqlite3 (DB path via `DATABASE_PATH` env, default `jarvis.sqlite`)
- `apps/backend-ts/drizzle.config.ts` — config do drizzle-kit
- `apps/backend-ts/src/memory/migrations/0000_0000_init.sql` — migration inicial gerada
- `apps/backend-ts/src/memory/migrate.ts` — função `runMigrations()`
- `apps/backend-ts/src/index.ts` — chama `runMigrations()` antes de `app.listen`

## Requirements Covered

- MEM-TS-01 ✅ (SQLite via Drizzle configurado)
- MEM-TS-03 ✅ (schema paridade com Python)

## Acceptance

Typecheck limpo (`pnpm tsc --noEmit`). Migrations aplicam no startup sem erros.

## Hand-off

Plano 16-02 (MemoryStore) e 16-03 (embeddings) podem rodar em paralelo usando `db` de `./db.js` e `schema` de `./schema.js`.
