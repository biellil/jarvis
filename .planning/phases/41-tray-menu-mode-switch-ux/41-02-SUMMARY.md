---
phase: 41-tray-menu-mode-switch-ux
plan: "02"
subsystem: desktop-tray
tags: [tray, voice-mode, ipc, electron, vui]
dependency_graph:
  requires:
    - 41-01  # VoiceModeSwitchResult + VOICE_MODE_SWITCH_RESULT adicionados em Wave 0
    - 39     # VoiceModeManager state machine
    - 40     # AlwaysListeningStrategy + createAlwaysListeningFactory
  provides:
    - VoiceModeManager wired into tray (VUI-01)
    - broadcastModeSwitch() IPC broadcast
    - Voice Mode radio submenu no tray
  affects:
    - apps/desktop/src/main/tray.ts
    - apps/desktop/src/main/index.ts
    - apps/desktop/src/main/ipc/voiceMode.ts
    - apps/desktop/src/main/__tests__/tray.test.ts
tech_stack:
  added:
    - ipc/voiceMode.ts: novo módulo IPC para broadcast de mode switch
  patterns:
    - Reuse do padrão broadcastPauseToggle (ipc/settings.ts) para broadcastModeSwitch
    - Radio submenu pattern já usado em Configure Hotkey / Configure PTT
    - Lazy sync via getMode() em buildContextMenu (sem event listeners)
key_files:
  created:
    - apps/desktop/src/main/ipc/voiceMode.ts
  modified:
    - apps/desktop/src/main/tray.ts
    - apps/desktop/src/main/index.ts
    - apps/desktop/src/main/__tests__/tray.test.ts
decisions:
  - "broadcastModeSwitch inline em ipc/voiceMode.ts separado (não em ipc/settings.ts) para coesão de domínio"
  - "Voice Mode submenu inline em buildContextMenu (sem helper extra) — tamanho do arquivo permaneceu razoável"
  - "Falhas pré-existentes em 11 arquivos de teste (28 testes) confirmadas como não-regressões via git stash comparison"
metrics:
  duration: "~25min"
  completed: "2026-04-26T17:05:36Z"
  tasks: 3
  files: 4
---

# Phase 41 Plan 02: Voice Mode Submenu — Implementação Completa (Wave 1)

**Uma linha:** Submenu "Voice Mode" com 3 radio items wired ao VoiceModeManager via broadcastModeSwitch IPC, controle legado de pausa removido, suite de testes verde com 21 passed.

## O que foi construído

Wave 1 entrega VUI-01 completo: o tray agora possui um submenu "Voice Mode" com 3 radio items mutuamente exclusivos (Wake Word, Always-Listening, PTT-only) que chamam `VoiceModeManager.setMode()` e broadcast via `voice-mode:switch-result` IPC em ambos os casos (sucesso e bloqueio). O item legado "Pause listening"/"Resume listening" foi removido.

## Tarefas executadas

### Task 1 — Criar `ipc/voiceMode.ts` com `broadcastModeSwitch()`

**Commit:** `5c92326`

Arquivo novo seguindo o padrão exato de `broadcastPauseToggle` em `ipc/settings.ts`:
- `broadcastModeSwitch(result: VoiceModeSwitchResult)` itera sobre `BrowserWindow.getAllWindows()`
- Verifica `win.isDestroyed()` antes de send (T-41-DESTRUCT mitigado)
- Usa `IPC_CHANNELS.VOICE_MODE_SWITCH_RESULT` do registro type-safe
- Importa de `../../shared/ipc-types.js` com extensão `.js` (padrão ESM do projeto)

### Task 2 — Modificar `tray.ts`

**Commit:** `27b6f20`

Mudanças aplicadas:
- **Imports removidos:** `getWakeWordPaused`, `setWakeWordPaused`, `broadcastPauseToggle`
- **Imports adicionados:** `VoiceModeManager`, `VoiceMode`, `broadcastModeSwitch`
- **Constante nova:** `VOICE_MODE_OPTIONS` com os 3 modos e labels D-07 (`'Wake Word'`, `'Always-Listening'`, `'PTT-only'`)
- **Assinatura de `createTray()`:** agora aceita `voiceModeManager: VoiceModeManager` como 2o parâmetro
- **Assinatura de `buildContextMenu()`:** propagada com `voiceModeManager`
- **Tooltip:** atualizado para `JARVIS — {modeLabel}` (lazy sync via `getMode()`)
- **Submenu "Voice Mode":** primeiro item configurável (após separador inicial, antes de Show) — D-06
- **Click handler:** chama `setMode()` → `broadcastModeSwitch()` incondicional → rebuild condicional em sucesso (D-04)
- **Removido:** bloco inteiro de "Pause listening"/"Resume listening" (D-03)
- **Todas as chamadas internas** de `buildContextMenu()` atualizadas com `voiceModeManager`

Ordem final do menu (D-06):
```
[separator]
Voice Mode (submenu: Wake Word, Always-Listening, PTT-only)
[separator]
Show
Hide
Settings
[separator]
Configure Hotkey (submenu)
Configure PTT (submenu)
[separator]
Open DevTools
[separator]
Quit
```

### Task 3 — Instanciar `VoiceModeManager` em `index.ts` + preencher stubs de teste

**Commit:** `23ca2cc`

**index.ts:**
- Importa `VoiceModeManager` e `createAlwaysListeningFactory`
- Variável de módulo `voiceModeManager: VoiceModeManager | null = null`
- Instancia após `createWindow()` com factory `always-listening` (quando `useWhisperCpp && ttsProvider`)
- Chama `await voiceModeManager.init()`
- Passa `voiceModeManager` para `createTray(mainWindow!, voiceModeManager)`
- Adiciona `voiceModeManager?.dispose()` no handler `before-quit`

**tray.test.ts:**
- 8 stubs `it.todo` preenchidos com assertions reais source-level
- 2 stubs de "Main process tray integration" preenchidos
- 0 `it.todo` restantes

## Resultado dos testes

```
Test Files  1 passed (1)
     Tests  21 passed | 9 skipped (30)
```

Os 9 skipped são os `it.skip` do Wave 0 que cobrem comportamentos do item legado (não mais aplicáveis após D-03).

Falhas na suite completa (28 testes em 11 arquivos) são **pré-existentes** — confirmado via `git stash` + run na base Wave 0: mesmo número de falhas antes e depois das mudanças desta Wave.

## Desvios do Plano

Nenhum — plano executado exatamente como escrito.

## Ameaças Mitigadas

| Ameaça | Mitigação |
|--------|-----------|
| T-41-MODE: Tampering via string arbitrária no setMode() | Array `VOICE_MODE_OPTIONS` usa `as const` TypeScript — apenas os 3 valores válidos de `VoiceMode` passam para `setMode()`. Validação estática em compile time. |
| T-41-IPC: Spoofing do canal `voice-mode:switch-result` | Canal é unidirecional main → renderer. Renderer só escuta, nunca envia. |
| T-41-DESTRUCT: Crash por janela destruída durante broadcast | `broadcastModeSwitch()` verifica `win.isDestroyed()` antes de `send`. |

## Self-Check: PASSED

| Item | Status |
|------|--------|
| apps/desktop/src/main/ipc/voiceMode.ts | FOUND |
| apps/desktop/src/main/tray.ts | FOUND |
| apps/desktop/src/main/index.ts | FOUND |
| apps/desktop/src/main/__tests__/tray.test.ts | FOUND |
| .planning/phases/41-tray-menu-mode-switch-ux/41-02-SUMMARY.md | FOUND |
| Commit 5c92326 (ipc/voiceMode.ts) | FOUND |
| Commit 27b6f20 (tray.ts) | FOUND |
| Commit 23ca2cc (index.ts + tray.test.ts) | FOUND |
