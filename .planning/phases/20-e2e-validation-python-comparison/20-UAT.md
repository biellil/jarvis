---
status: blocked
phase: 20-e2e-validation-python-comparison
source:
  - 20-01-SUMMARY.md
  - 20-02-SUMMARY.md
started: 2026-04-09T18:45:00Z
updated: 2026-04-09T18:45:00Z
---

## Current Test

number: done
name: UAT complete
status: 3/5 passed, 2 blocked (server)
awaiting: none

## Tests

### 1. Gateway feature flag — unit tests
expected: |
  `pnpm --filter @jarvis/gateway test --run` passa 44/44 testes incluindo backendRouter.test.ts com 3 asserts do resolveUpstreamUrl.
result: pass
evidence: |
  User executou `pnpm --filter @jarvis/gateway test --run` — 9 files, 44 tests passed in 3.32s.
  backendRouter.test.ts: 3 tests passed.

### 2. Gateway routing — backend vivo (E2E manual)
expected: |
  Com gateway + backend-ts rodando: `curl -H "X-Backend-Version: ts" http://localhost:3000/api/chat -d '{"message":"oi"}'` chega no TypeScript backend (porta 8001). Sem o header, vai pro Python (porta 8000).
result: pass
evidence: |
  curl com X-Backend-Version: ts retornou {"message":""} e logs do backend-ts mostraram request processado (conv-4-user/assistant). Resposta vazia por LM Studio, não por routing.

### 3. Script E2E — comando pnpm e2e
expected: |
  `pnpm e2e` a partir da raiz do monorepo delega para `apps/backend-ts` e tenta rodar o script. Sem backends vivos, deve falhar no preflight com mensagem clara indicando qual backend iniciar.
result: pass
evidence: |
  pnpm e2e executou, preflight detectou Python backend offline, mostrou: "Falha fatal: Python backend (http://localhost:8000) não responde. Para iniciar: cd src/jarvis && uvicorn main:app --port 8000". Exit code 1.

### 4. Script E2E — paridade completa
expected: |
  Com Python (8000) e TypeScript (8001) ativos, `pnpm e2e` envia 20 inputs, compara outputs, e imprime relatório final tipo:
    Text Similarity: X/20 PASS
    Tool Calls:      X/20 PASS (ou NOT_APPLICABLE)
    SQLite State:    X/20 PASS
    ChromaDB:        X/20 PASS
    Performance:     ratio médio TS/Python
  Exit code 0 se ≥90% passar, 1 caso contrário.
result: blocked
blocked_by: server
reason: "Python backend (porta 8000) não está disponível no ambiente atual"

### 5. Performance budget VAL-06
expected: |
  No relatório do `pnpm e2e`, o ratio médio TS/Python é ≤1.10 (TypeScript no máximo 10% mais lento que Python).
result: blocked
blocked_by: server
reason: "Depende do teste 4 — requer ambos backends rodando para medir latency ratio"

## Summary

total: 5
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 2

## Gaps

[none yet]
