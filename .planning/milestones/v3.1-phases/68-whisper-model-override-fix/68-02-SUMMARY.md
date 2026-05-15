---
phase: 68-whisper-model-override-fix
plan: "02"
subsystem: renderer-settings
tags: [whisper, settings-ui, dropdown, bug-fix]
dependency_graph:
  requires: [68-01]
  provides: [renderer-sem-auto, default-base-ui]
  affects: [WhisperSection, SettingsLayout]
tech_stack:
  added: []
  patterns: [radix-select-explicit-options, useState-typed-default]
key_files:
  modified:
    - apps/desktop/src/renderer/src/settings/sections/WhisperSection.tsx
    - apps/desktop/src/renderer/src/settings/SettingsLayout.tsx
decisions:
  - D-03 aplicado — opção 'auto' removida de WHISPER_OPTIONS, MODEL_PROGRESS_LABELS e helperText
  - D-04 aplicado — useState inicial alterado de 'auto' para 'base'
metrics:
  duration: "~10min"
  completed: "2026-05-10"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 2
---

# Phase 68 Plan 02: Remover 'auto' do Dropdown Whisper (Settings UI)

**One-liner:** Remove opção 'auto' do Radix Select do modelo Whisper e define 'base' como default no SettingsLayout.

## What Was Built

Dois arquivos renderer modificados para eliminar completamente o modo 'auto' da UI de configuração do Whisper, conforme decisões D-03 e D-04 do contexto de fase.

### WhisperSection.tsx

- `WHISPER_OPTIONS`: removida entrada `{ label: 'Auto (by VRAM)', value: 'auto' }` — array ficou com 5 entradas explícitas (tiny, base, small, medium, large-v3-turbo)
- `MODEL_PROGRESS_LABELS`: removida chave `auto: 'Auto'`
- `helperText` logic: removido branch `else if (whisperModel === 'auto')` que exibia "Auto: model selected based on available VRAM" — agora apenas dois ramos: success state e fallback manual

### SettingsLayout.tsx

- `useState<WhisperModelOption>('auto')` alterado para `useState<WhisperModelOption>('base')` na linha 98 — default inicial do renderer agora é 'base'

## Verification Results

Todos os critérios de aceitação confirmados:

```
grep "'auto'" WhisperSection.tsx  → vazio (apenas comentário de código)
grep "Auto: model selected"       → vazio
grep "useState.*'base'"           → match em SettingsLayout.tsx:99
grep "useState.*'auto'"           → vazio
WHISPER_OPTIONS                   → 5 entradas (tiny/base/small/medium/large-v3-turbo)
```

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Remover 'auto' de WhisperSection e SettingsLayout | 3d27584 | WhisperSection.tsx, SettingsLayout.tsx |

## Deviations from Plan

Nenhuma — plano executado exatamente conforme especificado.

## Known Stubs

Nenhum. As mudanças são puramente de remoção de opção — o Radix Select passa a renderizar apenas opções explícitas válidas.

## Threat Flags

Nenhum. As mudanças removem superfície (opção 'auto' não mais acessível via UI). Nenhuma nova superfície introduzida.

## Self-Check: PASSED

- [x] `WhisperSection.tsx` modificado: sem 'auto' no array de opções, sem helperText auto
- [x] `SettingsLayout.tsx` modificado: default 'base' confirmado
- [x] Commit `3d27584` existe no branch `worktree-agent-a92018bbe5a623513`
