---
phase: 67-jarvis-proativo
plan: 06
subsystem: proactive
tags: [langchain, sqlite, drizzle, tdd, llm, daily-summary, pt-BR]

dependency_graph:
  requires:
    - phase: 67-01
      provides: tabela reminders no schema Drizzle, estrutura src/proactive/
    - phase: 67-03
      provides: ProactiveScheduler com stub generateAndEmitDailySummary + proactiveEmitter
  provides:
    - buildSummaryContext() — coleta 24h mensagens/ações/lembretes do SQLite
    - buildDailySummaryPrompt() — prompt D-16 pt-BR puro, testável isoladamente
    - generateDailySummary() — chamada LLM com fallback pt-BR gracioso
    - ProactiveScheduler.setLlm() — injeção de LLM para o scheduler
    - ProactiveScheduler.generateAndEmitDailySummary() — impl real substituindo stub
  affects:
    - 67-07 (index.ts wire: ProactiveScheduler.setLlm(session.llm) após ChatSession.create())

tech-stack:
  added: []
  patterns:
    - "Função pura buildDailySummaryPrompt exportada separadamente para testabilidade sem LLM"
    - "Injeção de LLM via ProactiveScheduler.setLlm() — static singleton, wired em index.ts"
    - "basename(path) em actionsSummary — mitiga T-67-05 (path traversal via prompt injection)"
    - "try/catch global em generateDailySummary — nunca lança, sempre retorna string pt-BR"

key-files:
  created:
    - apps/backend-ts/src/proactive/summary-generator.ts
  modified:
    - apps/backend-ts/src/proactive/__tests__/daily-summary.test.ts
    - apps/backend-ts/src/proactive/scheduler.ts

key-decisions:
  - "buildDailySummaryPrompt exportada como função pura separada de generateDailySummary para testabilidade sem mock de LLM"
  - "Horário dos lembretes formatado via getHours()/getMinutes() (timezone local do usuário) — correto para assistente pessoal"
  - "basename(path) em actionsSummary implementado conforme T-67-05 — paths completos não entram no prompt"
  - "ProactiveScheduler.setLlm() estático — Plan 67-07 chama após ChatSession.create() em index.ts"
  - "generateAndEmitDailySummary() verifica llm !== null antes de gerar — skip gracioso com warn se não wired"

patterns-established:
  - "summary-generator: funções exportadas puras + generateDailySummary async com try/catch global"
  - "Teste de horário timezone-aware: usar due.getHours() no test (igual à implementação) em vez de hardcode UTC"

requirements-completed:
  - PROACT-06

duration: 12min
completed: "2026-05-09"
---

# Phase 67 Plan 06: Daily Summary Generator

**`buildSummaryContext` + `generateDailySummary` com prompt D-16 pt-BR, query 24h SQLite e fallback gracioso em falha de LLM**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-09T23:16:00Z
- **Completed:** 2026-05-09T23:18:44Z
- **Tasks:** 2 (RED + GREEN, TDD)
- **Files modified:** 3

## Accomplishments

- `buildSummaryContext(db, now)`: consulta sincronizada (better-sqlite3) de mensagens user (24h, max 20, truncado 100 chars), ações do actions_log (24h, basename apenas), lembretes pendentes (lookahead 24h), com fallbacks pt-BR em listas vazias
- `buildDailySummaryPrompt(ctx)`: função pura com prompt D-16 completo em pt-BR — 3-5 frases, tom informal, sem bullets
- `generateDailySummary(llm, ctx)`: chamada `llm.invoke([new HumanMessage(prompt)])` com try/catch global, retorna `'Não consegui gerar o resumo diário neste horário.'` em qualquer falha
- `ProactiveScheduler.setLlm()` + `generateAndEmitDailySummary()` stub substituído por implementação real que emite `ProactiveEvent { kind: 'daily_summary' }` via `proactiveEmitter`
- 9 testes passando (suite completa: 558 passed, 0 regressões)

## Task Commits

1. **RED: testes failing** — `9f47d73` (test)
2. **GREEN: implementação + scheduler update** — `8269744` (feat)

## Files Created/Modified

- `apps/backend-ts/src/proactive/summary-generator.ts` — buildSummaryContext, buildDailySummaryPrompt, generateDailySummary (criado)
- `apps/backend-ts/src/proactive/__tests__/daily-summary.test.ts` — 9 testes reais substituindo stubs it.todo()
- `apps/backend-ts/src/proactive/scheduler.ts` — imports de summary-generator, setLlm(), generateAndEmitDailySummary() implementado

## Decisions Made

- `buildDailySummaryPrompt` exportada como função pura separada de `generateDailySummary` — permite testar o prompt sem mock de LLM; padrão estabelecido para futuras gerações de prompt
- Horário dos lembretes via `getHours()`/`getMinutes()` (timezone local do processo) em vez de UTC — correto para um assistente pessoal usado no desktop do usuário
- `basename(path)` em `actionsSummary` aplicado conforme T-67-05 do threat model — paths completos não entram no prompt LLM, prevenindo exfiltração de estrutura de diretórios
- `ProactiveScheduler.setLlm()` como static setter — Plan 67-07 faz a wire em `index.ts` após `ChatSession.create()`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Teste de horário hardcoded em UTC quebrando em ambiente com timezone local**
- **Found during:** GREEN — primeiro run dos testes
- **Issue:** `new Date('2026-05-09T14:00:00Z')` + assert `/14:00/` falhou porque `getHours()` retorna hora local (11:00 no BR/UTC-3)
- **Fix:** Teste passou a calcular `expectedTime` dinamicamente via `due.getHours()`/`due.getMinutes()` (idêntico à implementação), validando o comportamento timezone-aware correto
- **Files modified:** `apps/backend-ts/src/proactive/__tests__/daily-summary.test.ts`
- **Verification:** 9/9 testes passando
- **Committed in:** `8269744` (feat commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug no teste de timezone)
**Impact on plan:** Fix necessário para comportamento correto em qualquer timezone. Sem scope creep.

## Issues Encountered

Nenhum bloqueador. O suite completo do backend-ts tem 1 falha pré-existente (`folder-watcher.test.ts` — módulo `folder-watcher.js` ainda não implementado, scope do Plan 67-04/05), sem relação com este plano.

## Known Stubs

Nenhum. `ProactiveScheduler.generateAndEmitDailySummary()` stub foi substituído por implementação real. Plan 67-07 ainda precisa chamar `ProactiveScheduler.setLlm(session.llm)` em `index.ts`.

## Threat Surface Scan

Nenhum novo endpoint de rede criado. Mitigação T-67-05 aplicada: `basename(path)` em `actionsSummary` evita exfiltração de paths completos no prompt LLM. Dados de mensagens truncados em 100 chars (prevenção de prompt stuffing).

## Next Phase Readiness

- Plan 67-07 pode agora importar `generateDailySummary` e wired `ProactiveScheduler.setLlm(session.llm)` após `ChatSession.create()` em `index.ts`
- `proactiveEmitter` já emite `{ kind: 'daily_summary', text, generatedAt }` — Plan 67-05 (SSE route) pode consumir sem mudanças

## Self-Check: PASSED

---
*Phase: 67-jarvis-proativo*
*Completed: 2026-05-09*
