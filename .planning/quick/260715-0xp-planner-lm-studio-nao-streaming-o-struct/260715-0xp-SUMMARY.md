---
phase: quick
plan: 260715-0xp
subsystem: agent
tags: [lm-studio, planner, structured-output, langgraph, streaming]

requires:
  - phase: quick-260715-07o
    provides: "generatePlan provider-aware jsonSchema override + provider threading via buildTaskGraph/ChatSession"
provides:
  - "createPlannerLLM(provider?, config?) — modelo dedicado não-streaming (streaming:false + maxTokens:512) para o planner quando LLM_PROVIDER=lmstudio"
  - "Threading plannerLlm de index.ts -> ChatSession -> buildTaskGraph -> generatePlan, com fallback para llm quando plannerLlm é undefined"
affects: [llm-factory, agent-graph, chat-session, backend-bootstrap]

tech-stack:
  added: []
  patterns:
    - "Dedicated non-streaming ChatOpenAI instance for planner-only calls, separate from the streaming llm used by the ReAct agent/executor"
    - "Optional undefined-for-non-target-providers pattern (plannerLlm ?? llm fallback) — mirrors provider threading already established in Quick 260715-07o"

key-files:
  created: []
  modified:
    - apps/backend-ts/src/llm/factory.ts
    - apps/backend-ts/src/agent/graph.ts
    - apps/backend-ts/src/session/chat-session.ts
    - apps/backend-ts/src/index.ts
    - apps/backend-ts/src/llm/factory.test.ts
    - apps/backend-ts/src/agent/__tests__/graph.test.ts

key-decisions:
  - "plannerLlm undefined para todos os providers != lmstudio, em vez de duplicar a instância do llm principal — tipagem mais limpa e zero criação de objeto extra para providers cloud"
  - "maxTokens: 512 é cinto de segurança contra geração infinita sob constraints de schema (bug conhecido do tracker do LM Studio), não um limite de tamanho de plano esperado"
  - "cfg.USE_LM_STUDIO_STREAMING_EVENTS é ignorado dentro de createPlannerLLM — o planner nunca precisa de streaming, independente desse flag"

patterns-established:
  - "Segundo modelo LLM dedicado por finalidade (planner vs executor/token-stream) construído uma única vez no boot e injetado via opts, seguindo o mesmo padrão de threading do provider ativo (260715-07o)"

requirements-completed: []

coverage:
  - id: D1
    description: "createPlannerLLM retorna ChatOpenAI streaming:false + maxTokens:512 para lmstudio, undefined para os demais providers"
    verification:
      - kind: unit
        ref: "apps/backend-ts/src/llm/factory.test.ts#createPlannerLLM (Quick 260715-0xp)"
        status: pass
    human_judgment: false
  - id: D2
    description: "buildTaskGraph usa plannerLlm (quando fornecido) no node planner; cai de volta em llm quando plannerLlm é omitido"
    verification:
      - kind: unit
        ref: "apps/backend-ts/src/agent/__tests__/graph.test.ts#plannerLlm threading (Quick 260715-0xp)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Turno agêntico real com LM Studio completa a geração do plano sem travar (hang de SSE vazio corrigido)"
    verification: []
    human_judgment: true
    rationale: "Toda a cobertura automatizada deste plano usa mocks, sem dependência de rede — smoke test manual contra o LM Studio real é recomendado mas não bloqueante, conforme success_criteria do PLAN.md"

duration: 4min
completed: 2026-07-15
status: complete
---

# Quick 260715-0xp: Planner LM Studio não-streaming Summary

**createPlannerLLM() em llm/factory.ts fornece um ChatOpenAI dedicado não-streaming (maxTokens:512) para o node planner quando LLM_PROVIDER=lmstudio, corrigindo o hang de SSE vazio causado por `json_schema` + streaming — zero mudança para os demais providers.**

## Performance

- **Duration:** ~4 min (commits: 00:55:23 → 00:56:47, -03:00)
- **Tasks:** 2 (ambas TDD)
- **Files modified:** 6

## Accomplishments
- `createPlannerLLM(provider?, config?)` exportada de `llm/factory.ts` — retorna `ChatOpenAI` com `streaming: false` e `maxTokens: 512` para `'lmstudio'`; `undefined` para `openai`/`anthropic`/`gemini`/`openrouter`
- Threading ponta-a-ponta: `index.ts` constrói `plannerLlm` uma única vez no boot → `ChatSession.create({ plannerLlm })` → `getOrCreateAgenticGraph()` repassa `plannerLlm: this._plannerLlm` → `buildTaskGraph` → node `'planner'` chama `generatePlan(args.plannerLlm ?? args.llm, ...)`
- Fallback preservado: quando `plannerLlm` é omitido (todo o test suite pré-existente, e todos os providers != lmstudio em produção), o comportamento é byte-idêntico ao pré-fix
- 7 novos testes cobrindo os dois branches (5 em `factory.test.ts`, 2 em `graph.test.ts`)

## Task Commits

1. **Task 1: createPlannerLLM em factory.ts + threading via graph.ts, chat-session.ts e index.ts** - `3856a65` (fix)
2. **Task 2: Testes dedicados de createPlannerLLM e do threading plannerLlm em buildTaskGraph** - `5dda756` (test)

_Nenhuma tarefa TDD teve commits separados de RED/GREEN — cada task já incluía implementação/testes correspondentes ao seu próprio escopo (Task 1 é o fix threading, Task 2 é a cobertura de teste dedicada), conforme decomposição do PLAN.md._

## Files Created/Modified
- `apps/backend-ts/src/llm/factory.ts` - nova função `createPlannerLLM`, reaproveita `ChatOpenAI` já importado
- `apps/backend-ts/src/agent/graph.ts` - `BuildTaskGraphArgs.plannerLlm?` + node `'planner'` usa `args.plannerLlm ?? args.llm`
- `apps/backend-ts/src/session/chat-session.ts` - `ChatSessionOptions.plannerLlm?`, campo privado `_plannerLlm`, novo parâmetro de constructor, repassado em `getOrCreateAgenticGraph()`
- `apps/backend-ts/src/index.ts` - importa `createPlannerLLM`, constrói `plannerLlm` a partir do `llmConfig` já carregado, injeta em `ChatSession.create({...})`
- `apps/backend-ts/src/llm/factory.test.ts` - `describe('createPlannerLLM (Quick 260715-0xp)')` com 5 casos
- `apps/backend-ts/src/agent/__tests__/graph.test.ts` - `describe('plannerLlm threading (Quick 260715-0xp)')` com 2 casos

## Decisions Made
- **`plannerLlm` undefined-para-não-lmstudio** em vez de construir uma segunda instância idêntica ao `llm` principal para providers cloud — tipagem mais limpa (o fallback `args.plannerLlm ?? args.llm` no node planner já cobre o caso), zero overhead de criação de objeto para providers que não precisam do fix
- **`maxTokens: 512` como cinto de segurança**, não como limite funcional de tamanho de plano — mitiga diretamente o bug reportado no tracker do LM Studio (geração infinita sob constraints de schema quando `maxTokens` não é definido)
- **`cfg.USE_LM_STUDIO_STREAMING_EVENTS` ignorado** dentro de `createPlannerLLM` — o planner nunca precisa de streaming nativo, independente desse flag (que só afeta o `llm` principal usado pelo executor/token streaming)

## Deviations from Plan

None - plan executado exatamente como escrito.

## Issues Encountered

Nenhum. A implementação seguiu o `<action>` do PLAN.md linha a linha; único ponto de atenção foi confirmar que as 2 falhas pré-existentes de `chat-session.test.ts` (contagem de tools 14vs16 / 15vs17) permaneceram idênticas após as mudanças — confirmado.

## Resultado dos testes

```
cd apps/backend-ts
npx vitest run src/llm/factory.test.ts src/agent/__tests__/graph.test.ts \
  src/agent/__tests__/planner.test.ts src/agent/__tests__/executor.test.ts \
  src/agent/__tests__/approval.test.ts src/session/chat-session.test.ts

Test Files  1 failed | 5 passed (6)
     Tests  2 failed | 101 passed (103)
```

As 2 falhas são as já conhecidas e documentadas em `260715-07o-SUMMARY.md` (contagem de tools em `chat-session.test.ts`, `toHaveLength(14)` recebe 16 / `toHaveLength(15)` recebe 17) — confirmadas pré-existentes e fora de escopo deste fix (não relacionadas a `plannerLlm`/threading). Todos os 101 demais testes passam, incluindo os 7 novos (5 em `factory.test.ts` + 2 em `graph.test.ts`).

`npx tsc --noEmit`: sem erros, em ambas as rodadas (após Task 1 e após Task 2).

### Suíte completa do backend-ts (`npx vitest run`, sem filtro)

```
Test Files  6 failed | 59 passed (65)
     Tests  12 failed | 514 passed | 1 skipped | 1 todo (528)
```

Os 12 testes que falham estão em `test/session/pc-tools.test.ts`, `test/session/tool-dispatch.test.ts` e `test/memory/manager-context.test.ts` — nenhum desses arquivos (nem os arquivos fonte que testam: `pc-tools.ts`, `tool-dispatch.ts`, `memory/manager.ts`) foi tocado por este plano. Confirmado via `git log` que a última modificação desses arquivos foi na Phase 94 (commits `c7d7f5a`, `484a4f1`, `913c932`), muito antes deste quick task — pré-existentes, fora de escopo, não corrigidos (scope boundary das deviation rules).

## Next Phase Readiness

Fix pronto para uso em produção com `LLM_PROVIDER=lmstudio`. Smoke test manual opcional recomendado (não bloqueante) contra um LM Studio real do usuário para confirmar que o hang de SSE vazio não ocorre mais em um turno agêntico completo.

---
*Quick task: 260715-0xp*
*Completed: 2026-07-15*

## Self-Check: PASSED

- `apps/backend-ts/src/llm/factory.ts` — FOUND
- `apps/backend-ts/src/agent/graph.ts` — FOUND
- `apps/backend-ts/src/session/chat-session.ts` — FOUND
- `apps/backend-ts/src/index.ts` — FOUND
- `apps/backend-ts/src/llm/factory.test.ts` — FOUND
- `apps/backend-ts/src/agent/__tests__/graph.test.ts` — FOUND
- Commit `3856a65` — FOUND
- Commit `5dda756` — FOUND
