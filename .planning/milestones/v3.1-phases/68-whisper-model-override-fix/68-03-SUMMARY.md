---
phase: 68-whisper-model-override-fix
plan: "03"
subsystem: voice-input-tests
tags: [test, whisper, regression, stt, wbug-01]
dependency_graph:
  requires: [68-01, 68-02]
  provides: [WBUG-03]
  affects: [selectWhisperModel, whisperModelResolver, settings-ipc]
tech_stack:
  added: []
  patterns:
    - Matriz pure-function 5×3 (D-09/D-10) para garantir VRAM nunca sobrescreve override
    - Dynamic import + beforeEach resetModules para isolamento de módulos em testes
    - Mock incremental de Electron/store em settings.test.ts conforme API evolui
key_files:
  created:
    - apps/desktop/src/main/__tests__/selectWhisperModel.test.ts
  modified:
    - apps/desktop/src/main/__tests__/whisper-model-resolver.test.ts
    - apps/desktop/src/main/ipc/__tests__/settings.test.ts
decisions:
  - "selectWhisperModel.test.ts cobre 16 casos: 15 da matriz 5×3 + 1 defensivo para auto legado"
  - "settings.test.ts corrigido para refletir API atual do settings.ts (Phase 62-64 additions)"
  - "whisper-model-resolver.test.ts adiciona teste de OPTION_TO_MODEL exportado (D-02)"
metrics:
  duration_minutes: 30
  completed_date: "2026-05-10"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 3
---

# Phase 68 Plan 03: Testes de Regressão WBUG-01 — Summary

**One-liner:** Matriz 5×3 em selectWhisperModel.test.ts garante que VRAM nunca sobrescreve override explícito do usuário; settings.test.ts atualizado sem fixtures 'auto' e com mocks completos da API atual.

## What Was Done

### Task 1: Criar selectWhisperModel.test.ts com matriz 5×3

**Commit:** `7721998`

Criado arquivo de teste com 16 casos cobrindo a regressão WBUG-01:

- **15 casos da matriz (D-09/D-10):** 5 UI options × 3 VRAM scenarios
  - override `tiny` → sempre `tiny` independente de vramModel (CPU/base/large)
  - override `base` → sempre `base`
  - override `small` → sempre `base` via OPTION_TO_MODEL D-12 (caso crítico: GPU alto não vira `large`)
  - override `medium` → sempre `medium`
  - override `large-v3-turbo` → sempre `large` via OPTION_TO_MODEL D-12

- **1 caso defensivo:** `auto` legado (stores não migrados) → retorna `vramModel`

Todos os 16 testes passam confirmados com runner direto no worktree.

### Task 2: Atualizar whisper-model-resolver.test.ts e settings.test.ts

**Commit:** `067f174`

**whisper-model-resolver.test.ts:**
- Adicionado novo describe `OPTION_TO_MODEL export (D-02)` com 1 teste
- Confirma que `OPTION_TO_MODEL` é exportado e contém os mapeamentos corretos: `small→base`, `large-v3-turbo→large`, `tiny→tiny`, `base→base`, `medium→medium`
- Total: 8 testes passando

**settings.test.ts:**
- Linha ~23: `vi.fn<[], 'auto' | ...>(() => 'auto')` → `vi.fn<[], WhisperModelOption>(() => 'base')`
- Linha ~288: `whisperModelOverride: 'auto'` → `whisperModelOverride: 'base'`
- 3 `beforeEach` resets: `mockReturnValue('auto')` → `mockReturnValue('base')`
- Import de `WhisperModelOption` adicionado de `ipc-types`
- Total: 39/39 testes passando

## Deviations from Plan

### Auto-fixed Issues (Rule 2 — Missing critical)

**1. [Rule 2 - Missing] Mocks ausentes em settings.test.ts bloqueavam 3 testes**
- **Found during:** Task 2 — execução dos testes revelou que `settings.ts` usa funções (Phase 62-64) não cobertas pelo mock
- **Issue:** `getTtsLocalOnlyFlag`, `getScreenshotHotkey`, `getMcpServerEnabled` do store; `isKokoroModelCached` de kokoroResources; `changeScreenshotHotkey` de screenshot-hotkey — todos ausentes do mock `vi.mock('../../store', ...)`
- **Fix:** Adicionados mocks para todas as funções faltantes; adicionados mocks de módulo para `../../screenshot-hotkey` e `../../voiceInput/tts/kokoroResources`; fixtures atualizadas com `kokoroLocalOnly`, `kokoroModelCached`, `screenshotHotkey`, `mcpServerEnabled`, `kokoro` voice ID
- **Files modified:** `apps/desktop/src/main/ipc/__tests__/settings.test.ts`
- **Commit:** `067f174`

## Verification Results

```
selectWhisperModel.test.ts: 16/16 passed
whisper-model-resolver.test.ts: 8/8 passed
settings.test.ts: 39/39 passed

Verification checks:
- it( count in selectWhisperModel.test.ts: 16 (>= 16) ✓
- 'auto' + whisper context in settings.test.ts: 0 occurrences ✓
- OPTION_TO_MODEL in whisper-model-resolver.test.ts: true ✓
```

## Known Stubs

Nenhum. Os testes cobrem comportamento real dos módulos pós-fix.

## Threat Flags

Nenhum. Mudanças são somente em arquivos de teste — nenhuma nova superfície de runtime introduzida.

## Self-Check: PASSED

- [x] `apps/desktop/src/main/__tests__/selectWhisperModel.test.ts` — criado (16 testes)
- [x] `apps/desktop/src/main/__tests__/whisper-model-resolver.test.ts` — modificado (8 testes, OPTION_TO_MODEL teste adicionado)
- [x] `apps/desktop/src/main/ipc/__tests__/settings.test.ts` — modificado (39 testes, sem 'auto' em whisper context)
- [x] Commit `7721998` — existe
- [x] Commit `067f174` — existe
