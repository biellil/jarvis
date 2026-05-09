---
phase: 67-jarvis-proativo
plan: 01
subsystem: proactive-infrastructure
tags: [node-cron, drizzle, sqlite, ipc-types, test-stubs, wave-0]
dependency_graph:
  requires: []
  provides:
    - node-cron@^4.2.1 instalado em backend-ts
    - tabela reminders no schema Drizzle (schema.ts)
    - migration SQL 0005_reminders.sql com CHECK constraints e índices
    - ProactiveEvent union type em ipc-types.ts
    - QuietHoursConfig, FolderWatchConfig, DailySummaryConfig em ipc-types.ts
    - SettingsData estendida com quietHours/folderWatch/dailySummary
    - 9 stub test files com it.todo() para Wave 1 implementar
  affects:
    - apps/backend-ts (nova dep + schema + migration)
    - apps/desktop/src/shared/ipc-types.ts (novos tipos)
tech_stack:
  added:
    - node-cron@^4.2.1
  patterns:
    - stub-first test infrastructure (Phase 66-01 pattern)
    - Drizzle manual migration com statement-breakpoint separators
    - discriminated union ProactiveEvent para SSE events
key_files:
  created:
    - apps/backend-ts/src/memory/migrations/0005_reminders.sql
    - apps/backend-ts/src/proactive/__tests__/scheduler.test.ts
    - apps/backend-ts/src/proactive/__tests__/quiet-hours.test.ts
    - apps/backend-ts/src/proactive/__tests__/folder-watcher.test.ts
    - apps/backend-ts/src/proactive/__tests__/daily-summary.test.ts
    - apps/backend-ts/src/proactive/__tests__/reminders.test.ts
    - apps/backend-ts/src/proactive/__tests__/reminders.tools.test.ts
    - apps/backend-ts/src/routes/__tests__/proactive.route.test.ts
    - apps/desktop/src/main/ipc/__tests__/proactive.test.ts
    - apps/desktop/src/renderer/src/settings/__tests__/ProactiveSection.test.tsx
  modified:
    - apps/backend-ts/package.json
    - apps/backend-ts/src/memory/schema.ts
    - apps/backend-ts/src/memory/migrations/meta/_journal.json
    - apps/desktop/src/shared/ipc-types.ts
    - pnpm-lock.yaml
decisions:
  - node-cron@^4.2.1 instalado (versão 4.x ESM-native, confirmada npm registry 2026-05-09)
  - Drizzle migration manual seguindo padrão existente (statement-breakpoint separators obrigatórios)
  - ProactiveEvent como discriminated union em ipc-types.ts (não em packages/ipc-types/ separado)
  - SettingsData estendida com tipos não-opcionais quietHours/folderWatch/dailySummary
metrics:
  duration_seconds: 889
  completed_date: "2026-05-09"
  tasks_completed: 2
  files_created: 10
  files_modified: 5
---

# Phase 67 Plan 01: Wave 0 Infrastructure — Stub Tests, Schema e Tipos Proativos

**One-liner:** node-cron instalado, tabela reminders no SQLite via Drizzle, 9 stubs vitest com it.todo(), ProactiveEvent union e config types em ipc-types.ts.

## Summary

Wave 0 do JARVIS Proativo estabelece toda a infraestrutura de contratos antes da implementação real (Wave 1). Seguindo o padrão Phase 66-01, os testes stub com `it.todo()` garantem que os planos subsequentes tenham comandos `<verify>` reais e que os contratos de interface sejam definidos antes do código.

**O que foi feito:**

1. **node-cron@^4.2.1** adicionado como dependência em `apps/backend-ts/package.json` e instalado via pnpm.

2. **Schema Drizzle** estendido com tabela `reminders` incluindo enums `reminderStatusEnum` ('pending'|'fired'|'cancelled'|'deferred') e `reminderKindEnum` ('reminder'|'daily_summary'|'folder_event'). Campos: id, due_at (epoch ms), message, kind, status, created_at, fired_at (nullable), deferred_until (nullable).

3. **Migration SQL** `0005_reminders.sql` criada com `CREATE TABLE reminders`, `CHECK constraints` em kind e status, e dois índices (`reminders_due_at_idx`, `reminders_status_idx`) para performance de queries do scheduler.

4. **Journal de migrations** atualizado com entry `idx=5, tag="0005_reminders"`.

5. **9 arquivos stub** criados em `src/proactive/__tests__/` (scheduler, quiet-hours, folder-watcher, daily-summary, reminders, reminders.tools), `src/routes/__tests__/` (proactive.route) e no desktop (proactive IPC, ProactiveSection settings).

6. **ipc-types.ts** estendido com `ProactiveEvent` discriminated union, `QuietHoursConfig`, `FolderWatchConfig`, `DailySummaryConfig` interfaces, e `SettingsData` com os três campos proativos.

## Commits

| Task | Commit | Descrição |
|------|--------|-----------|
| Task 1 | `9af5eee` | node-cron, schema reminders, migration 0005, journal |
| Task 2 | `a84a32d` | 9 stubs de teste + tipos proativos em ipc-types |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Separadores statement-breakpoint ausentes no migration SQL**
- **Found during:** Task 2 — ao rodar os testes, `runMigrations()` falhou com "Failed to run the query" porque better-sqlite3 não aceita múltiplas statements em uma única chamada
- **Issue:** O arquivo `0005_reminders.sql` inicial não usava os separadores `--> statement-breakpoint` que o migrador Drizzle requer para dividir statements antes de executá-las individualmente
- **Fix:** Adicionados separadores `--> statement-breakpoint` entre `CREATE TABLE`, `CREATE INDEX` e `CREATE INDEX`
- **Files modified:** `apps/backend-ts/src/memory/migrations/0005_reminders.sql`
- **Commit:** `a84a32d` (incluído no commit da Task 2)

## Test Results

Suite completa após correção: **72 passed | 7 skipped | 46 todo** — zero falhas.

Os 46 `todo` são exatamente os stubs criados neste plano, prontos para implementação na Wave 1.

## Known Stubs

Todos os stubs são intencionais (Wave 0 pattern). Nenhum flui para rendering — são apenas `it.todo()` sem implementação.

| Arquivo | Stubs | Propósito |
|---------|-------|-----------|
| scheduler.test.ts | 5 | ProactiveScheduler bootstrap + fire + cancel |
| quiet-hours.test.ts | 9 | isInQuietHours cross-midnight + nextQuietEnd |
| folder-watcher.test.ts | 5 | FolderWatcher chokidar + debounce |
| daily-summary.test.ts | 5 | DailySummaryGenerator LLM context + fallback |
| reminders.test.ts | 6 | RemindersRepository CRUD + validations |
| reminders.tools.test.ts | 9 | createReminderTool/listRemindersTool/cancelReminderTool |
| proactive.route.test.ts | 6 | SSE stream + ack endpoint |
| proactive.test.ts (desktop) | 4 | ProactiveSSEConsumer Notification + IPC |
| ProactiveSection.test.tsx | 6 | Settings UI quiet hours + folder watch + summary |

## Threat Surface Scan

Nenhum novo endpoint de rede ou auth path criado neste plano — apenas tipos e schema. Os CHECK constraints na migration (T-67-01) estão presentes conforme o threat model.

## Self-Check: PASSED

- FOUND: node-cron in package.json
- FOUND: 0005_reminders.sql
- FOUND: reminders export in schema.ts
- FOUND: ProactiveEvent in ipc-types.ts
- FOUND: todos os 9 arquivos stub
- FOUND: commits 9af5eee e a84a32d no histórico git
