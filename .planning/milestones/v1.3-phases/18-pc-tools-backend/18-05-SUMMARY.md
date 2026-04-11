---
phase: 18-pc-tools-backend
plan: 05
subsystem: backend-ts/routes
tags: [express, zod, audit-log, tool-calls]
requirements: [TOOL-TS-08]
key-files:
  created:
    - apps/backend-ts/src/routes/tool-calls.ts
    - apps/backend-ts/test/routes/tool-calls.test.ts
  modified:
    - apps/backend-ts/src/app.ts
    - apps/backend-ts/src/session/chat-session.ts
    - apps/backend-ts/src/index.ts
metrics:
  tasks: 2
  tests_total: 234
  tests_new: 9
  duration: ~8min
---

# Phase 18 Plan 05: POST /tool-calls/:id/result — Audit Reconciliation Summary

Novo endpoint REST que fecha o ciclo de audit iniciado por `ToolLogger.logDispatch()`: o Electron executor reporta o outcome real (success/error/cancelled) e a row em `tool_calls` é atualizada via `updateOutcome`.

## What Was Built

- **`routes/tool-calls.ts`** — `createToolCallsRouter(toolLogger)` expõe `POST /tool-calls/:id/result`. Valida `:id` como inteiro positivo e body via Zod `discriminatedUnion('success')`:
  - `success=true` aceita `output?: string|null` e rejeita `error`.
  - `success=false` exige `error: string` não-vazio.
- **Outcome mapping:**
  - `success=true` → `'success'`
  - `success=false, error==='user_denied'` → `'cancelled'`
  - `success=false` outro erro → `'error'`
- **Responses:** `204 No Content` em sucesso, `400` quando id/body inválido, `404` quando `updateOutcome` retorna false.
- **Wiring:** `createApp` aceita `opts.toolLogger`; `ChatSession` expõe getter `toolLogger`; `index.ts` injeta `session.toolLogger` no bootstrap.
- **Testes supertest (9):** 204 success+output, 204 success sem output, 204 user_denied→cancelled, 204 generic error, 400 body vazio, 400 union inválida, 400 success=false sem error, 400 id não-numérico, 404 id inexistente. Cada caso verifica a row em `tool_calls` via SELECT direto (outcome + output + error).

## Verification

- `pnpm --filter backend-ts test` → **234/234 verdes** (225 anteriores + 9 novos).
- `pnpm --filter backend-ts build` → tsc clean.
- Fase 17 chat router intacto (não há regressão).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] TS2345 em `req.params.id`**
- **Found during:** build após Task 2.
- **Issue:** `req.params.id` tipado como `string | string[]` no projeto → `Number.parseInt` rejeita.
- **Fix:** type guard explícito (`typeof idRaw !== 'string'` → 400) antes do parseInt.
- **Files modified:** `apps/backend-ts/src/routes/tool-calls.ts`.
- **Commit:** 8d58f3c.

Nenhuma outra deviação — plano executado como escrito.

## Phase 18 Completion Check

Todos os 6 critérios da Fase 18 satisfeitos:
1. ✅ 9 tools registradas no `createReactAgent` (plano 03).
2. ✅ Payload idêntico ao Python via snapshot tests (plano 01).
3. ✅ Cada chamada gravada com `outcome='dispatched'` (plano 03).
4. ✅ SSE emite `event: action` (plano 04).
5. ✅ POST /tool-calls/:id/result aceita `{success, output, error}` e atualiza audit (**plano 05 — este**).
6. ✅ Tools de leitura sem side effect; destrutivas marcam `requires_confirmation` (plano 01).

**Fase 18 — PC Tools Backend — COMPLETA.**

## Self-Check: PASSED

- `apps/backend-ts/src/routes/tool-calls.ts` — FOUND
- `apps/backend-ts/test/routes/tool-calls.test.ts` — FOUND
- Commit `8d58f3c` — FOUND
- 234/234 testes verdes — CONFIRMED
- tsc build clean — CONFIRMED
