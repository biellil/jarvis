---
phase: 67-jarvis-proativo
plan: 03
subsystem: proactive-scheduler
tags: [node-cron, event-emitter, quiet-hours, tdd, wave-1, sqlite, drizzle]
dependency_graph:
  requires:
    - 67-01 (node-cron instalado, schema reminders, stub tests)
    - 67-02 (RemindersRepository, types.ts com Reminder + ProactiveEvent)
  provides:
    - ProactiveScheduler class com bootstrap/fireReminder/cancelReminder/registerDailySummaryJob/updateQuietHours
    - proactiveEmitter EventEmitter singleton (subscrito pela SSE route em Plan 67-07)
    - quiet-hours.ts com isInQuietHours() cross-midnight + nextQuietEnd()
  affects:
    - apps/backend-ts/src/proactive/ (2 novos arquivos)
tech_stack:
  added: []
  patterns:
    - TDD Red→Green com vi.hoisted() para mocks de módulos com factories
    - Map<number, ScheduledTask> para gerenciamento de jobs com cleanup explícito
    - EventEmitter singleton module-scoped como ponte scheduler → SSE route
    - node-cron 4.x API: TaskOptions sem 'scheduled' (tasks criadas já ativas)
    - Idempotência via re-fetch + status check antes de qualquer mutação DB
key_files:
  created:
    - apps/backend-ts/src/proactive/scheduler.ts
    - apps/backend-ts/src/proactive/quiet-hours.ts
  modified:
    - apps/backend-ts/src/proactive/__tests__/scheduler.test.ts (stubs → testes reais)
decisions:
  - node-cron 4.x não aceita 'scheduled' em TaskOptions — tasks são criadas já agendadas (padrão da v4.x)
  - vi.hoisted() obrigatório para mocks com factories que referenciam variáveis externas — evita ReferenceError no hoisting do vi.mock
  - ProactiveScheduler.bootstrap() limpa o Map antes de re-popular — idempotente para chamadas repetidas (ex: hot-reload)
  - fireReminder usa re-fetch + check status='pending' antes de qualquer DB write (T-67-01 mitigação de double-fire)
  - quiet-hours habilitado via flag: ProactiveScheduler.updateQuietHours(enabled=true) necessário para quiet hours entrar em efeito
metrics:
  duration_seconds: 840
  completed_date: "2026-05-09"
  tasks_completed: 1
  files_created: 2
  files_modified: 1
---

# Phase 67 Plan 03: ProactiveScheduler — node-cron + Quiet Hours + EventEmitter

**One-liner:** ProactiveScheduler com node-cron 4.x, quiet hours cross-midnight (deferred status), proactiveEmitter singleton e 5 testes Vitest com vi.hoisted() mock isolation.

## Summary

Wave 1 do JARVIS Proativo implementa o motor de scheduling: o `ProactiveScheduler` que carrega reminders pendentes do SQLite no bootstrap, registra um cron job por reminder, e ao disparar verifica quiet hours — adiando ou emitindo o evento SSE via `proactiveEmitter`.

**O que foi feito:**

1. **proactive/scheduler.ts**: `ProactiveScheduler` com todos os métodos do plano:
   - `bootstrap()`: SELECT pending/deferred → limpa Map → registra jobs; idempotente
   - `registerJob(id, dueAtMs)`: constrói cron expression `M H D Mon *`; armazena task no Map
   - `fireReminder(id)`: re-fetch row + check status='pending'; se quiet → deferred+re-schedule; senão → fired+emit
   - `cancelReminder(id)`: destroy + delete do Map + UPDATE status='cancelled'
   - `registerDailySummaryJob(HH:MM)`: job recorrente `M H * * *`, chave -1 no Map
   - `updateQuietHours(enabled, start, end)`: atualiza config em runtime
   - `proactiveEmitter`: EventEmitter exportado para SSE route (Plan 67-07)

2. **proactive/quiet-hours.ts**: Funções utilitárias para quiet hours:
   - `isInQuietHours(now, startHHMM, endHHMM)`: lógica cross-midnight (`startMin > endMin` → OR; same-day → AND)
   - `nextQuietEnd(now, endHHMM)`: retorna hoje ou amanhã conforme se o horário de fim já passou

3. **scheduler.test.ts**: 5 testes reais (substituindo os stubs `it.todo()` do Plan 67-01):
   - bootstrap: 2 pending → 2 jobs
   - bootstrap: 1 deferred → 1 job (usando deferred_until)
   - fireReminder fora do quiet → status='fired' + proactiveEmitter.emit
   - fireReminder em quiet → status='deferred' + re-schedule + sem emit
   - cancelReminder → destroy() + status='cancelled' + jobCount=0

## Commits

| Task | Commit | Descrição |
|------|--------|-----------|
| RED+GREEN | `0589061` | ProactiveScheduler + quiet-hours + 5 testes passando |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] node-cron 4.x removeu `scheduled` de TaskOptions**
- **Found during:** Task 1 — `tsc --noEmit` retornou `error TS2353: Object literal may only specify known properties, and 'scheduled' does not exist in type 'TaskOptions'`
- **Issue:** O plano e o RESEARCH.md referenciavam `{ scheduled: true }` como opção do `cron.schedule()`, mas a API do node-cron 4.x mudou — tasks são criadas já agendadas por padrão e `TaskOptions` não inclui mais `scheduled`
- **Fix:** Removido `{ scheduled: true }` das duas chamadas a `cron.schedule()` em `scheduler.ts`
- **Files modified:** `apps/backend-ts/src/proactive/scheduler.ts`
- **Commit:** `0589061`

**2. [Rule 1 - Bug] vi.mock factories com variáveis externas causam ReferenceError**
- **Found during:** Task 1 (RED) — primeiro run dos testes falhou com `ReferenceError: Cannot access 'mockSchedule' before initialization`
- **Issue:** `vi.mock()` é hoisted automaticamente pelo Vitest antes das declarações `const mockX = vi.fn()`, causando acesso a variáveis não-inicializadas dentro da factory
- **Fix:** Migrado para `vi.hoisted()` — todas as variáveis mock declaradas dentro do bloco `vi.hoisted(() => {...})` que é executado antes do hoisting das factories
- **Files modified:** `apps/backend-ts/src/proactive/__tests__/scheduler.test.ts`
- **Commit:** `0589061`

## Test Results

```
Test Files  75 passed | 4 skipped (79)
     Tests  549 passed | 1 skipped | 26 todo (576)
```

Os 5 novos testes do scheduler passam todos. Os 26 `todo` são stubs de outros planos da Wave 1 (quiet-hours, folder-watcher, daily-summary, proactive.route, proactive IPC desktop, ProactiveSection).

## Known Stubs

- `generateAndEmitDailySummary()` em `scheduler.ts` é stub intencional — Plan 67-06 (DailySummaryGenerator) implementa o corpo. Não flui para UI rendering.

## Threat Surface Scan

- `fireReminder()`: re-fetch + `status === 'pending'` antes de qualquer mutação (T-67-01 mitigado conforme threat model)
- `proactiveEmitter`: module-scoped, acessível apenas à SSE route dentro do mesmo processo Express (T-67-02 aceito)
- Nenhum novo endpoint de rede criado neste plano

## Self-Check: PASSED

- FOUND: `apps/backend-ts/src/proactive/scheduler.ts`
- FOUND: `apps/backend-ts/src/proactive/quiet-hours.ts`
- FOUND: `export const proactiveEmitter` em scheduler.ts
- FOUND: `export class ProactiveScheduler` em scheduler.ts
- FOUND: commit `0589061` no histórico git
- FOUND: 549 testes passando, zero falhas
