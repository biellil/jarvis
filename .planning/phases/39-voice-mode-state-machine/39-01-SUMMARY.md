---
phase: 39-voice-mode-state-machine
plan: 01
subsystem: voice-mode
tags: [voice, state-machine, types, persistence]
requires: []
provides:
  - VoiceMode union type ('wake-word' | 'always-listening' | 'ptt-only')
  - VoiceModeChangeEvent interface (oldMode, newMode, reason, timestamp)
  - IPC_CHANNELS.VOICE_MODE_CHANGE = 'voiceMode:change'
  - StoreSchema.voiceMode field (electron-store persistence)
  - getVoiceMode() / setVoiceMode() accessors com default 'wake-word' e validação enum
affects:
  - apps/desktop/src/shared/ipc-types.ts
  - apps/desktop/src/main/store.ts
  - apps/desktop/src/main/__tests__/store.test.ts
tech-stack:
  added: []
  patterns:
    - "Default-value-on-read pattern (D-07): store.get() undefined → return default — zero código de migração explícita"
    - "Enum validation no read (T-39-01): valores inválidos são tratados como undefined → return default"
key-files:
  created: []
  modified:
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/main/store.ts
    - apps/desktop/src/main/__tests__/store.test.ts
decisions:
  - "D-05: VoiceModeChangeEvent payload rich {oldMode, newMode, reason, timestamp} — suporta audit log futuro e UX condicional"
  - "D-06: Tipos vivem em shared/ipc-types.ts — pattern v1.7 — não criar arquivos novos só para 2 tipos"
  - "D-07: Migração v1.8→v1.9 via default implícito no read (sem código de migração explícita)"
  - "D-08: reason union é apenas 'user' | 'system' (sem 'migration') — startup nunca emite event, então tipo nem precisa do literal"
  - "T-39-01 mitigation: getVoiceMode() valida enum no read — valor inválido no JSON do store retorna 'wake-word' default"
metrics:
  duration: ~7 minutes
  completed: 2026-04-26T00:44:56Z
  tasks_total: 2
  tasks_completed: 2
  files_modified: 3
  tests_added: 5
  tests_passing: 15 (10 existentes + 5 novos no store.test.ts)
---

# Phase 39 Plan 01: Voice Mode Types & Store Persistence Summary

**One-liner:** VoiceMode union type + VoiceModeChangeEvent em ipc-types.ts; StoreSchema estendido com persistência via getVoiceMode/setVoiceMode com default 'wake-word' (D-07) e validação de enum (T-39-01).

## What Was Built

Fundação de tipos para a máquina de estados de Voice Mode da Phase 39. Plan 02 (VoiceModeManager) consumirá esses tipos diretamente sem precisar explorar codebase.

### Task 1 — VoiceMode types em ipc-types.ts

- **VoiceMode** union literal: `'wake-word' | 'always-listening' | 'ptt-only'`
- **VoiceModeChangeEvent** interface (D-05 rich payload):
  - `oldMode: VoiceMode`
  - `newMode: VoiceMode`
  - `reason: 'user' | 'system'` (D-08: 'migration' nunca emitido — não está no tipo)
  - `timestamp: number` (Unix ms)
- **IPC_CHANNELS.VOICE_MODE_CHANGE** = `'voiceMode:change'` (broadcast main → renderer)

### Task 2 — voiceMode persistence em store.ts

- **StoreSchema** estendido: `voiceMode?: VoiceMode`
- **DEFAULT_VOICE_MODE** = `'wake-word'` constante (D-07)
- **getVoiceMode()**: lê `store.get('voiceMode')`, valida contra enum `validModes`, retorna default se ausente OU inválido (T-39-01 mitigação)
- **setVoiceMode(mode)**: persiste valor direto na chave `'voiceMode'` (não aninhado em objeto)
- Import: `import type { VoiceMode } from '../shared/ipc-types.js'`

## Files Modified

| File | Changes |
|------|---------|
| `apps/desktop/src/shared/ipc-types.ts` | +27 lines — nova seção "Voice Mode Types" com VoiceMode + VoiceModeChangeEvent + IPC_CHANNELS.VOICE_MODE_CHANGE |
| `apps/desktop/src/main/store.ts` | +25 lines — import VoiceMode, StoreSchema field, DEFAULT_VOICE_MODE, getVoiceMode/setVoiceMode |
| `apps/desktop/src/main/__tests__/store.test.ts` | +41 lines — describe block "Voice Mode accessors (Phase 39)" com 5 novos testes |

## Tests Added

5 novos testes em `store.test.ts`:

1. `getVoiceMode() returns 'wake-word' when not set (D-07 migration default)`
2. `setVoiceMode('always-listening') → getVoiceMode() returns 'always-listening'`
3. `setVoiceMode('ptt-only') → getVoiceMode() returns 'ptt-only'`
4. `setVoiceMode writes value directly to store key 'voiceMode'`
5. `getVoiceMode() returns 'wake-word' when store contains invalid value (T-39-01 mitigation)`

**Resultado:** 15/15 testes passando em store.test.ts (10 existentes + 5 novos). Duration: ~800ms.

## Verification

| Check | Result |
|-------|--------|
| `grep "export type VoiceMode" ipc-types.ts` | Match |
| `grep "export interface VoiceModeChangeEvent" ipc-types.ts` | Match |
| `grep "oldMode: VoiceMode" ipc-types.ts` | Match |
| `grep "reason: 'user' \| 'system'" ipc-types.ts` | Match |
| `grep "VOICE_MODE_CHANGE" ipc-types.ts` | Match |
| `grep -E "voiceMode\?: VoiceMode" store.ts` | Match |
| `grep "export function getVoiceMode" store.ts` | Match |
| `grep "export function setVoiceMode" store.ts` | Match |
| `grep "import type { VoiceMode }" store.ts` | Match |
| `npx vitest run src/main/__tests__/store.test.ts` | 15/15 pass |
| `npx tsc --noEmit` for changed files | 0 erros relacionados a VoiceMode/store |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Caminho de import corrigido**
- **Found during:** Task 2 (import VoiceMode em store.ts)
- **Issue:** Plan especificou `import type { VoiceMode } from '../../shared/ipc-types.js'` (dois níveis), mas o caminho correto a partir de `apps/desktop/src/main/store.ts` é `'../shared/ipc-types.js'` (um nível) — `main/` e `shared/` são irmãos dentro de `src/`.
- **Fix:** Aplicado `'../shared/ipc-types.js'` no import.
- **Files modified:** `apps/desktop/src/main/store.ts`
- **Commit:** 75e246d

**2. [Rule 3 - Consistency] Comentário de seção corrigido**
- **Found during:** Task 1
- **Issue:** Plan especificou comentário `// Voice Mode Types — Phase 39 (VMODE-01, VMODE-03)` mas o frontmatter do plan declara requirements `VMODE-02, VMODE-03` (não VMODE-01). VMODE-01 não existe no scope deste plan.
- **Fix:** Comentário ajustado para `// Voice Mode Types — Phase 39 (VMODE-02, VMODE-03)` para refletir requirements corretos.
- **Files modified:** `apps/desktop/src/shared/ipc-types.ts`
- **Commit:** 679b519

**3. [Rule 3 - Consistency] Threat ID corrigido em comentário e teste**
- **Found during:** Task 2
- **Issue:** Plan referencia `T-01` em alguns lugares e `T-39-01` no threat_model. ID canônico é `T-39-01` (formato Phase-XX-ID).
- **Fix:** Comentário em `getVoiceMode()` e nome do teste usam `T-39-01` (formato canônico do threat_model).
- **Files modified:** `apps/desktop/src/main/store.ts`, `apps/desktop/src/main/__tests__/store.test.ts`
- **Commit:** 75e246d

### Out-of-scope (NOT fixed)

Pré-existentes no projeto desktop, não relacionados às mudanças deste plan:

- Múltiplos erros TypeScript em `integration-chat.test.ts`, `voiceHandler.test.ts`, `whisper-gpu-detection.test.ts`, `index.ts`, `settings.test.ts` (módulos faltando, type mismatch Electron, mock typing). Tracked como pre-existing — nenhum deles toca arquivos modificados pelo plan 39-01.

## Threat Model Coverage

| Threat ID | Disposition | Mitigation Implemented |
|-----------|-------------|------------------------|
| T-39-01 | mitigate | `getVoiceMode()` valida `value` contra `validModes: VoiceMode[] = ['wake-word', 'always-listening', 'ptt-only']`. Valor fora do enum → retorna `DEFAULT_VOICE_MODE`. Coberto por teste 5. |
| T-39-02 | accept | Sem ação — payload de VoiceModeChangeEvent contém apenas enum + timestamp, sem PII. |

## Commits

| Task | Type | Hash | Message |
|------|------|------|---------|
| 1 | feat | 679b519 | adicionar VoiceMode types em ipc-types.ts |
| 2 | feat | 75e246d | adicionar voiceMode accessors em store.ts (D-07) |

## Handoff to Plan 02

Plan 02 (VoiceModeManager) pode importar diretamente:

```typescript
import type { VoiceMode, VoiceModeChangeEvent } from '../shared/ipc-types.js';
import { IPC_CHANNELS } from '../shared/ipc-types.js';
import { getVoiceMode, setVoiceMode } from './store.js';
```

Nenhuma exploração de codebase necessária — contratos completos.

## Self-Check: PASSED

- File `apps/desktop/src/shared/ipc-types.ts`: FOUND (modified)
- File `apps/desktop/src/main/store.ts`: FOUND (modified)
- File `apps/desktop/src/main/__tests__/store.test.ts`: FOUND (modified)
- Commit `679b519`: FOUND (Task 1)
- Commit `75e246d`: FOUND (Task 2)
- All 5 success criteria from `<success_criteria>` met:
  - VoiceMode type exportado: yes
  - VoiceModeChangeEvent interface exportada: yes
  - IPC_CHANNELS.VOICE_MODE_CHANGE registrado: yes
  - StoreSchema.voiceMode? campo: yes
  - getVoiceMode default + invalid handling: yes
  - setVoiceMode persiste em 'voiceMode': yes
  - 5 testes novos passando: yes (15/15 total)
  - Zero erros TypeScript relacionados às mudanças: yes
