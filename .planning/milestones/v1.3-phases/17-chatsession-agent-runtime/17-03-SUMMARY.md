---
phase: 17-chatsession-agent-runtime
plan: 03
subsystem: backend-ts/session
tags: [streaming, async-generator, chat-session, langchain]
requires: [17-02]
provides: [ChatSession.sendStream]
affects: [apps/backend-ts/src/session/chat-session.ts]
key-files:
  modified:
    - apps/backend-ts/src/session/chat-session.ts
    - apps/backend-ts/src/session/chat-session.test.ts
decisions:
  - sendStream bypassa o agent ReAct e usa llm.stream() direto, espelhando Python send_stream (src/jarvis/core/session.py:347-437). Sem tool calling no modo streaming — decisão locked no 17-CONTEXT.
metrics:
  duration: ~10min
  tasks: 1
  tests: 12 (5 novos)
---

# Phase 17 Plan 03: sendStream Async Generator Summary

Adiciona `ChatSession.sendStream(text): AsyncGenerator<string>` que yielda tokens conforme o LLM gera, via `llm.stream()` direto — sem passar pelo agent ReAct (paridade consciente com Python `send_stream`, linha 347).

## O que foi entregue

- Método `async *sendStream(text)` em `ChatSession` que:
  1. Appenda `HumanMessage(text)` em `history` antes do stream
  2. Itera `this.llm.stream(this.history)`, ignorando chunks vazios
  3. Acumula `assembled` e yielda cada token não-vazio
  4. Após drain bem-sucedido: appenda `AIMessage(assembled)` e chama `memory.saveTurn`
  5. Se o stream falha no meio: erro propaga, `saveTurn` NÃO é chamado (resposta incompleta)
- 5 testes vitest novos cobrindo: token-by-token yield, history/persistência pós-drain, propagação de erro com supressão do saveTurn, bypass do agent, filtro de chunks vazios

## Decisões-chave

- **Sem tool calling no stream**: paridade com `src/jarvis/core/session.py:347-437`. O agent ReAct (createReactAgent) continua só no `send()` síncrono. O Plan 17-04 (SSE) vai consumir esse gerador para resposta conversacional rápida.
- **History append antes do stream**: passa `this.history` direto para `llm.stream()` evitando cópia — a HumanMessage já está lá.
- **saveTurn warn-only**: mesmo padrão do `send()`, erros de persistência não quebram o stream.

## Verificação

- `pnpm vitest run src/session/chat-session.test.ts` → 12/12 verdes (7 antigos + 5 novos)
- `pnpm vitest run` → 83/83 verdes no backend-ts
- `npx tsc --noEmit` → limpo

## Self-Check: PASSED

- `apps/backend-ts/src/session/chat-session.ts` FOUND
- `apps/backend-ts/src/session/chat-session.test.ts` FOUND
- `ChatSession.sendStream` export verificado via testes
