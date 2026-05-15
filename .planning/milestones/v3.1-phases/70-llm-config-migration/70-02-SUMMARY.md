---
phase: 70
plan: 02
subsystem: backend-ts
tags: [cleanup, dead-code, zod, env-config, tdd]
dependency_graph:
  requires: []
  provides:
    - apps/backend-ts sem rotas HTTP /internal/reload-llm e /internal/mcp-client
    - llm/config.ts com z.preprocess correto para boolean coerce
    - .env.example canônico com USE_LM_STUDIO_STREAMING_EVENTS e GEMINI_API_KEY
  affects:
    - apps/backend-ts/src/app.ts (rotas internas removidas)
    - apps/backend-ts/src/llm/config.ts (Zod schema corrigido)
    - .env.example (template canonizado)
tech_stack:
  added: []
  patterns:
    - z.preprocess para boolean coerce seguro em variáveis de ambiente string
    - TDD RED/GREEN para validar e corrigir comportamento de Zod schema
key_files:
  created:
    - (nenhum)
  modified:
    - apps/backend-ts/src/app.ts
    - apps/backend-ts/src/llm/config.ts
    - apps/backend-ts/src/llm/config.test.ts
    - .env.example
  deleted:
    - apps/backend-ts/src/routes/reload-llm.ts
    - apps/backend-ts/src/routes/mcp-client.ts
decisions:
  - z.preprocess escolhido sobre z.coerce.boolean para USE_LM_STUDIO_STREAMING_EVENTS — bug confirmado em Zod 4.x onde string "false" é coercida para true
  - Erros de TypeScript pré-existentes (index.ts, folder-watcher.ts, scheduler.ts, proactive.route.test.ts) documentados como out-of-scope para este plano
metrics:
  duration: ~15min
  completed: "2026-05-11"
  tasks_completed: 3
  files_changed: 6
  files_deleted: 2
---

# Phase 70 Plan 02: Backend Cleanup + .env.example Canonização Summary

**One-liner:** Deletar rotas HTTP dead code /internal/reload-llm e /internal/mcp-client; corrigir Zod coerce bug em USE_LM_STUDIO_STREAMING_EVENTS via z.preprocess; canonizar .env.example com dois placeholders ausentes.

## Tasks Executadas

| Task | Nome | Commits | Status |
|------|------|---------|--------|
| 1 | Deletar reload-llm.ts e mcp-client.ts; limpar app.ts (D-10, D-20) | `6ca4547` | DONE |
| 2 (RED) | Adicionar testes guardrail USE_LM_STUDIO_STREAMING_EVENTS | `dffa007` | DONE |
| 2 (GREEN) | Corrigir z.coerce.boolean ingênuo em config.ts | `37799ba` | DONE |
| 3 | Canonizar .env.example com USE_LM_STUDIO_STREAMING_EVENTS e GEMINI_API_KEY | `5fa2344` | DONE |

## Resultado por Must Have

| Critério | Status |
|----------|--------|
| Backend não expõe POST /internal/reload-llm | PASS |
| Backend não expõe /internal/mcp-client/{reload,status} | PASS |
| app.ts não importa createReloadLlmRouter nem createMcpClientRouter | PASS |
| .env.example contém USE_LM_STUDIO_STREAMING_EVENTS=false com comentário (D-08) | PASS |
| .env.example contém GEMINI_API_KEY= | PASS |
| Zod schema usa z.preprocess para tratar "false" como false | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Confirmado e corrigido z.coerce.boolean() ingênuo — Open Question 1 do RESEARCH.md**

- **Found during:** Task 2 (verificação pré-TDD)
- **Issue:** `z.coerce.boolean()` em Zod 4.x (versão 4.3.6 confirmada) trata qualquer string não-vazia como `true` — incluindo a string literal `"false"`. Verificado via `node -e`: `schema.safeParse('false')` retornava `true`.
- **Fix:** Substituído por `z.preprocess((v) => typeof v === 'string' ? v.toLowerCase() === 'true' : v, z.boolean()).default(false)` em `llm/config.ts` linha 23.
- **Evidência TDD:** Teste RED falhou com `expected true to be false`; após patch, 20/20 testes GREEN.
- **Files modified:** `apps/backend-ts/src/llm/config.ts`, `apps/backend-ts/src/llm/config.test.ts`
- **Commits:** `dffa007` (RED test), `37799ba` (GREEN patch)

### TypeScript Errors Pré-existentes (Out of Scope)

5 erros de TypeScript pré-existentes foram identificados e confirmados como anteriores a este plano (verificado via `git stash`):

- `src/index.ts:105` — Property 'llm' is private
- `src/proactive/folder-watcher.ts:111` — Argument type incompatibility
- `src/proactive/scheduler.ts:195` — BetterSQLite3Database type mismatch
- `src/routes/__tests__/proactive.route.test.ts:96` (×2) — Property 'response' não existe

Esses erros não são relacionados às alterações do plano 70-02 e foram adicionados ao `deferred-items.md` para rastreamento futuro.

## Threat Model Resolution

| Threat | Status |
|--------|--------|
| T-70-05: Elevation of Privilege via /internal/reload-llm | MITIGATED — arquivo deletado, zero surface area |
| T-70-06: Tampering via USE_LM_STUDIO_STREAMING_EVENTS sempre-on | MITIGATED — z.preprocess + test guardrail |
| T-70-07: Information Disclosure via .env.example | ACCEPTED — apenas placeholders vazios, sem valores sensíveis |

## Test Results

- **Total:** 584 passed | 1 skipped | 1 todo (586)
- **Test files:** 76 passed
- **Config guardrails:** 20/20 — incluindo 4 novos cenários USE_LM_STUDIO_STREAMING_EVENTS

## Self-Check: PASSED

- `apps/backend-ts/src/app.ts` — existe e sem imports das rotas deletadas
- `apps/backend-ts/src/llm/config.ts` — existe com z.preprocess
- `apps/backend-ts/src/llm/config.test.ts` — existe com 4 cenários guardrail
- `.env.example` — existe com USE_LM_STUDIO_STREAMING_EVENTS=false e GEMINI_API_KEY=
- `apps/backend-ts/src/routes/reload-llm.ts` — DELETADO (correto)
- `apps/backend-ts/src/routes/mcp-client.ts` — DELETADO (correto)
- Commits `6ca4547`, `dffa007`, `37799ba`, `5fa2344` — todos no log do git
