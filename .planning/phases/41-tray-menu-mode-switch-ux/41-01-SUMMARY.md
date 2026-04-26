---
phase: 41-tray-menu-mode-switch-ux
plan: "01"
subsystem: desktop-ipc
tags: [tdd, ipc-types, tray, wave-0, nyquist]
dependency_graph:
  requires: []
  provides:
    - VoiceModeSwitchResult interface em shared/ipc-types.ts
    - IPC_CHANNELS.VOICE_MODE_SWITCH_RESULT canal em shared/ipc-types.ts
    - Stubs Wave 0 (8 it.todo) em tray.test.ts para Phase 41 Wave 1
  affects:
    - apps/desktop/src/main/ipc/voiceMode.ts (produtor futuro Phase 41 Wave 1)
    - Phase 42 renderer (consumer do canal voice-mode:switch-result)
tech_stack:
  added: []
  patterns:
    - Nyquist stubs (it.todo) antes de implementação
    - it.skip para testes obsoletos com comentário explicativo de decisão
key_files:
  created: []
  modified:
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/main/__tests__/tray.test.ts
decisions:
  - Canal IPC unificado 'voice-mode:switch-result' para sucesso e falha (D-02)
  - VoiceModeSwitchResult com newMode? e label? opcionais — presentes apenas em success:true
  - Testes legados de Pause/Resume convertidos para it.skip em vez de removidos — preserva histórico de D-03
metrics:
  duration: "~8 min"
  completed: "2026-04-26"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 41 Plan 01: Wave 0 — Nyquist Stubs + IPC Type Contract Summary

**One-liner:** Contrato IPC VoiceModeSwitchResult + 8 stubs Nyquist para Voice Mode submenu VUI-01, com 9 testes legados D-03 marcados como it.skip.

## Resultado

Plano executado integralmente. 2 tarefas completadas, 0 desvios, 0 falhas nos testes do tray.

```
Test Files  1 passed (1)
      Tests  22 passed (22)
   Duration  642ms
```

## Tipos Adicionados

### `VoiceModeSwitchResult` (shared/ipc-types.ts)

Interface com 3 campos:
- `success: boolean` — true = troca realizada; false = bloqueada (D-02, D-05)
- `newMode?: VoiceMode` — modo destino, presente apenas quando success:true
- `label?: string` — label human-readable ("Wake Word" | "Always-Listening" | "PTT-only"), presente apenas quando success:true (D-07)

### `IPC_CHANNELS.VOICE_MODE_SWITCH_RESULT`

Constante: `'voice-mode:switch-result'`

Adicionada após `VOICE_MODE_DEGRADED` no registro de canais. Produtor: `broadcastModeSwitch()` em Wave 1 Plan 02. Consumer: Phase 42 renderer (toast de confirmação).

## Stubs Criados (8 it.todo)

### describe 'Voice Mode submenu (VUI-01 — Phase 41)' — 6 stubs:

1. `D-07: submenu contém exatamente 3 itens: "Wake Word", "Always-Listening", "PTT-only"`
2. `D-06: submenu "Voice Mode" aparece como primeiro item após separador inicial (antes de Show)`
3. `D-04: buildContextMenu lê VoiceModeManager.getMode() para determinar checked state`
4. `D-01/D-05: click handler chama voiceModeManager.setMode() com o modo correto`
5. `D-02/D-05: broadcastModeSwitch é chamado tanto em success:true quanto em success:false`
6. `D-03: "Pause listening" e "Resume listening" NÃO aparecem em tray.ts`

### describe 'Main process tray integration' — 2 stubs:

7. `VUI-01: createTray aceita VoiceModeManager como segundo parâmetro`
8. `VUI-01: main/index.ts instancia VoiceModeManager e passa para createTray()`

## Stubs Convertidos para it.skip (9 testes)

Testes do describe 'WAKE-03 / D-03: Pause/Resume listening item' que verificavam PRESENÇA do item legado — vão quebrar quando D-03 remover o item em Wave 1:

1. `D-03: getWakeWordPaused removido do tray em Phase 41` (era: imports getWakeWordPaused + setWakeWordPaused)
2. `D-03: broadcastModeSwitch substitui em Phase 41` (era: imports broadcastPauseToggle)
3. `D-03: item removido em Phase 41 — substituído por Voice Mode submenu` (era: contains 'Pause listening')
4. `D-03: item removido em Phase 41 — substituído por Voice Mode submenu` (era: contains 'Resume listening')
5. `D-03: item removido em Phase 41 — Voice Mode submenu é agora o primeiro item` (era: Pause/Resume é FIRST)
6. `D-03: item removido em Phase 41` (era: click handler calls setWakeWordPaused)
7. `D-03: item removido em Phase 41` (era: click handler calls broadcastPauseToggle)
8. `D-03: tooltip atualizado para modo ativo em Phase 41` (era: tooltip reflects paused state)
9. `D-03: item removido em Phase 41` (era: click rebuilds context menu)

**Mantido como it():** `no residual references to wake-word-settings-changed / wakeWordEnabled` — verificação negativa continua válida em Wave 1.

## Commits

| Hash | Tipo | Descrição |
|------|------|-----------|
| `5349457` | feat | VoiceModeSwitchResult e canal IPC VOICE_MODE_SWITCH_RESULT em ipc-types.ts |
| `d411298` | test | stubs Wave 0 (8 it.todo) e 9 it.skip para testes obsoletos D-03 |

## Deviations from Plan

None — plano executado exatamente como escrito.

## Known Stubs

Nenhum. Os `it.todo` são stubs intencionais de Nyquist para Wave 1 — não são stubs de dados que afetam o objetivo do plano (este plano é de contratos e stubs de teste).

## Threat Flags

Nenhum. Wave 0 apenas define tipos e stubs — nenhum canal IPC ativo, nenhum endpoint novo.

## Self-Check: PASSED

- [x] `apps/desktop/src/shared/ipc-types.ts` — modificado e commitado (`5349457`)
- [x] `apps/desktop/src/main/__tests__/tray.test.ts` — modificado e commitado (`d411298`)
- [x] Commits existem: `git log --oneline | grep "5349457\|d411298"` — ambos confirmados
- [x] `grep -n "VoiceModeSwitchResult" ipc-types.ts` — 3 linhas (interface + campo + comentário)
- [x] `grep -n "VOICE_MODE_SWITCH_RESULT" ipc-types.ts` — 1 linha com `'voice-mode:switch-result'`
- [x] `grep -c "it.todo" tray.test.ts` → 8
- [x] `grep -c "it.skip" tray.test.ts` → 9
- [x] `pnpm vitest run tray.test.ts` → 22 passed, 0 failed
