---
phase: 70
plan: "01"
subsystem: desktop/migrations
tags: [migration, electron-store, dotenv, store-cleanup, simp-03, simp-04]
dependency_graph:
  requires: []
  provides: [llm-config-migration-pure-fn, llm-config-migration-runner, store-llm-cleanup]
  affects: [apps/desktop/src/main/index.ts, apps/desktop/src/main/store.ts]
tech_stack:
  added: [dotenv@^17.4.2 (parse only)]
  patterns: [pure-fn + side-effect wrapper, atomic write via temp+rename, batch store delete]
key_files:
  created:
    - apps/desktop/src/main/migrations/llm-config.ts
    - apps/desktop/src/main/migrations/llm-config-runner.ts
    - apps/desktop/src/main/migrations/__tests__/llm-config.test.ts
  modified:
    - apps/desktop/src/main/index.ts
    - apps/desktop/src/main/store.ts
    - apps/desktop/package.json
decisions:
  - "D-02: .env value wins when non-empty; empty/absent .env is filled from store"
  - "D-03: idempotency via store key deletion after migration (no separate flag)"
  - "D-04: migration runs before process.loadEnvFile so values are available at boot"
  - "D-05: .env absent = no-op + warn (never creates the file)"
  - "D-06: store key always deleted regardless of who won (env or store)"
  - "D-07: boolean serialized as 'true'/'false' literal (compatible with z.coerce.boolean)"
  - "T-70-02: atomic .env write via writeFileSync(tmp)+renameSync (POSIX atomic)"
  - "T-70-03: orphaned tmp file cleaned up in catch block before re-raise"
  - "T-70-04: batch store delete via store.store = current (1 write not 6)"
metrics:
  duration_minutes: 90
  completed: "2026-05-11T14:45:22Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 3
---

# Phase 70 Plan 01: LLM Config Migration — Pure Function + Runner + Store Cleanup Summary

**One-liner:** Migração idempotente de configuração LLM do electron-store para `.env` usando pure function `migrateLlmConfigToEnv` + wrapper `runLlmConfigMigration`, com remoção de 10 accessors e 6 schema entries do store.ts.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Pure function + runner + testes | fa3577f | llm-config.ts, llm-config-runner.ts, llm-config.test.ts, package.json |
| 2 | Hook em index.ts (D-04) | 29d13d5 | index.ts |
| 3 | Strip schema + accessors store.ts (SIMP-04) | 4bcd58e | store.ts, pnpm-lock.yaml |

## What Was Built

### Task 1 — Pure function `migrateLlmConfigToEnv`

`apps/desktop/src/main/migrations/llm-config.ts` (179 linhas):

- `STORE_TO_ENV` map: 6 chaves (`llmProvider→LLM_PROVIDER`, `lmStudioUrl→LM_STUDIO_URL`, `geminiApiKey→GEMINI_API_KEY`, `openaiApiKey→OPENAI_API_KEY`, `anthropicApiKey→ANTHROPIC_API_KEY`, `streamingLMStudioEventsEnabled→USE_LM_STUDIO_STREAMING_EVENTS`)
- `LLM_STORE_KEYS` array (ordem fixa para iteração determinística)
- `extractStoreValue`: desempacota `{ key: string }` para API keys (D-04 Phase 57)
- `serializeEnvValue`: boolean → `"true"`/`"false"` literal (D-07)
- `upsertEnvKey`: substitui linha existente (incluindo vazia) ou appends; preserva comentários e linhas em branco via regex por linha
- `migrateLlmConfigToEnv(envContent, snapshot): MigrationResult`: retorna `migratedKeys`, `skippedKeys`, `keysToDelete`, `newEnvContent`

`apps/desktop/src/main/migrations/llm-config-runner.ts` (82 linhas):

- Lê snapshot via `store.get()` direto (não usa accessors, que serão deletados no Task 3)
- Guard de idempotência: `LLM_STORE_KEYS.some(k => snapshot[k] !== undefined)` — early return se store limpo
- Atomic write: `writeFileSync(tmpPath) + renameSync(tmpPath, envPath)` com cleanup de tmp em catch
- Batch delete: `store.store = current as never` (1 write para electron-store vs 6)

`apps/desktop/src/main/migrations/__tests__/llm-config.test.ts` (101 linhas, 9 testes):

Todos os 9 cenários do RESEARCH.md Example 3 cobertos e passando:
1. No-op quando store vazio
2. Escreve todas as chaves quando .env vazio
3. Preserva .env quando tem valor não-vazio (D-02)
4. Sobrescreve .env quando chave existe mas está vazia (D-02)
5. Preserva comentários e linhas em branco
6. Serializa boolean como "true"/"false" (D-07)
7. Desempacota `{key: string}` para API keys
8. Idempotente — segunda execução é no-op
9. Misto: algumas chaves ganham no .env, outras na store

### Task 2 — Hook em index.ts

Adicionado no topo de `apps/desktop/src/main/index.ts`:
- Import de `runLlmConfigMigration`
- `envPath` extraído para escopo do módulo
- `try { runLlmConfigMigration(envPath) } catch { console.error(...) }` não-fatal
- Executa ANTES de `process.loadEnvFile(envPath)` (D-04)

### Task 3 — Strip store.ts (SIMP-04, store-side)

Removido de `apps/desktop/src/main/store.ts`:
- 6 schema entries: `llmProvider`, `lmStudioUrl`, `geminiApiKey`, `openaiApiKey`, `anthropicApiKey`, `streamingLMStudioEventsEnabled`
- 10 funções exportadas: `getLmStudioUrl`, `setLmStudioUrl`, `getLlmProvider`, `setLlmProvider`, `getStreamingLMStudioEventsEnabled`, `setStreamingLMStudioEventsEnabled`, `getGeminiApiKey`, `setGeminiApiKey`, `getOpenaiApiKey`, `setOpenaiApiKey`, `getAnthropicApiKey`, `setAnthropicApiKey`
- 4 constantes: `LM_STUDIO_URL_DEFAULT`, `LLM_PROVIDER_DEFAULT`, `VALID_LLM_PROVIDERS`, `STREAMING_LM_STUDIO_EVENTS_DEFAULT`
- Substituído import `LlmProvider` por `WhisperModelOption` (type ainda usado na store)
- 492 → 400 linhas (−92 linhas)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Ordem de `migratedKeys` no teste misto (cenário 9)**
- **Found during:** Task 1 — vitest run
- **Issue:** Teste esperava `['OPENAI_API_KEY', 'LM_STUDIO_URL']` mas `migrateLlmConfigToEnv` itera `LLM_STORE_KEYS` em ordem fixa → `lmStudioUrl` (index 1) vem antes de `openaiApiKey` (index 3), então resultado é `['LM_STUDIO_URL', 'OPENAI_API_KEY']`
- **Fix:** Corrigido expected order no test
- **Files modified:** llm-config.test.ts
- **Commit:** fa3577f

**2. [Rule 3 - Blocker] Worktree branch com base errada**
- **Found during:** Pre-execution
- **Issue:** `ACTUAL_BASE` era `e0da0b6`, esperado `d5b23b9`
- **Fix:** `git reset --soft d5b23b931801f21ae1f9771d5283fd39d1bbeef4`
- **Files modified:** nenhum (apenas ponteiro de branch)
- **Commit:** N/A

## Verification

Testes: `pnpm --filter @jarvis/desktop exec vitest run src/main/migrations/__tests__/llm-config.test.ts`

```
Test Files  1 passed (1)
     Tests  9 passed (9)
  Duration  569ms
```

## Known Stubs

Nenhum. Todos os valores são processados e escritos dinamicamente a partir do electron-store.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: file-write | llm-config-runner.ts | Escreve `.env` que pode conter API keys; atomic write via rename mitiga truncation parcial; arquivo já existia com permissões do usuário |

## Self-Check: PASSED

- [x] `apps/desktop/src/main/migrations/llm-config.ts` — EXISTS
- [x] `apps/desktop/src/main/migrations/llm-config-runner.ts` — EXISTS
- [x] `apps/desktop/src/main/migrations/__tests__/llm-config.test.ts` — EXISTS
- [x] Commit `fa3577f` — EXISTS (Task 1)
- [x] Commit `29d13d5` — EXISTS (Task 2)
- [x] Commit `4bcd58e` — EXISTS (Task 3)
- [x] 9 testes passando — VERIFIED
- [x] grep LLM accessors em store.ts → nenhum resultado — VERIFIED
