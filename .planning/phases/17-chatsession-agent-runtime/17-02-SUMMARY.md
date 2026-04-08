---
phase: 17-chatsession-agent-runtime
plan: 02
subsystem: backend-ts/session
tags: [agent-runtime, langgraph, tool-calling, react-agent, memory]
requires:
  - 17-01  # ChatSession skeleton + SYSTEM_PROMPT
  - 16     # MemoryManager.buildContext()
provides:
  - "ChatSession.send() via createReactAgent"
  - "createRecallMemoryTool(memory) factory"
affects:
  - apps/backend-ts/src/session/chat-session.ts
  - apps/backend-ts/src/session/tools.ts
tech-stack:
  added:
    - "@langchain/langgraph@1.2.8"
  patterns:
    - "Agent runtime via createReactAgent(llm, tools, prompt)"
    - "Tool factory bound to MemoryManager instance"
    - "vi.mock do módulo @langchain/langgraph/prebuilt para testar ciclo ReAct sem LLM real"
key-files:
  created:
    - apps/backend-ts/src/session/tools.ts
    - apps/backend-ts/src/session/tools.test.ts
  modified:
    - apps/backend-ts/src/session/chat-session.ts
    - apps/backend-ts/src/session/chat-session.test.ts
    - apps/backend-ts/src/session/index.ts
    - apps/backend-ts/package.json
decisions:
  - "history vira mutável: `this.history = result.messages` para refletir a cadeia ReAct completa (inclui ToolMessage)"
  - "extractFinalAiText ignora AIMessages intermediárias com tool_calls pendentes"
  - "Tool captura erros de buildContext e retorna string pt-BR (não propaga) para não travar o loop do agente"
  - "Fallback em pt-BR 'Nenhuma memória relevante encontrada.' quando buildContext devolve string vazia"
metrics:
  duration: "~15min"
  tasks: 2
  files: 6
  completed: 2026-04-08
---

# Phase 17 Plan 02: ChatSession + ReAct Agent Runtime Summary

**One-liner:** ChatSession agora roteia `send()` por `createReactAgent` de `@langchain/langgraph` com uma tool real `recall_memory` que delega para `MemoryManager.buildContext()`, exercitando o loop Reason→Act→Observe ponta-a-ponta.

## What Changed

- **`@langchain/langgraph@1.2.8`** instalado em `apps/backend-ts`. Dedupe de `@langchain/core` confirmado: uma única versão `1.1.39` via `pnpm ls`.
- **`src/session/tools.ts`** — novo: `createRecallMemoryTool(memory)` usando `tool()` de `@langchain/core/tools` + `z.object({ query: z.string() })`. Descrição em pt-BR (decisão do CONTEXT — LM Studio local é sensível ao idioma da description). Três branches: contexto populado → retorna; vazio → `"Nenhuma memória relevante encontrada."`; erro → `"Erro ao buscar memórias: <msg>"`. Nunca propaga throw.
- **`src/session/chat-session.ts`** — refactor: `create()` constrói o agent uma vez via `createReactAgent({ llm, tools: [recallMemoryTool], prompt: SYSTEM_PROMPT })` e guarda em `this._agent`. `send()` agora faz `this._agent.invoke({ messages: this.history })`, substitui `this.history` por `result.messages` (inclui SystemMessage, HumanMessage, AIMessage com `tool_calls`, ToolMessage, AIMessage final), e extrai a última `AIMessage` sem `tool_calls` como resposta final. Persistência via `memory.saveTurn()` mantida em try/catch warn-only.
- **`extractFinalAiText()`** — helper local que varre `messages` de trás pra frente procurando a última `AIMessage` sem `tool_calls` pendentes. Evita retornar uma mensagem intermediária que era só "vou chamar recall_memory".
- **`session/index.ts`** — reexporta `createRecallMemoryTool`.

## Mock de `createReactAgent` nos testes

Para testar o ciclo ReAct sem subir LLM real, `chat-session.test.ts` usa `vi.mock('@langchain/langgraph/prebuilt', ...)` no topo do arquivo. O mock:

1. Exporta um `createReactAgent` que é um `vi.fn((args) => ({ invoke: agentInvokeSpy }))`.
2. `agentInvokeSpy` delega para uma variável mutável `agentInvokeImpl` que cada teste sobrescreve.
3. No teste do ciclo ReAct completo, `agentInvokeImpl` **recupera a tool real** passada a `createReactAgent` via `createReactAgentMock.mock.calls[0]![0].tools[0]`, invoca essa tool de dentro do stub (`await recallTool.invoke({ query: 'café' })`), e retorna a cadeia `[...input.messages, AIMessage(tool_call), ToolMessage(observation), AIMessage(final)]`.

Isso dá verificação real de que: (a) `memory.buildContext` é chamado via tool-calling, (b) `extractFinalAiText` pula a `AIMessage` intermediária, (c) `history` contém a cadeia completa após `send()`, (d) `saveTurn` recebe o texto final (não o intermediário).

Alternativa descartada: mockar o `BaseChatModel` pra emitir `tool_calls` e deixar o `createReactAgent` real rodar. Isso exigiria emular a interface de bind tools + AgentState do langgraph — muito acoplamento pra ganho pequeno em teste unit. Mock do módulo é cirúrgico e documenta claramente o contrato que usamos (`invoke({ messages }) → { messages }`).

## Decisão: `this.history = result.messages`

O Python mantinha `self.history` apendando uma mensagem por vez. Aqui trocamos por **substituição total** com o array que o agent devolve. Por quê:

- O agent **já acumulou** toda a cadeia ReAct (incluindo ToolMessage) dentro de `result.messages`. Se apendássemos só a final, perderíamos a observação da tool — o próximo turn esqueceria que a tool foi chamada e o agent podia chamar de novo.
- `result.messages` inclui a `SystemMessage` original, então não há risco de perder o system prompt.
- Single-user, single-session, histórico sem compressão (decisão CONTEXT): substituir é mais simples que fazer diff.

Como consequência, `history` deixou de ser `readonly`. `ChatSession.history` é agora `public history: BaseMessage[]` (sem `readonly`).

## Verification

```
pnpm --filter @jarvis/backend-ts vitest run src/session/
# Test Files  2 passed (2)
# Tests       13 passed (13)

pnpm --filter @jarvis/backend-ts vitest run
# Test Files  11 passed (11)
# Tests       78 passed (78)

pnpm --filter @jarvis/backend-ts exec tsc --noEmit
# (zero errors)

pnpm --filter @jarvis/backend-ts ls @langchain/core
# @langchain/core 1.1.39  (single version — langgraph aligned)
```

## Must-Haves Check

- [x] Tool `recall_memory(query)` delega para `memory.buildContext(query)` ✅
- [x] ChatSession usa `createReactAgent` ao invés de `llm.invoke` direto ✅
- [x] Agent consegue invocar a tool durante o ciclo ReAct (smoke test com mock) ✅
- [x] Fallback pt-BR quando buildContext vazio ✅
- [x] History é `BaseMessage[]` e cresce com as mensagens (incluindo ToolMessage) ✅

## Deviations from Plan

None — plano executado exatamente como escrito.

## Commits

- `84818d5` — ✨ feat(17-02): adiciona tool recall_memory com testes
- (this commit) — ✨ feat(17-02): integra createReactAgent e tool recall_memory na ChatSession

## Self-Check: PASSED

- apps/backend-ts/src/session/tools.ts — FOUND
- apps/backend-ts/src/session/tools.test.ts — FOUND
- apps/backend-ts/src/session/chat-session.ts — FOUND (modified)
- apps/backend-ts/src/session/chat-session.test.ts — FOUND (modified)
- apps/backend-ts/src/session/index.ts — FOUND (modified)
- Commit 84818d5 — FOUND
- 78/78 testes passando, typecheck limpo
