---
phase: 18-pc-tools-backend
plan: 04
subsystem: backend-ts/session + routes
tags: [sse, streaming, langgraph, tool-dispatch, chat-session]
requirements: [TOOL-TS-09]
requires:
  - 18-03 (tool-dispatch wrapper + setDispatchListener/clearDispatchListener na ChatSession)
  - 17-02 (ChatSession com createReactAgent)
provides:
  - sendStream roteado via agent.stream({streamMode:'messages'}) — tools invocadas durante stream
  - GET /chat/stream emite `event: action\ndata: {...}\n\n` quando PC tools são dispatchadas
  - Payload snake_case no wire (tool_call_id, requires_confirmation) para paridade Python
affects:
  - apps/backend-ts/src/session/chat-session.ts
  - apps/backend-ts/src/routes/chat.ts
tech-stack:
  - "@langchain/langgraph 1.2.x (agent.stream streamMode messages)"
  - "@langchain/core 1.1.x (AIMessageChunk)"
key-files:
  modified:
    - apps/backend-ts/src/session/chat-session.ts
    - apps/backend-ts/src/routes/chat.ts
    - apps/backend-ts/src/session/chat-session.test.ts
    - apps/backend-ts/src/routes/chat.test.ts
  created:
    - apps/backend-ts/test/session/chat-session-stream.test.ts
    - apps/backend-ts/test/routes/chat-sse-action.test.ts
decisions:
  - "sendStream refatorado (Opção A do plano), não duplicado em sendStreamAgent"
  - "History pós-stream guarda apenas AIMessage final montada — ToolMessages internas ficam no audit log SQLite"
  - "Field mapping snake_case no wire (tool_call_id, requires_confirmation), camelCase internamente"
metrics:
  tasks_completed: 2
  tests_total: 225
  tests_added: 9
  files_created: 2
  files_modified: 4
  completed: 2026-04-08
---

# Phase 18 Plan 04: SSE Action Events Summary

Stream do `GET /chat/stream` agora roteia pelo agent ReAct via `agent.stream({streamMode:'messages'})` e emite `event: action` em tempo real sempre que uma PC tool é dispatchada, permitindo ao cliente Electron (Fase 18.5) executar ações no exato momento em que o LLM decide chamá-las.

## What Was Built

### Task 1 — `sendStream` via `agent.stream` (streamMode messages)

`ChatSession.sendStream` antes chamava `llm.stream(history)` direto, pulando o agent ReAct e portanto impossibilitando tool calling durante stream. Agora chama `this._agent.stream({messages: this.history}, {streamMode: 'messages'})`, que emite tuplas `[message, metadata]` onde `message` pode ser `AIMessageChunk` (token incremental) ou outros tipos (ToolMessage, AIMessage com tool_calls).

Filtragem: só `AIMessageChunk` não-vazio vira `yield` de token. Tool calls acontecem internamente no loop do agent — o wrapper do plano 18-03 (`wrapAllPcTools`) intercepta a invocação, grava no audit log (`ToolLogger.logDispatch`), e chama o `OnToolDispatched` listener se houver um registrado.

**Trade-off documentado:** o `history` pós-stream guarda apenas `HumanMessage(text)` + `AIMessage(assembled)`, sem preservar tool_calls do turno nem ToolMessages de observação. A fonte da verdade para invocações durante stream é a tabela `tool_calls` do SQLite (audit log). Isso é aceitável em v1.3 porque (a) o próximo turno ainda tem o histórico textual suficiente pro agent responder coerente e (b) quem consome metadados de tool calls usa o audit log. Alternativa (dual streamMode `['messages','values']`) adiaria decision do LangGraph e complicaria mock de testes — revisitar em v1.4 se necessário.

### Task 2 — Router SSE com `event: action`

`GET /chat/stream` agora registra um `setDispatchListener` ANTES de iterar `sendStream`. O listener recebe `DispatchEvent` (camelCase interno: `toolCallId`, `requiresConfirmation`), mapeia para snake_case no wire (`tool_call_id`, `requires_confirmation`) e escreve:

```
event: action
data: {"tool_call_id":42,"action":"open_app","args":{"app":"firefox"},"requires_confirmation":false}

```

Tokens continuam sendo escritos como `data: <token>\n\n` (sem linha `event:`), preservando paridade com o wire Python e compatibilidade com `EventSource` nativo.

No `finally`: `session.clearDispatchListener()` + `release()` do lock. Executa tanto em sucesso quanto em erro (testado).

**Ordem:** como o listener é chamado sincronamente dentro do `wrapPcTool` (que roda mid-stream dentro do loop `for await`), os eventos `action` aparecem intercalados entre os tokens na ordem correta. Teste verifica explicitamente `idxTokenAntes < idxAction < idxTokenDepois`.

**POST /chat** (não-stream) não registra listener — dispatch ainda grava audit, apenas não emite SSE. Documentado como decisão intencional.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Testes antigos de `sendStream` em `chat-session.test.ts` quebraram**
- **Found during:** Task 1 GREEN run
- **Issue:** 5 testes em `src/session/chat-session.test.ts > sendStream` mockavam `llm.stream()` que agora não é mais usado por sendStream.
- **Fix:** Atualizei o mock de `createReactAgent` para expor também `stream` (novo `agentStreamSpy` + `agentStreamImpl`), reescrevi os 5 testes para yielar `AIMessageChunk` via `agentStreamImpl`, adicionei `agentStreamSpy.mockClear()` no beforeEach.
- **Files modified:** apps/backend-ts/src/session/chat-session.test.ts
- **Commit:** ca2554a

**2. [Rule 3 - Blocker] `mockSession` em `chat.test.ts` sem métodos de listener**
- **Found during:** Task 2 GREEN run
- **Issue:** Router agora chama `session.setDispatchListener()` + `session.clearDispatchListener()`. O `mockSession` helper do test router antigo não tinha esses stubs → `TypeError` em 2 testes.
- **Fix:** Adicionei `setDispatchListener: vi.fn()` e `clearDispatchListener: vi.fn()` aos defaults.
- **Files modified:** apps/backend-ts/src/routes/chat.test.ts
- **Commit:** ee1b329

## Test Plan Executed

- `pnpm test` — 225 passed / 31 files (era 218 antes).
- 7 testes novos cobrindo: tokens via agent.stream, streamMode assertado, history pós-stream, filtro de não-AIMessageChunk, erro propagado.
- 4 testes novos cobrindo SSE router: dispatch mid-stream com snake_case mapping + ordem, stream sem dispatch, cleanup em erro, `requires_confirmation: true`.
- `tsc --noEmit` clean.

## Known Stubs

Nenhum. O caminho end-to-end está wired: `GET /chat/stream` → `ChatSession.sendStream` → `agent.stream` → `wrapPcTool` → `logDispatch` + listener → `res.write(event: action)`. O que falta é o cliente Electron consumir (Fase 18.5, fora de escopo).

## Follow-ups

- Fase 18.5: `EventSource` no Electron fazendo `addEventListener('action', ...)` e dispatchando pros handlers reais (pactl, xdg-open, brightnessctl, fs).
- v1.4: explorar streamMode dual `['messages','values']` para preservar tool_calls no history pós-stream, se houver caso de uso (LangGraph interrupts, resume, replay).
- v1.4: considerar interrupt/resume no LangGraph para "rebobinar" quando usuário recusa uma ação no Electron — hoje o agent assume sucesso ao retornar payload.

## Self-Check: PASSED

- apps/backend-ts/src/session/chat-session.ts — sendStream usa `this._agent.stream(..., {streamMode:'messages'})` ✓
- apps/backend-ts/src/routes/chat.ts — `session.setDispatchListener` antes + `session.clearDispatchListener` no finally ✓
- apps/backend-ts/test/routes/chat-sse-action.test.ts — criado, 4 testes ✓
- apps/backend-ts/test/session/chat-session-stream.test.ts — criado, 3 testes ✓
- Commits ca2554a, ee1b329 presentes em `git log` ✓
- `pnpm test` 225 passed ✓
