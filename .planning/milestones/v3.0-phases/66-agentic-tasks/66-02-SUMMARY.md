---
phase: 66-agentic-tasks
plan: "02"
subsystem: agent
tags: [agentic-tasks, langgraph, planner, executor, graph, wave-1, tdd]
dependency_graph:
  requires:
    - "66-01 — Plan, TaskSseEvent, ResumeCommand, StepResult, planSchema types"
  provides:
    - "generatePlan(llm, userInput, options?) → Promise<Plan> via withStructuredOutput(planSchema)"
    - "PLANNER_SYSTEM_PROMPT — pt-BR planner instructions constant"
    - "runExecutorNode(reactAgent, state, config) → Partial<ExecutorState> | Command"
    - "generateFinalSummary(reactAgent, plan, results) → Promise<string>"
    - "extractFinalAiText(messages) → string"
    - "buildTaskGraph({llm, executorAgent}) → compiled StateGraph"
    - "TaskStateAnnotation — 6 channels with explicit reducers"
    - "taskCheckpointer — MemorySaver singleton"
    - "newTaskThreadId(chatSessionId) → string"
    - "createMockChatModel<T>(options) — test fixture"
  affects:
    - apps/backend-ts/src/agent/
tech_stack:
  added: []
  patterns:
    - "withStructuredOutput(planSchema) para geração estruturada de plano sem hardcode de schema duplicado"
    - "interrupt() + Command(resume) para human-in-the-loop — padrão LangGraph 1.x nativo"
    - "Annotation.Root com reducer (_, x) => x em canais single-value (Pitfall 8 mitigation)"
    - "HumanMessage por step em vez de SystemMessage — evita colisão de system prompt (Pitfall 5)"
    - "vi.mock('@langchain/langgraph') para controlar retorno de interrupt() nos testes de executor"
    - "StreamMode[] (mutable) em vez de as const — satisfaz tipagem do LangGraph 1.2.8"
key_files:
  created:
    - apps/backend-ts/src/agent/planner.ts
    - apps/backend-ts/src/agent/executor.ts
    - apps/backend-ts/src/agent/graph.ts
    - apps/backend-ts/src/agent/__tests__/fixtures/mockChatModel.ts
  modified:
    - apps/backend-ts/src/agent/__tests__/planner.test.ts
    - apps/backend-ts/src/agent/__tests__/executor.test.ts
    - apps/backend-ts/src/agent/__tests__/graph.test.ts
decisions:
  - "generateFinalSummary usa o mesmo reactAgent (não uma chamada separada ao LLM planner) — agente já tem SYSTEM_PROMPT e contexto pt-BR correto"
  - "executor.ts redefine ReactAgentLike localmente para isolamento de módulo — plan 03 usa cast quando integrar com ChatSession"
  - "extractFinalAiText duplicado em executor.ts (não importado de chat-session.ts) — isolamento intencional, evita acoplamento antes da integração em plan 03"
  - "streamMode como StreamMode[] mutable em graph.test.ts — LangGraph 1.2.8 não aceita readonly tuple no parâmetro streamMode"
  - "Command.goto é array internamente no LangGraph 1.2.8 — testes usam extração de primeiro elemento para assertar"
  - "Erros de TypeScript pré-existentes em src/mcp/tools/ são out-of-scope (já existiam em 029b645, não introduzidos por este plano)"
metrics:
  duration: "~45 min"
  completed: "2026-05-09"
  tasks_completed: 3
  files_created: 4
  files_modified: 3
---

# Phase 66 Plan 02: Wave 1 — Módulo Agent (planner + executor + graph)

Wave 1 implementa o coração agentic do JARVIS: geração estruturada de plano via Zod + withStructuredOutput, loop de execução por step com cancel-gate + AbortSignal, interrupt para confirmação e step-failure, e o StateGraph completo com MemorySaver.

## Summary

Implementados 3 arquivos de produção em `apps/backend-ts/src/agent/`: `planner.ts` (generatePlan via withStructuredOutput + D-07 edit-feedback re-prompt), `executor.ts` (runExecutorNode com D-13 cancel-gate, D-16 step-failure interrupt em 3 branches, D-11 outputSummary 80-char cap), e `graph.ts` (StateGraph planner→executor + D-02 plan-confirmation interrupt + MemorySaver singleton + thread_id factory). Fixture `mockChatModel.ts` reutilizável. 45 testes passando.

## Files Created

| File | Purpose |
|------|---------|
| `apps/backend-ts/src/agent/planner.ts` | generatePlan com withStructuredOutput(planSchema) + PLANNER_SYSTEM_PROMPT pt-BR + editFeedback re-prompt (D-07) |
| `apps/backend-ts/src/agent/executor.ts` | runExecutorNode: cancel-gate (D-13), AbortSignal threading (D-13), step-failure interrupt (D-16), task:* SSE events (D-10/D-11), generateFinalSummary |
| `apps/backend-ts/src/agent/graph.ts` | buildTaskGraph, TaskStateAnnotation (6 channels), taskCheckpointer (MemorySaver singleton), newTaskThreadId |
| `apps/backend-ts/src/agent/__tests__/fixtures/mockChatModel.ts` | createMockChatModel<T> reusável para planner/executor/graph tests |

## Test Counts

| File | Tests | Coverage |
|------|-------|----------|
| `planner.test.ts` | 8 passing | generatePlan: invoca withStructuredOutput, editFeedback prompt, propagação de erro, validação de campos |
| `executor.test.ts` | 12 passing | cancel-gate×3, signal threading, step-start/end order, step-failure×3 (continue/replan/abort), task:done, 80-char clamp |
| `graph.test.ts` | 13 passing | build methods, plan-confirmation interrupt, confirm/cancel/edit resume, AGENT-01 e2e 3-steps, AGENT-04 cancelRequested, thread_id factory×2, MemorySaver deleteThread, Annotation overwrite reducer |
| `keywords.test.ts` | 12 passing (Wave 0, não modificado) | - |
| **Total** | **45 passing, 1 todo** | - |

## Decision Coverage

| Decision | Status |
|----------|--------|
| D-01 (grafo LangGraph 3 nós) | Implementado — planner + executor + interrupt intermediário |
| D-02 (interrupt + Command resume) | Implementado + testado (confirm/cancel/edit) |
| D-03 (MemorySaver + channels) | Implementado — MemorySaver singleton, 6 Annotation channels |
| D-04 (executor reusa createReactAgent) | Implementado — ReactAgentLike interface; integração real em Plan 03 |
| D-05 (planSchema Zod) | Implementado — withStructuredOutput(planSchema) |
| D-07 (edit-loop re-prompt) | Implementado — editFeedback no prompt + previousPlan context |
| D-08 (TTS sumário) | Implementado parcialmente — generateFinalSummary produz texto; TTS call em Plan 03/04 |
| D-10 (SSE events via writer) | Implementado — task:plan, task:step:start/end, task:cancelled, task:done, task:error, task:edit-loop |
| D-11 (outputSummary ≤80 chars) | Implementado — clampSummary com truncation + ellipsis |
| D-13 (cancel-gate + AbortSignal) | Implementado — cancelRequested + signal.aborted antes de cada step + AbortError handler |
| D-16 (step-failure interrupt 3 branches) | Implementado — continue/replan/abort com Command({goto:'planner'}) no replan |
| D-17 (ToolLogger taskId/stepId) | Parcialmente — configurable.taskId/stepId passados ao reactAgent.invoke; integração com DispatchContext em Plan 03 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Command.goto é array no LangGraph 1.2.8**
- **Found during:** Task 3 (executor.test.ts replan assertion)
- **Issue:** LangGraph 1.2.8 normaliza `goto` para array internamente (`['planner']` em vez de `'planner'`). Testes que assertavam `cmd.goto === 'planner'` falhavam.
- **Fix:** Extração de primeiro elemento no teste: `const gotoVal = Array.isArray(cmd.goto) ? cmd.goto[0] : cmd.goto`
- **Files modified:** `apps/backend-ts/src/agent/__tests__/executor.test.ts`

**2. [Rule 1 - Bug] generateFinalSummary reutiliza reactAgent — chamadas extra no invoke spy**
- **Found during:** Task 2 (executor.test.ts testes de threading e continue)
- **Issue:** Testes assertavam `agent.invoke` chamado N vezes mas `generateFinalSummary` adiciona 1 chamada extra após steps bem-sucedidos.
- **Fix:** Testes ajustados para contar chamadas corretamente (N+1 para os casos com steps bem-sucedidos)
- **Files modified:** `apps/backend-ts/src/agent/__tests__/executor.test.ts`

**3. [Rule 1 - Bug] StreamMode readonly tuple incompatível com LangGraph 1.2.8**
- **Found during:** Task 3 (TypeScript check)
- **Issue:** `streamMode: ['custom'] as const` produz `readonly ["custom"]` que TypeScript rejeita na assinatura `StreamMode[]` do LangGraph.
- **Fix:** Extraído `const CUSTOM_STREAM: StreamMode[] = ['custom']` como constante mutable no topo do arquivo de teste.
- **Files modified:** `apps/backend-ts/src/agent/__tests__/graph.test.ts`

## Known Stubs

Nenhum — todos os arquivos de produção implementam funcionalidade real. `extractFinalAiText` está duplicado em `executor.ts` (vs `chat-session.ts:486`) intencionalmente para isolamento de módulo antes da integração em Plan 03.

## Threat Flags

Nenhum — todos os arquivos criados são módulos internos sem novos endpoints de rede. Superfície de segurança não aumentada neste plano.

## Self-Check: PASSED

```
apps/backend-ts/src/agent/planner.ts                       — FOUND
apps/backend-ts/src/agent/executor.ts                      — FOUND
apps/backend-ts/src/agent/graph.ts                         — FOUND
apps/backend-ts/src/agent/__tests__/fixtures/mockChatModel.ts — FOUND
Commits:
  10bb744 — FOUND (planner + fixture)
  7049237 — FOUND (executor)
  cd9ae54 — FOUND (graph)
Backend vitest agent suite: 45 passing, 1 todo, 0 fail
TypeScript: 0 erros em src/agent/ (erros pré-existentes em src/mcp/tools/ out-of-scope)
```
