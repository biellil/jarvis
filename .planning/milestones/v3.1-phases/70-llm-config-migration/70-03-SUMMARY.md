---
phase: 70
plan: "03"
subsystem: desktop/ipc-renderer-strip
tags: [strip, cleanup, renderer, ipc, preload, types, simp-01, simp-02, simp-04]
dependency_graph:
  requires: [70-01, 70-02]
  provides:
    - Settings UI sem dropdown provider LLM, API keys, LM Studio URL, streaming toggle
    - Settings UI sem section Servidor MCP
    - settings:get payload sem fields LLM (privacy: keys nunca cruzam IPC)
    - Surface area minimal — types/channels/handlers LLM e MCP extintos
  affects:
    - apps/desktop/src/renderer/src/settings/SettingsLayout.tsx
    - apps/desktop/src/main/ipc/settings.ts
    - apps/desktop/src/main/ipc/index.ts
    - apps/desktop/src/preload/settings.ts
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/main/ipc/__tests__/settings.test.ts
tech_stack:
  added: []
  patterns:
    - Cirúrgico > refactor (P68/P69 alinhamento) — strip diff mínimo, máximo isolamento
    - Cascade verification pre-strip via grep negativo (research confirmava zero consumers; reverificado em runtime)
    - Out-of-scope guard: scope boundary respected, pre-existing errors documentados em deferred-items.md
key_files:
  created:
    - .planning/phases/70-llm-config-migration/deferred-items.md
  modified:
    - apps/desktop/src/renderer/src/settings/SettingsLayout.tsx
    - apps/desktop/src/main/ipc/settings.ts
    - apps/desktop/src/main/ipc/index.ts
    - apps/desktop/src/preload/settings.ts
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/main/ipc/__tests__/settings.test.ts
  deleted:
    - apps/desktop/src/renderer/src/settings/sections/LlmSection.tsx
    - apps/desktop/src/renderer/src/settings/sections/McpSection.tsx
    - apps/desktop/src/renderer/src/settings/sections/__tests__/LlmSection.test.tsx
    - apps/desktop/src/renderer/src/lib/tokenizer.ts
    - apps/desktop/src/main/ipc/mcp-settings.ts
decisions:
  - "D-13: 5 arquivos deletados (LlmSection, McpSection, LlmSection.test, tokenizer, mcp-settings)"
  - "D-14: SettingsLayout sem state/handlers/nav/imports/props/switch LLM+MCP; activeSection default 'ptt' preservado"
  - "D-11/D-12: 4 IPC handlers removidos (LM_STUDIO_SET_URL, LLM_SET_PROVIDER, STREAMING_LM_STUDIO_EVENTS_SET, RELOAD_LLM) + broadcasts órfãos"
  - "D-16: setupMcpSettingsHandlers call removido de ipc/index.ts; preload bridge window.mcp INTEIRO deletado"
  - "D-18: settings:get payload sem 6 fields LLM (privacy improvement)"
  - "D-19: settings.test.ts mocks LLM removidos + expectations LLM dos testes SETTINGS_GET"
  - "Auto-fix Rule 3: LM_STUDIO_SET_URL handler (não listado no plan original) removido por blocker — chamava setLmStudioUrl deletado em P70-01"
metrics:
  duration_minutes: 18
  completed: "2026-05-12T13:55:57Z"
  tasks_completed: 6
  tasks_total: 6
  files_created: 1
  files_modified: 6
  files_deleted: 5
  lines_removed_net: ~1050
---

# Phase 70 Plan 03: UI/IPC Strip Cirúrgico LLM + MCP Summary

**One-liner:** Strip cirúrgico de UI (LlmSection/McpSection/SettingsLayout) + IPC handlers (LM_STUDIO_SET_URL, LLM_SET_PROVIDER, STREAMING_LM_STUDIO_EVENTS_SET, RELOAD_LLM) + preload bridge window.mcp + types LLM/MCP — 5 arquivos deletados, 6 modificados, ~1050 linhas removidas net.

## Tasks Executadas

| Task | Nome | Commit | Files |
|------|------|--------|-------|
| 1 | Deletar 5 UI/IPC obsoletos | `8c62319` | LlmSection.tsx, McpSection.tsx, LlmSection.test.tsx, tokenizer.ts, mcp-settings.ts |
| 2 | Strip SettingsLayout.tsx (D-14) | `83a2166` | SettingsLayout.tsx |
| 3 | Strip ipc/settings.ts + ipc/index.ts (D-11,12,16,18) | `b1b5bb1` | settings.ts, index.ts |
| 4 | Strip preload/settings.ts (D-11, D-16) | `0f341f2` | preload/settings.ts |
| 5 | Strip shared/ipc-types.ts (D-11,16,18) | `e4429ac` | ipc-types.ts |
| 6 | Strip settings.test.ts mocks + verify (D-19) | `478bb96` | settings.test.ts, deferred-items.md |

## Resultado por Must Have

| Critério | Status |
|----------|--------|
| Settings UI sem dropdown provider, API keys, LM Studio URL, streaming toggle (SIMP-01) | PASS (LlmSection deletado + SettingsLayout strippado) |
| Settings UI sem section "Servidor MCP" (SIMP-02) | PASS (McpSection deletado + nav entry removido) |
| Window preload bridge window.mcp inteiro inexistente | PASS (~25 linhas deletadas em preload/settings.ts) |
| IPC handlers LLM_SET_PROVIDER, RELOAD_LLM, STREAMING_LM_STUDIO_EVENTS_SET removidos | PASS (+ LM_STUDIO_SET_URL pelo Rule 3) |
| ipc/mcp-settings.ts deletado; setupMcpSettingsHandlers não mais chamado | PASS |
| settings:get payload sem lmStudioUrl, llmProvider, *ApiKey, streamingLMStudioEventsEnabled (SIMP-04) | PASS |
| Types LlmProvider, ReloadLlmRequest, McpClientStatus removidos | PASS (cascade global verified — extintos do monorepo) |
| tokenizer.ts deletado (único consumer era LlmSection) | PASS |
| pnpm exec tsc verde para arquivos do plan | PASS (12 erros removidos; 0 introduzidos) |

## What Was Built

### Task 1 — Deletion de 5 arquivos

- `LlmSection.tsx` (139 linhas): section completa com provider dropdown, API keys, LM Studio URL, reload button, streaming toggle.
- `McpSection.tsx` (107 linhas): section MCP Client com toggle, lista, Reconectar button.
- `LlmSection.test.tsx` (190 linhas): testes Phase 52/57/60 que cobriam SEXT-01, SEXT-02, LLM-PROV-01/02.
- `tokenizer.ts` (74 linhas): `estimateContextTokens` helper — único consumer era LlmSection.
- `ipc/mcp-settings.ts` (~190 linhas): handlers MCP Client (reload, getStatus) + broadcast.

McpSection.test.tsx confirmado ausente (research correto).

### Task 2 — SettingsLayout.tsx strip cirúrgico (118 linhas removidas)

- 5 imports removidos (LlmSection, McpSection, LlmProvider, ReloadLlmRequest, Settings/Server icons)
- 6 state vars removidos (lmStudioUrl, llmProvider, streamingLMStudioEventsEnabled, openai/anthropic/geminiApiKey)
- 4 handlers removidos (handleLmStudioUrlChange, handleLlmProviderChange, handleStreamingLMStudioEventsChange, handleReloadLlm)
- useEffect listener onStreamingLMStudioEventsChanged removido
- NAV_ITEMS sem 'LLM Settings' e 'Servidor MCP'
- SectionKey union sem 'llm' e 'mcp-server'
- SettingsSectionProps sem 9 props LLM/MCP
- 2 switch cases ('llm' e 'mcp-server') deletados
- formValues sem lmStudioUrl/llmProvider
- activeSection default 'ptt' inalterado (research confirmou D-14)

### Task 3 — ipc/settings.ts (156 linhas removidas) + ipc/index.ts (2 linhas)

- Payload `settings:get`: 6 fields LLM removidos (lmStudioUrl, llmProvider, openai/anthropic/geminiApiKey, streamingLMStudioEventsEnabled)
- 4 handlers removidos (LM_STUDIO_SET_URL, LLM_SET_PROVIDER, STREAMING_LM_STUDIO_EVENTS_SET, RELOAD_LLM) + broadcasts órfãos (llm:provider-changed, lm-studio:url-changed)
- 12 imports stripados (ReloadLlmRequest type + accessors LLM/streaming)
- `ipc/index.ts`: import + call de `setupMcpSettingsHandlers` removidos

### Task 4 — preload/settings.ts (56 linhas removidas)

- 8 channel consts removidos (LM_STUDIO_SET_URL, LLM_SET_PROVIDER, STREAMING_LM_STUDIO_EVENTS_SET/CHANGED, RELOAD_LLM, MCP_CLIENT_RELOAD/GET_STATUS/STATUS_CHANGED)
- 5 SettingsApi methods removidos (setLmStudioUrl, setLlmProvider, setStreamingLMStudioEvents, onStreamingLMStudioEventsChanged, reloadLlm)
- Bloco inteiro `contextBridge.exposeInMainWorld('mcp', ...)` deletado (~25 linhas)
- Import McpClientStatus removido
- `window.settings` bridge intacto com methods sobreviventes (get, save, close, setVadThreshold, setWakeWordThreshold, setStreamingTts/onStreamingTtsChanged, applyQuietHours/applyFolderWatch/applyDailySummary, onProactiveEvent)

### Task 5 — shared/ipc-types.ts (84 linhas removidas)

- 3 types deletados (LlmProvider, ReloadLlmRequest, McpClientStatus)
- 8 IPC_CHANNELS entries removidas (LM_STUDIO_SET_URL, LLM_SET_PROVIDER, STREAMING_LM_STUDIO_EVENTS_SET, STREAMING_LM_STUDIO_EVENTS_CHANGED, RELOAD_LLM, MCP_CLIENT_RELOAD/GET_STATUS/STATUS_CHANGED)
- SettingsData sem 6 fields LLM
- SettingsApi sem 5 methods LLM e prop `mcp`
- Window declaration sem prop `mcp`

**Cascade global verified**: `grep -rn "LlmProvider\b\|ReloadLlmRequest\b\|McpClientStatus\b"` em todo monorepo retorna apenas:
- Cópia LOCAL standalone de `LlmProvider` em `llm-config.ts` (intencional — comment confirma "Plan 03 deletes ipc-types import")
- Comments em manager.ts e test names (não código)
- Property names (`setLlmProvider`, `getLlmProvider`) em mocks de testes — não usos do type

### Task 6 — settings.test.ts strip mocks + workspace verification

- Mocks deletados: getLmStudioUrl, getLlmProvider, getOpenaiApiKey, getAnthropicApiKey, getGeminiApiKey, getStreamingLMStudioEventsEnabled, setStreamingLMStudioEventsEnabled, set*ApiKey
- Expectations dos 6 fields LLM removidas dos 2 testes SETTINGS_GET (`returns all four fields from store` + `returns defaults when store has no overrides`)
- beforeEach hooks limpos de mocks LLM
- `setWakeWordThreshold` ADICIONADO ao mock store (faltava antes do plano)

**Test result**: 39/39 passing em settings.test.ts. Migration test (Plan 01) continua passando 9/9. Backend-ts: 584/586 passing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] LM_STUDIO_SET_URL handler removido (não listado no plano original)**

- **Found during:** Task 3 — grep cascade verification
- **Issue:** Handler `LM_STUDIO_SET_URL` (linhas 183-202 de `ipc/settings.ts`) chamava `setLmStudioUrl` que foi DELETADO em P70-01 (store.ts strip). Typecheck quebraria.
- **Fix:** Removido handler INTEIRO + import + broadcast `lm-studio:url-changed` + 2 referências `getLmStudioUrl` orfãs em handlers vizinhos. Removido channel `LM_STUDIO_SET_URL` de `ipc-types.ts` + preload + SettingsApi method `setLmStudioUrl`.
- **Files modified:** ipc/settings.ts, preload/settings.ts, ipc-types.ts
- **Commit:** b1b5bb1 (incluído no commit da Task 3)

**Justificativa:** Plan original listava apenas LLM_SET_PROVIDER/RELOAD_LLM/STREAMING_LM_STUDIO_EVENTS_SET, mas `LM_STUDIO_SET_URL` faz parte do mesmo SIMP-01 (Settings UI sem LM Studio URL). Research confirmava strip era seguro (LlmSection era único consumer).

### Pre-existing Issues (Documented in deferred-items.md)

- **131 → 119 TS errors** após strip (baseline já tinha 131 pré-existentes; 12 removidos por força do strip; 0 introduzidos pelo Plan 70-03).
- **44 → 42 vitest failures** após strip (todos pré-existentes; 2 reduzidos por estarem relacionados a mocks que foram limpos; 0 regressões).

Falhas documentadas em `deferred-items.md` (vitest 4.x syntax migration pendente, env GPU drivers Linux, mock setups outdated).

## Threat Model Resolution

| Threat | Status |
|--------|--------|
| T-70-08: EoP via window.settings.reloadLlm para envenenar provider | MITIGATED — Tasks 3-5 deletam handler/channel/preload method/type |
| T-70-09: Info Disclosure de API keys em payload settings:get | MITIGATED — Task 3 strip dos 6 fields LLM — keys jamais cruzam IPC ao renderer |
| T-70-10: Tampering via window.mcp.reload exposed para flood requests | MITIGATED — Task 4 remove bloco inteiro `exposeInMainWorld('mcp', ...)` |

## Verification

```bash
# Cascade negativo confirmado pre-commit em cada Task
grep -rn "LlmSection\|McpSection\|estimateContextTokens" apps/desktop/src/
# Apenas o próprio arquivo + comments em ProactiveSection.tsx

grep -rn "LlmProvider\b\|ReloadLlmRequest\b\|McpClientStatus\b" apps/desktop/src/ apps/backend-ts/src/
# Apenas cópia LOCAL standalone em llm-config.ts (intencional) + comments + mock names

# TS errors diferencial (12 erros removidos)
git stash; pnpm exec tsc --noEmit 2>&1 | grep -c "error TS"  # 131
git stash pop; pnpm exec tsc --noEmit 2>&1 | grep -c "error TS"  # 119

# Vitest diferencial (2 falhas removidas; 0 regressões)
git stash; pnpm exec vitest run | grep "Tests"  # 44 failed | 898 passed
git stash pop; pnpm exec vitest run | grep "Tests"  # 42 failed | 900 passed

# Migration test (Plan 01 deliverable)
pnpm exec vitest run src/main/migrations/__tests__/llm-config.test.ts
# 9/9 passing

# settings.test.ts (sob impacto da Task 6)
pnpm exec vitest run src/main/ipc/__tests__/settings.test.ts
# 39/39 passing

# Backend-ts (Plan 02 deliverable)
cd apps/backend-ts && pnpm exec vitest run
# 584 passed | 1 skipped | 1 todo (586)
```

## Known Stubs

Nenhum stub introduzido. Strip puro — features deletadas em vez de stubbed-out.

## Self-Check: PASSED

- [x] `apps/desktop/src/renderer/src/settings/sections/LlmSection.tsx` — DELETED (verified `! test -f`)
- [x] `apps/desktop/src/renderer/src/settings/sections/McpSection.tsx` — DELETED (verified `! test -f`)
- [x] `apps/desktop/src/renderer/src/settings/sections/__tests__/LlmSection.test.tsx` — DELETED (verified `! test -f`)
- [x] `apps/desktop/src/renderer/src/lib/tokenizer.ts` — DELETED (verified `! test -f`)
- [x] `apps/desktop/src/main/ipc/mcp-settings.ts` — DELETED (verified `! test -f`)
- [x] `apps/desktop/src/renderer/src/settings/SettingsLayout.tsx` — strippado, sem refs LLM/MCP
- [x] `apps/desktop/src/main/ipc/settings.ts` — sem 3 handlers + 6 payload fields + broadcasts órfãos
- [x] `apps/desktop/src/main/ipc/index.ts` — sem setupMcpSettingsHandlers
- [x] `apps/desktop/src/preload/settings.ts` — sem channels LLM/MCP + sem window.mcp bridge
- [x] `apps/desktop/src/shared/ipc-types.ts` — sem types LLM/MCP, sem channels, sem fields
- [x] `apps/desktop/src/main/ipc/__tests__/settings.test.ts` — sem mocks LLM
- [x] Commit `8c62319` — EXISTS (Task 1)
- [x] Commit `83a2166` — EXISTS (Task 2)
- [x] Commit `b1b5bb1` — EXISTS (Task 3)
- [x] Commit `0f341f2` — EXISTS (Task 4)
- [x] Commit `e4429ac` — EXISTS (Task 5)
- [x] Commit `478bb96` — EXISTS (Task 6)
- [x] Cascade global limpo verified — VERIFIED
- [x] settings.test.ts 39/39 passing — VERIFIED
- [x] migration test 9/9 passing — VERIFIED
- [x] backend-ts tests 584/586 passing — VERIFIED
