---
phase: 17-chatsession-agent-runtime
plan: 01
subsystem: backend-ts/session
tags: [chatsession, skeleton, memory-integration, tdd]
requires:
  - MemoryManager (Phase 16)
  - createLLM factory (Phase 15)
  - '@langchain/core' messages + chat_models
provides:
  - ChatSession class (skeleton, sem agent/stream)
  - SYSTEM_PROMPT constant (port literal do Python)
  - session/index.ts barrel
affects:
  - apps/backend-ts/src/session/* (novo módulo)
tech-stack:
  added: []
  patterns:
    - 'Async factory estático (ChatSession.create) para evitar async constructor'
    - 'History como BaseMessage[] em memória, iniciado com SystemMessage(SYSTEM_PROMPT)'
    - 'saveTurn dentro de try/catch — paridade com degradação gracefull do Python'
key-files:
  created:
    - apps/backend-ts/src/session/system-prompt.ts
    - apps/backend-ts/src/session/chat-session.ts
    - apps/backend-ts/src/session/index.ts
    - apps/backend-ts/src/session/chat-session.test.ts
  modified: []
decisions:
  - 'Factory estático vs async constructor: escolhido `static async create()` + constructor privado. Garante que convId já está resolvido quando o caller recebe a instância, evita race conditions no primeiro send() e deixa os testes síncronos no setup.'
  - 'history é `public readonly` (array). Permite os testes inspecionarem sem precisar de getter, e paridade direta com `self.history` do Python.'
  - 'send() chama `llm.invoke()` direto — sem streaming, sem bind_tools, sem createReactAgent. Esses virão nos Planos 17-02/03/04. Contrato base travado antes de complicar.'
metrics:
  duration: ~5min
  tasks: 2
  files: 4
  tests: 6
  completed: 2026-04-08
---

# Phase 17 Plan 01: ChatSession Skeleton Summary

Skeleton da classe `ChatSession` em TypeScript com histórico em memória, integração com `MemoryManager` e `send()` não-streaming via `llm.invoke()` direto — base para os próximos planos adicionarem agent runtime, streaming SSE e tools.

## What Was Built

- **`system-prompt.ts`** — exporta `SYSTEM_PROMPT` como string literal portada char-a-char de `src/jarvis/core/session.py:54-58`. Sem trailing newline, sem concatenação dinâmica.
- **`chat-session.ts`** — classe `ChatSession` com:
  - Constructor privado + factory `static async create({ llm, memory })`.
  - `history: BaseMessage[]` público readonly, inicia com `[new SystemMessage(SYSTEM_PROMPT)]`.
  - `_convId: number | null` resolvido via `memory.startConversation()` no `create()`.
  - `send(text)`: append HumanMessage → `llm.invoke(history)` → append AIMessage → `memory.saveTurn()` (se `_convId !== null`) → retorna `String(aiMessage.content)`.
  - `saveTurn` em try/catch — falha da camada de memória não derruba o turn (paridade Python).
- **`session/index.ts`** — barrel reexportando `ChatSession`, `ChatSessionOptions`, `SYSTEM_PROMPT`.
- **`chat-session.test.ts`** — 6 testes vitest (TDD RED → GREEN):
  1. `create()` chama `memory.startConversation()`.
  2. `history` inicia com `[SystemMessage(SYSTEM_PROMPT)]`.
  3. `send()` retorna string e faz history crescer para length 3.
  4. `saveTurn(convId, user, assistant)` é chamada exatamente uma vez.
  5. `convId = null` não chama `saveTurn` (degrada gracefully).
  6. Dois `send()` consecutivos acumulam history (length 5).

## Deviations from Plan

None — plano executado exatamente como escrito.

## Verification

- `pnpm vitest run src/session/chat-session.test.ts` → 6/6 passing
- `pnpm vitest run` (full suite) → 71/71 passing
- `pnpm tsc --noEmit` → zero erros
- SYSTEM_PROMPT confere char-a-char com Python (`src/jarvis/core/session.py:54-58`)

## Commits

- `✅ test(17-01): adiciona testes RED para ChatSession skeleton` (7b4f2d3)
- `✨ feat(17-01): cria ChatSession skeleton com history e persistência SQLite`

## Next Step

**Plan 17-02** — Adicionar tool `recall_memory` e montar `createReactAgent` da `@langchain/langgraph` dentro do `ChatSession.send()`, substituindo a chamada `llm.invoke()` direta. A partir daí `history` passa a incluir `ToolMessage`s também.

## Self-Check: PASSED

- Arquivos criados existem: system-prompt.ts, chat-session.ts, index.ts, chat-session.test.ts ✓
- Commits presentes no git log (7b4f2d3 RED + GREEN) ✓
- Suite completa verde (71/71) ✓
- Typecheck limpo ✓
