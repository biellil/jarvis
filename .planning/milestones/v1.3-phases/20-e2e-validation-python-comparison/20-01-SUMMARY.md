---
phase: 20-e2e-validation-python-comparison
plan: 01
subsystem: gateway
tags: [gateway, feature-flag, routing, VAL-07]
requires: []
provides:
  - resolveUpstreamUrl
  - X-Backend-Version header routing
affects:
  - apps/gateway/src/routes/chat.ts
tech-stack:
  added: []
  patterns: [header-based feature flag]
key-files:
  created:
    - apps/gateway/src/middleware/backendRouter.ts
    - apps/gateway/src/middleware/backendRouter.test.ts
  modified:
    - apps/gateway/src/routes/chat.ts
    - apps/gateway/src/routes/__tests__/chat.test.ts
decisions:
  - "Header X-Backend-Version: ts roteia para backend TS (8001); default (ausente/outro valor) vai para fastapiUrl (8000)"
  - "Endpoint /chat/audio muda default de backendTsUrl para fastapiUrl conforme VAL-07 — testes antigos atualizados para enviar o header"
metrics:
  tasks: 3
  completed: "2026-04-09"
---

# Phase 20 Plan 01: Gateway Feature Flag X-Backend-Version Summary

Feature flag no gateway Express que roteia requests de `/chat`, `/chat/stream` e `/chat/audio` para o backend TypeScript (port 8001) quando o header `X-Backend-Version: ts` estiver presente; caso contrário, mantém o comportamento default Python (port 8000).

## What Was Built

- **`backendRouter.ts`**: função `resolveUpstreamUrl(req)` que inspeciona `req.headers['x-backend-version']` e retorna `config.backendTsUrl` ou `config.fastapiUrl`.
- **`chat.ts`**: três handlers (POST /chat, GET /chat/stream, POST /chat/audio) agora usam `resolveUpstreamUrl(req)` em vez de URLs hardcoded.
- **`backendRouter.test.ts`**: 3 testes unitários cobrindo header `ts`, ausência de header, e valor diferente.
- **`chat.test.ts`**: audio happy path ajustado para enviar `X-Backend-Version: ts` (reflete novo default).

## Commits

- `793738c` — ✨ feat(gateway): adiciona resolveUpstreamUrl
- `887586d` — ♻️ refactor(gateway): usa resolveUpstreamUrl nas rotas
- `c1b71d3` — ✅ test(gateway): adiciona testes e ajusta chat audio

## Verification

- `pnpm --filter @jarvis/gateway build` → sem erros TypeScript
- `pnpm --filter @jarvis/gateway test --run` → 44 passed (9 files)
- `grep "config\.fastapiUrl\|config\.backendTsUrl" apps/gateway/src/routes/chat.ts` → 0 linhas ativas

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Atualizado chat.test.ts audio happy path**
- **Found during:** Task 3 (test run)
- **Issue:** Teste pré-existente `happy path: proxies to backend-ts` afirmava `expect(url).toContain('8001')`, mas a mudança do plano (VAL-07) move o default de `/chat/audio` para fastapiUrl (8000). Sem o header, o teste quebrava.
- **Fix:** Adicionado `.set('X-Backend-Version', 'ts')` no request do teste — reflete o novo contrato do feature flag.
- **Files modified:** apps/gateway/src/routes/__tests__/chat.test.ts
- **Commit:** c1b71d3

**2. [Rule 3 - Blocking] pnpm install no worktree**
- **Found during:** Task 2 build
- **Issue:** `node_modules` ausente no worktree — `tsc: not found`
- **Fix:** `pnpm install --filter @jarvis/gateway...`
- **Commit:** N/A (infra, sem mudança de código)

## Self-Check: PASSED

- FOUND: apps/gateway/src/middleware/backendRouter.ts
- FOUND: apps/gateway/src/middleware/backendRouter.test.ts
- FOUND: commit 793738c
- FOUND: commit 887586d
- FOUND: commit c1b71d3
- Tests: 44 passed
