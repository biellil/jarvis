---
phase: 260530-uqr
plan: 01
subsystem: backend-ts/memory
tags: [memory, persistence, agentic, sqlite]
dependency_graph:
  requires: []
  provides: [agentic-turn-persistence]
  affects: [chat-session, chat-route]
tech_stack:
  added: []
  patterns: [fire-and-forget void memory.saveTurn()]
key_files:
  created: []
  modified:
    - apps/backend-ts/src/session/chat-session.ts
    - apps/backend-ts/src/routes/chat.ts
decisions:
  - saveTurn() público delega direto para memory.saveTurn() — sem lógica extra, fachada simples
  - Inserção após clearAwaitingConfirmation() mantém métodos de lifecycle agrupados
  - Persistência apenas em isTerminal (task:done) — turns incompletos (catch) não são persistidos
metrics:
  duration: ~10min
  completed: 2026-05-30
  tasks_completed: 2
  files_modified: 2
---

# Phase 260530-uqr Plan 01: Salvar Turns Agentivos no SQLite — Summary

**One-liner:** Expõe `ChatSession.saveTurn()` público e adiciona dois pontos de persistência no caminho agentivo de `chat.ts` para que turns agenticos não sejam perdidos entre sessões.

## What Was Built

O caminho agentivo em `chat.ts` chamava `graph.stream()` diretamente sem passar por `session.send()` ou `session.sendStream()`, fazendo com que `memory.saveTurn()` nunca fosse invocado para mensagens processadas pelo grafo de tarefas.

**Task 1 — `ChatSession.saveTurn()` público**
- Método adicionado após `clearAwaitingConfirmation()` em `chat-session.ts`
- Mesmo padrão fire-and-forget (`void`, sem `await`, sem `try/catch` extra) de `send()` e `sendStream()`
- Guard `_convId !== null` consistente com os métodos existentes

**Task 2 — Chamadas em chat.ts**
- Ponto 1: após `taskCheckpointer.deleteThread(taskId)` no bloco `isTerminal` do caminho agentivo principal
- Ponto 2: após `taskCheckpointer.deleteThread(pendingTaskId)` no bloco `isTerminal` do caminho de resume de confirmação
- Ambos dentro do `try` onde `taskOutput`/`resumeOutput` estão no escopo (definidos antes do `for await`)

## Verification

```
grep -n "session.saveTurn" apps/backend-ts/src/routes/chat.ts
# 160: session.saveTurn(message, resumeOutput);
# 275: session.saveTurn(message, taskOutput);

grep -n "public saveTurn" apps/backend-ts/src/session/chat-session.ts
# 375: saveTurn(userText: string, assistantText: string): void {
```

TypeScript compila sem novos erros (erros pré-existentes em outros arquivos não relacionados).

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | efe030b | ✨ feat(backend-ts): expor saveTurn() público no ChatSession |
| 2 | d2efc35 | ✨ feat(backend-ts): persistir turns agentivos no SQLite via session.saveTurn() |

## Deviations from Plan

None — plano executado exatamente como escrito.

## Known Stubs

None.

## Self-Check: PASSED

- `apps/backend-ts/src/session/chat-session.ts` — modified, `saveTurn()` method exists at line 375
- `apps/backend-ts/src/routes/chat.ts` — modified, 2 occurrences of `session.saveTurn` at lines 160 and 275
- Commits efe030b and d2efc35 exist in git log
