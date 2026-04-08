---
phase: 18_5-pc-tools-electron
plan: 06
subsystem: gateway
tags: [gateway, proxy, tool-calls, sse, auth]
requires: [apps/backend-ts/src/routes/tool-calls.ts]
provides:
  - "POST /api/tool-calls/:id/result proxy"
  - "Authorization forwarding no GET /api/chat/stream"
affects: [apps/gateway]
tech-stack:
  added: []
  patterns: [express-router, undici-fetch-proxy, supertest-mocks]
key-files:
  created:
    - apps/gateway/src/routes/tool-calls.ts
    - apps/gateway/src/__tests__/tool-calls.test.ts
    - apps/gateway/src/__tests__/chat-stream-auth.test.ts
  modified:
    - apps/gateway/src/app.ts
    - apps/gateway/src/config.ts
    - apps/gateway/src/routes/chat.ts
decisions:
  - "Auth strategy: forward incoming Authorization, senão injeta JARVIS_API_KEY do env (defense in depth), senão omite header"
  - "Validação de :id via regex `^[1-9]\\d*$` antes de tocar upstream"
  - "5xx upstream → 502 UPSTREAM_ERROR via errorHandler (evita vazar detalhes internos)"
metrics:
  duration: "~15min"
  completed: 2026-04-08
requirements: [TOOL-TS-04]
---

# Phase 18.5 Plan 06: Gateway proxy para tool-calls Summary

Proxy completo no `apps/gateway/` para o endpoint de outcome reconciliation (`POST /tool-calls/:id/result`) + forward de `Authorization` header no SSE `GET /chat/stream` — fechando o caminho Electron → gateway → backend para a fase 18.5.

## O que foi entregue

### Task 1 — POST /api/tool-calls/:id/result
- Novo `toolCallsRouter` em `apps/gateway/src/routes/tool-calls.ts`, montado em `app.use('/api', toolCallsRouter)`.
- Validação de `:id` com regex `^[1-9]\d*$` (400 `{detail: "invalid tool call id"}` sem tocar upstream).
- Headers repassados: `Authorization` do cliente quando presente; caso contrário, injeta `Bearer ${config.apiKey}` se `JARVIS_API_KEY` estiver setado; caso contrário, omite.
- Mapeamento de status:
  - 204 upstream → 204 gateway (end)
  - 400/404 upstream → propaga status + body JSON
  - 5xx upstream → 502 `UPSTREAM_ERROR` via `next(err)` + `errorHandler`
  - fetch error (network) → 502 `UPSTREAM_ERROR`
- Commit: `de159a7`

### Task 2 — Authorization no GET /chat/stream
- `routes/chat.ts`: antes do `fetch` upstream, monta `upstreamHeaders` com a mesma regra (client → env → omit). Passado via `{ headers: upstreamHeaders }`.
- Preserva todo o comportamento SSE existente (flushHeaders, reader loop byte-a-byte).
- Commit: (ver abaixo)

### Config
- `config.ts` agora expõe `apiKey: process.env.JARVIS_API_KEY` (optional string).

## Testes

- `src/__tests__/tool-calls.test.ts` (9 casos):
  - proxy 204, invalid id (regex), id=0, upstream 400, upstream 404, upstream 5xx → 502, fetch reject → 502, auth forward, auth inject do env, omit sem auth
- `src/__tests__/chat-stream-auth.test.ts` (3 casos): client header forward, env key inject, omit sem nada

**17/17 testes dos arquivos deste plano passando** (`vitest run tool-calls chat-stream-auth chat` → 3 files, 17 tests). Pré-existente em `src/routes/__tests__/chat.test.ts` (audio route) tem 4 falhas + erros tsc no `chat.ts` linhas 115/120 — ambos **anteriores a este plano** e fora do escopo (Rule: scope boundary). Registrados abaixo.

## Deviations from Plan

Nenhum desvio funcional. Plano executado como escrito.

## Deferred Issues (pré-existentes, fora de escopo)

- `apps/gateway/src/routes/__tests__/chat.test.ts`: 4 testes do audio route falham com 404 (montagem sem middleware correta). Não tocado por este plano.
- `tsc --noEmit`: 2 erros TS2322 em `routes/chat.ts` linhas 115/120 (FormData / Buffer type mismatch no handler `POST /chat/audio` da Fase 14/anterior). Não introduzidos por este plano; as linhas tocadas por 18_5-06 (stream handler) estão limpas.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: auth-boundary | apps/gateway/src/routes/tool-calls.ts | Novo endpoint de proxy que carrega Authorization — confia em upstream backend validar o token. Gateway não valida. |

## Self-Check: PASSED

- [x] `apps/gateway/src/routes/tool-calls.ts` existe
- [x] `apps/gateway/src/__tests__/tool-calls.test.ts` existe
- [x] `apps/gateway/src/__tests__/chat-stream-auth.test.ts` existe
- [x] `apps/gateway/src/config.ts` tem `apiKey`
- [x] `apps/gateway/src/app.ts` monta `toolCallsRouter`
- [x] `apps/gateway/src/routes/chat.ts` forwarda Authorization
- [x] Commit `de159a7` existe (feat gateway proxy POST /tool-calls/:id/result)
- [x] Commit do task 2 existe (feat forward Authorization chat/stream)
- [x] 17/17 testes do plano passando
