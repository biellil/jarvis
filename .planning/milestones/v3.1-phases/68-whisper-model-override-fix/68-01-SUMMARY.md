---
phase: 68-whisper-model-override-fix
plan: "01"
subsystem: voice-input
tags: [bug-fix, whisper, stt, model-selection, type-safety]
dependency_graph:
  requires: []
  provides: [WBUG-01, WBUG-02]
  affects: [voice-pipeline, settings-ui, ipc-contract]
tech_stack:
  added: []
  patterns:
    - OPTION_TO_MODEL como single source of truth para mapeamento UI→backend
    - Legacy value normalization no read path do store (sem migração explícita)
    - type-only import para remover dependência de runtime sem quebrar tipos
key_files:
  created: []
  modified:
    - apps/desktop/src/main/voiceInput/whisperModelResolver.ts
    - apps/desktop/src/main/voiceInput/selectWhisperModel.ts
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/main/store.ts
    - apps/desktop/src/main/index.ts
    - apps/desktop/src/main/ipc/whisper.ts
    - apps/desktop/src/main/__tests__/index.main.test.ts
    - apps/desktop/src/main/__tests__/whisper-model-resolver.test.ts
decisions:
  - "D-01: selectWhisperModel reescrito usando OPTION_TO_MODEL — mínimo risco, zero mudança de interface pública"
  - "D-02: OPTION_TO_MODEL exportado de whisperModelResolver.ts como fonte única de mapeamento"
  - "D-03: 'auto' removido de WhisperModelOption — branch defensivo mantido em selectWhisperModel para compatibilidade com stores não migrados"
  - "D-06: detectVramAndSelectModel() removida do startup — import reduzido a type-only"
  - "D-07: normalização legacy 'auto'→'base' no read path do store via cast (stored as string)"
metrics:
  duration_minutes: 25
  completed_date: "2026-05-10T21:16:44Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 8
---

# Phase 68 Plan 01: Whisper Model Override Fix — Core Bug Fix Summary

**One-liner:** Fix cirúrgico em selectWhisperModel para usar OPTION_TO_MODEL de whisperModelResolver — 'small' e 'large-v3-turbo' agora retornam o modelo correto em vez de sempre cair no vramModel.

## What Was Done

### Task 1: Exportar OPTION_TO_MODEL e reescrever selectWhisperModel

**Commit:** `7282ed3`

- `whisperModelResolver.ts`: `const OPTION_TO_MODEL` → `export const OPTION_TO_MODEL` (D-02). Removido branch `if (option === 'auto')` de `resolveWhisperModel` (D-03 — 'auto' não é mais um valor válido do tipo).
- `selectWhisperModel.ts`: Arquivo reescrito completamente. Removido `SUPPORTED_MODELS` e warn-fallback. Agora usa `OPTION_TO_MODEL[override] ?? vramModel` — qualquer override explícito retorna o modelo mapeado (fix de WBUG-01). Branch defensivo mantido para `(override as string) === 'auto'` (stores não migrados).
- `ipc-types.ts`: `WhisperModelOption` agora é `'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo'` — 'auto' removido (D-03).
- `ipc/whisper.ts`: Branch `if (option === 'auto')` removido (código morto após D-03). Import de `getSelectedModel` removido.
- Testes atualizados: `index.main.test.ts` corrigido para refletir novo comportamento ('small'→'base', 'large-v3-turbo'→'large'). `whisper-model-resolver.test.ts` removeu 3 casos de teste com 'auto'.

### Task 2: Atualizar store.ts e index.ts

**Commit:** `bc95b7f`

- `store.ts`: Adicionado `WhisperModelOption` ao import de `ipc-types.ts`. `StoreSchema.whisperModelOverride` remove 'auto'. `getWhisperModelOverride()` agora retorna `WhisperModelOption` e normaliza valores legados: `!stored || (stored as string) === 'auto'` → retorna `'base'` (D-04/D-07). `setWhisperModelOverride` usa `WhisperModelOption` no tipo do parâmetro.
- `index.ts`: Bloco `detectVramAndSelectModel()` (linhas 218-238) substituído por leitura direta do store (D-06). Import de `detectVramAndSelectModel` reduzido a `import type { WhisperModel }`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removida chamada morta a option === 'auto' em ipc/whisper.ts**
- **Found during:** Task 1 — TypeScript reportou TS2367 (comparison without overlap)
- **Issue:** Branch `if (option === 'auto')` em `setupWhisperHandlers` ficou inalcançável após D-03 remover 'auto' do tipo
- **Fix:** Branch removido; `resolvedModel = resolveWhisperModel(option, getVramMbForResolver())` para todos os casos
- **Files modified:** `apps/desktop/src/main/ipc/whisper.ts`
- **Commit:** `7282ed3`

**2. [Rule 2 - Missing critical] Testes de selectWhisperModel atualizados para refletir comportamento correto**
- **Found during:** Task 1 — testes em `index.main.test.ts` usavam 'auto' (TS2345) e asserções antigas ('small'→vramModel, 'large-v3-turbo'→vramModel) eram incorretas para o comportamento corrigido
- **Fix:** Testes reescritos para verificar o comportamento correto pós-fix (D-09/D-10)
- **Files modified:** `apps/desktop/src/main/__tests__/index.main.test.ts`, `apps/desktop/src/main/__tests__/whisper-model-resolver.test.ts`
- **Commit:** `7282ed3`

**3. [Rule 1 - Bug] Cast (stored as string) para checagem legacy 'auto' em store.ts**
- **Found during:** Task 2 — TypeScript TS2367 no `stored === 'auto'` porque schema já não inclui 'auto'
- **Fix:** Cast explícito `(stored as string) === 'auto'` com comentário explicando a intenção de compatibilidade retroativa
- **Files modified:** `apps/desktop/src/main/store.ts`
- **Commit:** `bc95b7f`

## TypeScript Error Count

- **Before changes:** 125 errors (baseline pré-existente — erros em código não relacionado)
- **After changes:** 125 errors (zero novos erros introduzidos pelas mudanças desta phase)

## Known Stubs

Nenhum.

## Threat Flags

Nenhuma nova superfície de segurança introduzida. T-68-01 (store tamper → normalização) implementado via `(stored as string) === 'auto'` check. T-68-02 (VRAM detection removida do startup) implementado em `index.ts`.

## Self-Check: PASSED

- `apps/desktop/src/main/voiceInput/whisperModelResolver.ts` — modificado (OPTION_TO_MODEL exportado)
- `apps/desktop/src/main/voiceInput/selectWhisperModel.ts` — modificado (reescrito com OPTION_TO_MODEL)
- `apps/desktop/src/shared/ipc-types.ts` — modificado ('auto' removido do tipo)
- `apps/desktop/src/main/store.ts` — modificado (normalização legacy, import WhisperModelOption)
- `apps/desktop/src/main/index.ts` — modificado (VRAM block substituído por store read)
- `apps/desktop/src/main/ipc/whisper.ts` — modificado (branch 'auto' removido)
- Commit `7282ed3` — existe
- Commit `bc95b7f` — existe
