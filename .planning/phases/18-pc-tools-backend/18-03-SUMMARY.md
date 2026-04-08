---
phase: 18-pc-tools-backend
plan: 03
subsystem: session
tags: [tools, agent, audit, dispatch]
requires: [18-01, 18-02]
provides:
  - "ChatSession com 10 tools (recall_memory + 9 PC tools wrapped)"
  - "wrapPcTool/wrapAllPcTools: wrapper que dispara logDispatch + listener"
  - "setDispatchListener/clearDispatchListener API para router SSE (18-04)"
affects:
  - apps/backend-ts/src/session/chat-session.ts
tech-stack:
  added: []
  patterns:
    - "Listener injetável por-request via ListenerBox compartilhado por closure"
    - "Wrapper LangChain tool() preservando name/description/schema da original"
key-files:
  created:
    - apps/backend-ts/src/session/tool-dispatch.ts
    - apps/backend-ts/test/session/tool-dispatch.test.ts
    - apps/backend-ts/test/session/chat-session-tools.test.ts
  modified:
    - apps/backend-ts/src/session/chat-session.ts
    - apps/backend-ts/src/session/chat-session.test.ts
decisions:
  - "Listener via ListenerBox {current} capturado por closure em create() — ChatSession expõe setter/clearer sem casts any"
  - "Wrapper parseia o JSON-string retornado pelas PC tools (responseFormat content_and_artifact) para extrair action/args/requires_confirmation sem depender do segundo elemento do artifact"
  - "Se logDispatch retorna null (DB erro), wrapper NÃO chama listener mas retorna payload ao agent — degradação suave"
metrics:
  duration: "~15min"
  completed: "2026-04-08"
  tasks: 2
  tests_added: 12
  tests_total: 218
---

# Phase 18 Plan 03: Wire PC Tools into Agent + Dispatch Audit

One-liner: ChatSession agora registra as 9 PC tools no createReactAgent via wrapper que grava audit log (`logDispatch`) e notifica listener opcional para SSE downstream.

## O que foi entregue

### Task 1: `tool-dispatch.ts`
- `wrapPcTool(original, ctx)` — envolve uma PC tool LangChain preservando name/description/schema. Ao ser invocada: (1) executa a original, (2) parseia o JSON content pra obter `{action, args, requires_confirmation}`, (3) chama `ctx.logger.logDispatch(name, args)`, (4) se id != null, chama `ctx.getListener()?.(DispatchEvent)`, (5) retorna o payload cru ao agent.
- `wrapAllPcTools(tools, ctx)` — map helper.
- Tipos públicos: `DispatchEvent`, `OnToolDispatched`, `DispatchContext`.
- 7 testes unitários cobrindo: open_app happy path, delete_file requiresConfirmation=true, sem listener, logDispatch=null, listener throwing, preservação de name/description, wrapAllPcTools 9 tools.

### Task 2: ChatSession wiring
- `ChatSessionOptions.toolLogger?` injetável (default: `new ToolLogger()`).
- `ChatSession.create()` instancia `ListenerBox {current: null}`, monta `DispatchContext` capturando o box por closure, wrappa as 9 PC tools via `wrapAllPcTools(createAllPcTools(), ctx)` e passa `[recallMemoryTool, ...pcToolsWrapped]` ao `createReactAgent`.
- Métodos públicos: `setDispatchListener(fn)` / `clearDispatchListener()` — manipulam `_listenerBox.current` sem casts `any`.
- `recall_memory` permanece não-wrappado (não é PC tool, não dispara dispatch).
- 4 testes integração com `createReactAgent` mockado + `ToolLogger` real (tmp DB): 10 tools registradas, open_app dispatch + listener + row DB consistente, clearDispatchListener não chama listener mas grava row, recall_memory não dispara dispatch.

## Deviations from Plan
Nenhuma. Plan executado exatamente como escrito.

## Verification
- `pnpm exec tsc --noEmit` — clean.
- `pnpm test` — **218/218** (era 207 antes; +11 novos: 7 tool-dispatch unit + 4 chat-session-tools integration; também +1 update no test existente de 18-01's chat-session.test.ts asserting 10 tools).
- `grep -c "createAllPcTools\|wrapAllPcTools" apps/backend-ts/src/session/chat-session.ts` = 2. ✓
- Testes Fase 17 continuam verdes (o update em chat-session.test.ts só ajustou a assertion de contagem de tools).

## Commits
- `b84d595` ✨ feat(18-03): wrapper tool-dispatch com audit + listener
- `e7edb75` ✨ feat(18-03): plugar PC tools no agente com audit dispatch

## Next
Plan 18-04 pode agora consumir `session.setDispatchListener(ev => sseEmit('action', ev))` no handler de `/chat/stream` para emitir `event: action` com o `tool_call_id` vindo do SQLite.

## Self-Check: PASSED
- FOUND: apps/backend-ts/src/session/tool-dispatch.ts
- FOUND: apps/backend-ts/test/session/tool-dispatch.test.ts
- FOUND: apps/backend-ts/test/session/chat-session-tools.test.ts
- FOUND: commit b84d595
- FOUND: commit e7edb75
- FOUND: 218/218 tests passing
