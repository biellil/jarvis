---
phase: 18-pc-tools-backend
plan: 02
subsystem: memory/audit
tags: [tool-logger, drizzle, migration, audit-log]
requires: [16]
provides:
  - ToolLogger.logDispatch
  - ToolLogger.updateOutcome
  - tool_calls.output column
  - toolCallOutcomeEnum includes 'dispatched'
affects:
  - apps/backend-ts/src/memory/schema.ts
  - apps/backend-ts/src/memory/store.ts
  - apps/backend-ts/src/memory/migrations/
tech_stack:
  added: []
  patterns: [catch-and-log never-throw, drizzle ALTER TABLE migration]
key_files:
  created:
    - apps/backend-ts/src/memory/migrations/0001_tool_calls_dispatch.sql
    - apps/backend-ts/test/memory/tool-logger.test.ts
  modified:
    - apps/backend-ts/src/memory/schema.ts
    - apps/backend-ts/src/memory/store.ts
    - apps/backend-ts/src/memory/migrations/meta/_journal.json
decisions:
  - Enum extension is TS-only; SQLite does not enforce CHECK — simplest migration is plain ADD COLUMN
  - logDispatch/updateOutcome mantêm o padrão catch-and-log never-throw do MemoryStore
  - log() legado permanece intacto pra compat
metrics:
  tasks: 2
  duration: ~10min
  completed: 2026-04-08
---

# Phase 18 Plan 02: ToolLogger dispatch/result lifecycle — Summary

One-liner: Estendeu ToolLogger com ciclo de vida em 2 etapas (dispatch → outcome) e adicionou coluna `output` + valor `dispatched` ao enum, preparando audit log pro protocolo SSE+POST /tool-calls/:id/result da Fase 18.

## What Shipped

- **Schema**: `toolCallOutcomeEnum = ['dispatched', 'success', 'error', 'cancelled']`; `tool_calls.output` (text, nullable).
- **Migration Drizzle 0001**: `ALTER TABLE tool_calls ADD output text;` + entry no `_journal.json`.
- **ToolLogger.logDispatch(toolName, params): number | null** — insere row com `outcome='dispatched'`, retorna id via `.returning()`. Retorna null em erro.
- **ToolLogger.updateOutcome(id, outcome, output, error): boolean** — update by id, retorna `true` se `res.changes > 0`. Retorna false em erro ou id inexistente.
- **Testes vitest** (`test/memory/tool-logger.test.ts`): 7 casos cobrindo schema PRAGMA, happy path dispatch, happy path update success/error, id inexistente, DB fechado em ambos.

## Verification

- `pnpm test --run`: **102/102 passam** (14 test files), incluindo os 7 novos de tool-logger e os testes da Fase 16 que continuam verdes.
- `pnpm build` (tsc): **clean**, sem type errors.

## Deviations from Plan

None — plano executado exatamente como escrito.

## Commits

- `49ed987` 🏗️ build(18-02): adiciona migration 0001 com coluna output e enum dispatched
- `dfa0128` ✨ feat(18-02): estende ToolLogger com logDispatch e updateOutcome

## Self-Check: PASSED

- apps/backend-ts/src/memory/schema.ts — FOUND
- apps/backend-ts/src/memory/store.ts — FOUND
- apps/backend-ts/src/memory/migrations/0001_tool_calls_dispatch.sql — FOUND
- apps/backend-ts/src/memory/migrations/meta/_journal.json — FOUND (idx 1 presente)
- apps/backend-ts/test/memory/tool-logger.test.ts — FOUND
- commit 49ed987 — FOUND
- commit dfa0128 — FOUND
