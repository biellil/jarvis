# Plan 20-02: E2E Comparison Script — Summary

**Status:** ✅ Complete
**Date:** 2026-04-09
**Requirements:** VAL-01, VAL-02, VAL-03, VAL-04, VAL-05, VAL-06

## O que foi construído

Script standalone `apps/backend-ts/scripts/e2e-compare.ts` (410 linhas) que valida paridade de outputs entre o backend Python (porta 8000) e TypeScript (porta 8001), mais os hooks `pnpm e2e` nos dois `package.json`.

## Commits

| # | Commit | Descrição |
|---|--------|-----------|
| 1 | `1931836` | ✨ feat(e2e): script de comparação Python vs TypeScript (410 linhas) |
| 2 | `351aca6` | 🔧 chore: adiciona pnpm e2e no root e backend-ts package.json |

## Implementação

**Funções principais** (todas presentes no script):
- `preflight()` — valida ambos backends via `/health` antes do loop (fix B-03)
- `sendChat(url, message)` — POST /chat com timing via `performance.now()`
- `compareText(pyReply, tsReply)` — embedding cosine via `embedText()` de `../src/memory/embeddings.js`, threshold `TEXT_SIM_THRESHOLD` (default 0.85)
- `compareToolCalls(pyDb, tsDb)` — retorna `NOT_APPLICABLE` quando tabela `tool_calls` ausente OU ambos têm zero rows (fix B-01)
- `compareSqliteMessages(pyDb, tsDb)` — compara role+content, ignora timestamps
- `compareChromadb(pyReply, tsReply)` — embeda **respostas reais** dos backends e compara cosine (fix B-02, threshold 0.95)
- `generateReport()` — formato exato do CONTEXT.md com exit code baseado em `E2E_PASS_THRESHOLD` (default 0.90)

**Env vars aceitas:**
- `E2E_PYTHON_URL` (default `http://localhost:8000`)
- `E2E_TS_URL` (default `http://localhost:8001`)
- `E2E_PYTHON_DB_PATH` (default `data/jarvis.db`)
- `E2E_TS_DB_PATH` (default `apps/backend-ts/jarvis.sqlite`)
- `TEXT_SIM_THRESHOLD` (default `0.85`)
- `CHROMA_SIM_THRESHOLD` (default `0.95`)
- `E2E_PASS_THRESHOLD` (default `0.90`)

**Known Limitation:** Voice/audio pipeline excluído — providers diferentes por design (nodejs-whisper vs faster-whisper, Speecht5 vs kokoro). Documentado inline no script.

## Package.json hooks

```json
// Root package.json
"e2e": "pnpm --filter @jarvis/backend-ts e2e"

// apps/backend-ts/package.json
"e2e": "tsx scripts/e2e-compare.ts"
```

## Verificação

- ✅ Script criado em `apps/backend-ts/scripts/e2e-compare.ts` (410 linhas)
- ✅ Todas as funções necessárias presentes (grep confirmado)
- ✅ `pnpm e2e` registrado em ambos `package.json`
- ✅ Imports via ESM (`.js` extensions)
- ✅ Todos os 5 blockers do plan-checker resolvidos (B-01 a B-05)

## Como rodar

```bash
# 1. Iniciar backend Python (apps/backend-py ou src/jarvis)
python -m uvicorn main:app --port 8000

# 2. Iniciar backend TypeScript
pnpm dev:backend

# 3. Rodar comparação
pnpm e2e
```

Exit code 0 se ≥90% dos testes passarem, 1 se abaixo do threshold.

## Notas

O SUMMARY.md original (criado pelo agente executor no worktree) foi bloqueado por permissão no sandbox. Este arquivo foi criado manualmente pelo orchestrator após merge do worktree em master.
