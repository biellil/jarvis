---
phase: 20-e2e-validation-python-comparison
verified: 2026-04-09T00:00:00Z
status: human_needed
score: 7/7 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Rodar `pnpm e2e` com ambos backends (Python :8000 e TS :8001) ativos e validar que o suite completa com exit code 0 e >=90% pass rate"
    expected: "Relatório final mostra PASS/FAIL por categoria; Overall >=90%; exit code 0"
    why_human: "Requer backends rodando — fora do escopo de verificação estática. A fase entrega a infraestrutura; a execução contra backends vivos é manual."
  - test: "Enviar request ao gateway com header `X-Backend-Version: ts` e validar que chega ao backend TypeScript (port 8001); sem o header deve ir para Python (port 8000)"
    expected: "Roteamento observável via logs de ambos backends ou via inspeção de rede"
    why_human: "Testes unitários cobrem resolveUpstreamUrl isoladamente; integração end-to-end com servidor Express vivo requer ambiente local."
  - test: "Validar latency ratio TS/Python <=1.10 em ambiente real"
    expected: "avg TS/Python ratio reportado pelo e2e script <=1.10"
    why_human: "Depende de hardware e ambiente; não pode ser verificado estaticamente."
---

# Phase 20: E2E Validation & Python Comparison — Verification Report

**Phase Goal:** TypeScript backend produz outputs idênticos ao Python backend para mesmos inputs (100% paridade validada). Esta fase entrega a **infraestrutura de validação** (não os resultados de execução).
**Verified:** 2026-04-09
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | E2E suite envia 20 inputs distintos para Python e TS e compara outputs | ✓ VERIFIED | `TEST_INPUTS` array de 20 strings + loop sequencial `sendChat(PYTHON_URL)` / `sendChat(TS_URL)` em `e2e-compare.ts` L61-82, L283-306 |
| 2 | Text responses comparadas via embedding cosine >=0.85 | ✓ VERIFIED | `compareText()` usa `embedText()` + `cosine()`, threshold `TEXT_SIM_THRESHOLD` default 0.85 (L164-171, L44) |
| 3 | Tool calls comparados ou marcados NOT_APPLICABLE quando vazios (VAL-03, fix B-01) | ✓ VERIFIED | `compareToolCalls()` retorna `NOT_APPLICABLE` quando tabela ausente OU ambos vazios (L189-210) |
| 4 | SQLite state comparado (role+content, sem timestamps) | ✓ VERIFIED | `compareSqliteMessages()` lê `role, content` de `messages` table readonly (L220-237) |
| 5 | ChromaDB embeddings comparados via cosine >0.95 (fix B-02, respostas reais) | ✓ VERIFIED | `compareChromadb(pythonReply, tsReply)` embeda respostas reais, threshold 0.95 (L248-255) |
| 6 | Performance medida como ratio TS/Python com threshold <=1.10 | ✓ VERIFIED | `perfRatio = tsRes.latencyMs / pyRes.latencyMs`, PASS se <=1.10 (L323-324) |
| 7 | Gateway feature flag `X-Backend-Version: ts` roteia para TS backend | ✓ VERIFIED | `resolveUpstreamUrl()` em `backendRouter.ts` lê header e retorna `backendTsUrl`/`fastapiUrl`; 3 rotas em `chat.ts` usam a função; unit tests passam (44/44) |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/gateway/src/middleware/backendRouter.ts` | resolveUpstreamUrl exportado | ✓ VERIFIED | 20 linhas, função exportada lê `req.headers['x-backend-version']`, importa `config` |
| `apps/gateway/src/middleware/backendRouter.test.ts` | 3 unit tests | ✓ VERIFIED | 3 `it()` blocks: header ts, sem header, header outro valor — usa `toBe(config.*)` |
| `apps/gateway/src/routes/chat.ts` | 3 rotas usam resolveUpstreamUrl | ✓ VERIFIED | POST /chat (L20), GET /chat/stream (L69), POST /chat/audio (L128) usam `resolveUpstreamUrl(req)`; nenhum `config.fastapiUrl`/`config.backendTsUrl` ativo nas chamadas fetch |
| `apps/backend-ts/scripts/e2e-compare.ts` | Script >=200 linhas com todas categorias | ✓ VERIFIED | 410 linhas; preflight, sendChat, compareText, compareToolCalls, compareSqliteMessages, compareChromadb, main com loop e report |
| `package.json` (root) | script `e2e` | ✓ VERIFIED | L16: `"e2e": "pnpm --filter @jarvis/backend-ts e2e"` |
| `apps/backend-ts/package.json` | script `e2e` | ✓ VERIFIED | L12: `"e2e": "tsx scripts/e2e-compare.ts"` |

### Key Link Verification

| From | To | Via | Status |
|------|-----|-----|--------|
| `chat.ts` | `backendRouter.ts` | `import { resolveUpstreamUrl }` | ✓ WIRED (L6) |
| `backendRouter.ts` | `config.ts` | `import { config }` | ✓ WIRED |
| `backendRouter.test.ts` | `backendRouter.ts` | `import { resolveUpstreamUrl }` | ✓ WIRED |
| `e2e-compare.ts` | `embeddings.ts` | `import { embedText } from '../src/memory/embeddings.js'` | ✓ WIRED (L37) |
| `e2e-compare.ts` | Python+TS backends | `fetch ${PYTHON_URL}/health`, `/chat` | ✓ WIRED (L42-43, L113-114, L133) |
| `e2e-compare.ts` | SQLite files | `better-sqlite3` readonly com `E2E_PYTHON_DB_PATH`/`E2E_TS_DB_PATH` | ✓ WIRED (L36, L156-162) |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| VAL-01 (20 inputs) | 20-02 | ✓ SATISFIED | TEST_INPUTS com 20 strings |
| VAL-02 (text similarity >=0.85) | 20-02 | ✓ SATISFIED | compareText + threshold configurável |
| VAL-03 (tool calls) | 20-02 | ✓ SATISFIED | compareToolCalls com NOT_APPLICABLE handling |
| VAL-04 (SQLite state) | 20-02 | ✓ SATISFIED | compareSqliteMessages |
| VAL-05 (ChromaDB embeddings >0.95) | 20-02 | ✓ SATISFIED | compareChromadb com respostas reais |
| VAL-06 (performance <=110%) | 20-02 | ✓ SATISFIED | perfRatio com threshold 1.10 |
| VAL-07 (gateway feature flag) | 20-01 | ✓ SATISFIED | backendRouter.ts + 3 rotas + 3 unit tests passando |

### Anti-Patterns Found

Nenhum anti-padrão bloqueador encontrado. Script bem estruturado, sem TODOs/FIXMEs críticos, sem returns vazios, sem console.log como única implementação. Os returns `'FAIL'` no catch block do main loop são tratamento legítimo de erro (não stubs).

### Human Verification Required

Ver frontmatter `human_verification`. Três itens requerem execução em ambiente real:

1. **Execução do `pnpm e2e`** contra backends vivos — não verificável estaticamente.
2. **Integração end-to-end do feature flag** — unit tests cobrem a função pura; integração com Express + backends requer teste manual.
3. **Validação de latency real** (VAL-06) — depende de hardware/ambiente.

### Gaps Summary

Nenhuma gap bloqueadora. A fase entregou integralmente a infraestrutura de validação prometida:
- Gateway feature flag implementado, testado e wired nas 3 rotas de chat.
- Script E2E standalone de 410 linhas cobrindo VAL-01 a VAL-06 com correções B-01 (NOT_APPLICABLE), B-02 (respostas reais no ChromaDB compare) e B-03 (pre-flight check).
- Hooks `pnpm e2e` registrados em ambos package.json.
- Voice validation documentada como known limitation per decisão D-01 do CONTEXT.

O status `human_needed` reflete que a **execução** do suite contra backends vivos é intrinsecamente manual — consistente com o escopo declarado da fase (entrega de infraestrutura, não resultados de execução).

---

_Verified: 2026-04-09_
_Verifier: Claude (gsd-verifier)_
