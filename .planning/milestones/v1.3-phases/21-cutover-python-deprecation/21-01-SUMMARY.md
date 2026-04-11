---
phase: 21-cutover-python-deprecation
plan: 01
subsystem: gateway
tags: [cutover, feature-flag, refactor, typescript]
dependency_graph:
  requires: []
  provides: [gateway-ts-only-routing]
  affects: [apps/gateway]
tech_stack:
  added: []
  patterns: [proxy-hardcoded, env-var-config]
key_files:
  deleted:
    - apps/gateway/src/middleware/backendRouter.ts
    - apps/gateway/src/middleware/backendRouter.test.ts
  modified:
    - apps/gateway/src/config.ts
    - apps/gateway/src/routes/chat.ts
    - apps/gateway/src/routes/health.ts
    - apps/gateway/src/routes/tool-calls.ts
    - apps/gateway/test/health.test.ts
decisions:
  - "Renomear campo 'python' para 'backend' no response de /health (reflete realidade pós-cutover)"
  - "Atualizar health.ts e tool-calls.ts além do escopo original (necessário para build passar)"
metrics:
  duration: ~10min
  completed: 2026-04-09
  tasks_completed: 2
  files_changed: 7
requirements:
  - VAL-08
  - VAL-09
---

# Phase 21 Plan 01: Remove Feature Flag Gateway — Summary

**One-liner:** Gateway simplificado de roteador condicional Python/TS para proxy direto ao backend TypeScript via `config.backendTsUrl`.

## Status: Complete

## What Was Done

Removida a lógica de feature flag do gateway (D-01 do plano de cutover):

1. **Deletados** `backendRouter.ts` e `backendRouter.test.ts` — implementavam o header `X-Backend-Version` para roteamento condicional entre FastAPI e backend-ts.

2. **Simplificado** `config.ts` — removido campo `fastapiUrl` (e leitura de `FASTAPI_URL`). Config agora tem apenas 3 campos: `backendTsUrl`, `gatewayPort`, `apiKey`.

3. **Atualizado** `routes/chat.ts` — removido import de `resolveUpstreamUrl`. Substituídas as 3 ocorrências de `resolveUpstreamUrl(req)` por `config.backendTsUrl` (rotas POST /chat, GET /chat/stream, POST /chat/audio).

4. **Corrigidos** `routes/health.ts` e `routes/tool-calls.ts` — também usavam `config.fastapiUrl` (fora do escopo original, mas necessário para o build compilar).

5. **Atualizado** `test/health.test.ts` — expects atualizados para o novo campo `backend` (era `python`) no response de /health.

## Commits

| Hash | Mensagem |
|------|----------|
| `e7917bb` | `🔥 feat(gateway): remove backendRouter middleware (D-01 cutover)` |
| `be86cad` | `♻️ refactor(gateway): remove feature flag, hardcode TypeScript backend` |

## Verification Results

```
# Arquivos deletados
ls backendRouter.ts  → 0 (não existe)
ls backendRouter.test.ts → 0 (não existe)

# Sem referências removidas
grep fastapiUrl config.ts → sem match
grep resolveUpstreamUrl routes/chat.ts → sem match
grep backendRouter routes/chat.ts → sem match

# Novas referências presentes
grep -c "config.backendTsUrl" routes/chat.ts → 3

# Build
pnpm --filter @jarvis/gateway build → sucesso (sem erros TypeScript)

# Testes
pnpm --filter @jarvis/gateway test --run → 64/64 passed (12 test files)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Referências a `fastapiUrl` em health.ts e tool-calls.ts**
- **Found during:** Task 2 — build falhou com `TS2339: Property 'fastapiUrl' does not exist`
- **Issue:** `routes/health.ts` e `routes/tool-calls.ts` usavam `config.fastapiUrl` que foi removido de `config.ts`; fora do escopo do plano original mas bloqueava o build
- **Fix:** Substituído `config.fastapiUrl` por `config.backendTsUrl` em ambos os arquivos; campo `python` renomeado para `backend` no response de /health
- **Files modified:** `apps/gateway/src/routes/health.ts`, `apps/gateway/src/routes/tool-calls.ts`, `apps/gateway/test/health.test.ts`
- **Commit:** `be86cad`

## Known Stubs

Nenhum stub identificado — todas as rotas apontam para `config.backendTsUrl` com valor real lido de `BACKEND_TS_URL`.

## Self-Check: PASSED

- `apps/gateway/src/config.ts` — existe, sem `fastapiUrl`
- `apps/gateway/src/routes/chat.ts` — existe, 3x `config.backendTsUrl`
- `apps/gateway/src/middleware/backendRouter.ts` — deletado (correto)
- `apps/gateway/src/middleware/backendRouter.test.ts` — deletado (correto)
- Commit `e7917bb` — existe
- Commit `be86cad` — existe
- 64/64 testes passando
