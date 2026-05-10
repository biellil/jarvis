---
phase: 67-jarvis-proativo
plan: 02
subsystem: proactive-reminders
tags: [drizzle, sqlite, langchain-tools, zod, tdd, wave-1]
dependency_graph:
  requires:
    - 67-01 (reminders table schema + migration 0005 + stub tests)
  provides:
    - RemindersRepository com CRUD via Drizzle (create/list/cancelById/fuzzyFind)
    - createReminderTool (LangChain tool, retorna pt-BR, nunca lança)
    - listRemindersTool (LangChain tool, lista pendentes em pt-BR)
    - cancelReminderTool (LangChain tool, fuzzy match + desambiguação)
    - createReminderInputSchema, cancelReminderInputSchema (Zod v4)
    - Reminder interface + ProactiveEvent union (proactive/types.ts)
  affects:
    - apps/backend-ts/src/proactive/ (3 novos arquivos)
    - apps/backend-ts/src/session/tools.ts (re-exports das 3 tools)
tech_stack:
  added: []
  patterns:
    - TDD Red→Green com Drizzle in-memory SQLite em testes
    - Zod v4 .issues (não .errors) para captura de erros de validação
    - BetterSQLite3Database<any> no repositório para injeção de dependência nos testes
    - Tool function factories (createReminderTool(repo)) — testável, sem singleton
    - msToHumanPtBR helper para formatação de tempo em pt-BR
key_files:
  created:
    - apps/backend-ts/src/proactive/types.ts
    - apps/backend-ts/src/proactive/repository.ts
    - apps/backend-ts/src/proactive/tools.ts
  modified:
    - apps/backend-ts/src/proactive/__tests__/reminders.test.ts (stubs → testes reais)
    - apps/backend-ts/src/proactive/__tests__/reminders.tools.test.ts (stubs → testes reais)
    - apps/backend-ts/src/session/tools.ts (re-exports das 3 novas tools)
decisions:
  - BetterSQLite3Database<any> no tipo do repositório para permitir injeção em testes sem acoplamento ao schema completo
  - Zod v4 usa .issues não .errors — capturado em catch via (err as any).issues com fallback para err.message
  - createReminderTool valida internamente via createReminderInputSchema (não via schema da tool LangChain) para retornar erros pt-BR em vez de lançar ToolInputParsingException
  - RemindersRepository aceita DrizzleDb injetado (factory pattern) em vez de usar singleton db — facilita testes isolados
metrics:
  duration_seconds: 536
  completed_date: "2026-05-09"
  tasks_completed: 3
  files_created: 3
  files_modified: 3
---

# Phase 67 Plan 02: Reminder Persistence Layer + LangChain Tools

**One-liner:** RemindersRepository com CRUD Drizzle/SQLite + 3 LangChain tools pt-BR (create/list/cancel) com validação Zod v4 e wiring em session/tools.ts.

## Summary

Wave 1 do JARVIS Proativo implementa a camada de persistência e as três tools que o agente ReAct usa para criar, listar e cancelar lembretes. Segue o padrão TDD (Red→Green): primeiro os testes substituíram os stubs `it.todo()` do plano 67-01, depois o código foi escrito para fazê-los passar.

**O que foi feito:**

1. **proactive/types.ts**: `Reminder` interface espelhando a tabela Drizzle, `createReminderInputSchema` (delayMs max 30 dias, atIso ISO 8601 com timezone, message 1–500 chars), `cancelReminderInputSchema`, `ProactiveEvent` discriminated union.

2. **proactive/repository.ts**: `RemindersRepository` com 4 métodos síncronos via Drizzle:
   - `create()`: valida via Zod, converte delayMs→epoch ou atIso→epoch, insere linha
   - `list()`: retorna pending+deferred ordenado por due_at asc
   - `cancelById(id)`: seta status='cancelled'
   - `fuzzyFind(query)`: LIKE `%query%` filtrando pending+deferred

3. **proactive/tools.ts**: 3 `tool()` functions do LangChain Core, cada uma factory aceitando `RemindersRepository`:
   - `createReminderTool`: valida internamente, retorna "Lembrete criado pra daqui 30 minutos: msg." ou "Lembrete criado para DD/MM às HH:mm: msg."
   - `listRemindersTool`: retorna "Nenhum lembrete pendente." ou lista numerada com tempo restante
   - `cancelReminderTool`: fuzzy match → 0 ("Não achei"), 1 ("Cancelado: msg."), N+ (lista de desambiguação)

4. **session/tools.ts**: re-exporta as 3 tools e `RemindersRepository` para uso pelo agente ReAct.

## Commits

| Task | Commit | Descrição |
|------|--------|-----------|
| RED | `7814ecf` | Testes reais substituindo it.todo() para repository e tools |
| GREEN | `5666d65` | types.ts + repository.ts + tools.ts + wiring em session/tools.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Zod v4 usa .issues não .errors**
- **Found during:** Task 2 (GREEN) — testes de validação falhando com "Cannot read properties of undefined (reading 'map')"
- **Issue:** O código usava `err.errors.map(...)` mas Zod v4 mudou para `.issues` (e `.errors` retorna `undefined`)
- **Fix:** Alterado para `(err as any).issues as Array<{message: string}> | undefined` com fallback para `err.message`
- **Files modified:** `apps/backend-ts/src/proactive/tools.ts`
- **Commit:** `5666d65`

**2. [Rule 1 - Bug] Tipo DrizzleDb muito específico impedia injeção em testes**
- **Found during:** Task 2 (GREEN) — `tsc --noEmit` mostrou erro de incompatibilidade de tipos ao passar `drizzle(sqlite, { schema })` dos testes para `RemindersRepository`
- **Issue:** `type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>` criava tipo acoplado ao schema completo; testes usando `drizzle(sqlite, { schema })` produziam `BetterSQLite3Database<Record<string,unknown>>`
- **Fix:** Alterado para `BetterSQLite3Database<any>` — mantem type safety nas operações Drizzle internas sem exigir schema específico no construtor
- **Files modified:** `apps/backend-ts/src/proactive/repository.ts`
- **Commit:** `5666d65`

### Pré-existentes (fora do escopo)

5 erros TypeScript em `src/mcp/tools/file-actions.ts` e `src/mcp/tools/memory.ts` — de planos anteriores à Phase 67. Registrados em `deferred-items.md`.

## Test Results

```
Test Files: 74 passed | 5 skipped (79)
Tests: 544 passed | 1 skipped | 31 todo (576)
```

Os 15 novos testes (6 repository + 9 tools) passam todos. Os 31 `todo` são stubs de outros planos da Wave 1 (scheduler, quiet-hours, folder-watcher, daily-summary, proactive.route, proactive IPC desktop, ProactiveSection).

## Known Stubs

Nenhum stub neste plano — toda a funcionalidade de repository e tools está implementada e testada. Os `it.todo()` dos outros arquivos (`scheduler.test.ts`, `quiet-hours.test.ts`, etc.) são de outros planos da Wave 1, não deste.

## Threat Surface Scan

- `createReminderTool`: Zod valida delayMs (int, positive, max 30 dias) e message (1–500 chars) antes de qualquer operação DB — T-67-01 mitigado.
- `RemindersRepository`: Drizzle usa queries parametrizadas (`db.insert(reminders).values({...})`) — T-67-04 aceito conforme threat model.
- `listRemindersTool`: output é lista numerada plain text, sem markup LLM-parseable; message truncada naturalmente em 500 chars pela criação — T-67-05 mitigado.

Nenhum novo endpoint de rede criado neste plano.

## Self-Check: PASSED

- FOUND: `apps/backend-ts/src/proactive/types.ts`
- FOUND: `apps/backend-ts/src/proactive/repository.ts`
- FOUND: `apps/backend-ts/src/proactive/tools.ts`
- FOUND: `createReminderTool|listRemindersTool|cancelReminderTool` em `session/tools.ts`
- FOUND: commits `7814ecf` e `5666d65` no histórico git
- FOUND: 544 testes passando, zero falhas
