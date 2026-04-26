---
phase: 41-tray-menu-mode-switch-ux
verified: 2026-04-26T15:20:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Tray menu mostra 3 radio items mutuamente exclusivos no submenu Voice Mode (apenas 1 marcado por vez)"
    expected: "Ao abrir o tray, o submenu 'Voice Mode' apresenta 'Wake Word', 'Always-Listening' e 'PTT-only' com exatamente um marcado refletindo o modo persistido"
    why_human: "Requer renderização visual do system tray nativo (Electron Menu) — não verificável via grep/static analysis"
  - test: "Trocar de modo via tray aplica em <1s sem dialog"
    expected: "Click em qualquer item troca o modo, fecha o menu, e a aplicação continua sem abrir nenhuma janela modal; nenhum spinner ou bloqueio perceptível"
    why_human: "Performance percebida (sub-segundo) e ausência de modal só podem ser confirmadas com app rodando interativamente — Success Criterion 2 do ROADMAP"
  - test: "Reabrir o tray após troca mostra o radio correto (sem stale state)"
    expected: "Após selecionar 'Always-Listening', fechar o menu, e reabri-lo: o radio em 'Always-Listening' está marcado (não o anterior)"
    why_human: "Validação do rebuild do contextMenu após click — requer interação real do usuário com o tray nativo, conforme Success Criterion 3 do ROADMAP"
  - test: "Comportamento confirmado em Linux, macOS e Windows"
    expected: "Os 3 success criteria do ROADMAP funcionam idênticos nas 3 plataformas (sistema de tray varia: Linux usa AppIndicator/StatusNotifier, macOS usa NSStatusItem, Windows usa Shell_NotifyIcon)"
    why_human: "Multi-platform tray behavior só é verificável executando o app em cada SO — APIs nativas variam entre plataformas"
  - test: "WR-01: clicks rápidos consecutivos em modos diferentes não deixam o radio dessincronizado"
    expected: "Clicar em 'Always-Listening' e imediatamente em 'PTT-only' antes do primeiro completar: o radio final reflete o modo realmente ativo (sem ficar marcando algo diferente do estado real)"
    why_human: "Race condition entre setMode async + setContextMenu rebuild — só reproduzível com timing real de cliques humanos no tray nativo (flagged em 41-REVIEW.md WR-01)"
  - test: "broadcastModeSwitch entrega o evento ao renderer com payload correto"
    expected: "Phase 42 renderer recebe { success, newMode?, label? } via canal 'voice-mode:switch-result' e renderiza toast/badge"
    why_human: "Phase 42 ainda não implementada — só haverá consumer real do canal IPC para validar end-to-end na próxima fase"
---

# Phase 41: Tray Menu + Mode Switch UX Verification Report

**Phase Goal:** Usuário consegue trocar de modo de voz instantaneamente via tray menu — sem modal, sem reiniciar, troca aplicada em menos de 1 segundo, estado do menu sempre reflete o modo real
**Verified:** 2026-04-26T15:20:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | Tray menu exibe submenu 'Voice Mode' com 3 itens radio mutuamente exclusivos (Wake Word, Always-Listening, PTT-only) | ✓ VERIFIED | tray.ts:46-50 (VOICE_MODE_OPTIONS), tray.ts:81-102 (submenu com `type: 'radio'`), 3 itens enumerados; teste D-07 e D-06 passam |
| 2   | Clicar num item do submenu chama VoiceModeManager.setMode() e envia IPC voice-mode:switch-result | ✓ VERIFIED | tray.ts:89 `await voiceModeManager.setMode(option.mode, 'user')`; tray.ts:90-94 `broadcastModeSwitch({ success, newMode, label })`; testes D-01/D-05 e D-02/D-05 passam |
| 3   | 'Pause listening'/'Resume listening' não aparecem mais no menu (D-03) | ✓ VERIFIED | grep retorna 0 linhas em tray.ts; imports `getWakeWordPaused`, `setWakeWordPaused`, `broadcastPauseToggle` removidos; teste D-03 passa |
| 4   | Menu rebuilt após troca bem-sucedida reflete o radio correto marcado | ✓ VERIFIED | tray.ts:96-99 `if (success) { const newMenu = buildContextMenu(...); tray?.setContextMenu(newMenu); }`; tray.ts:86 `checked: option.mode === currentMode` lazy via getMode() |
| 5   | Troca bloqueada (setMode retorna false) envia IPC com success:false sem rebuild | ✓ VERIFIED | tray.ts:90-94 `broadcastModeSwitch` chamado incondicionalmente antes do `if (success)`; teste D-02/D-05 valida ordem (broadcast antes do rebuild) |
| 6   | VoiceModeManager está instanciado em main/index.ts e passado para createTray() | ✓ VERIFIED | index.ts:41 import; index.ts:45 declaração de variável; index.ts:260-275 instanciação com factory; index.ts:276 init(); index.ts:279 `createTray(mainWindow!, voiceModeManager)`; index.ts:318-320 dispose no before-quit |

**Score:** 6/6 truths verified

### ROADMAP Success Criteria

| #   | Criterion | Status | Evidence |
| --- | --------- | ------ | -------- |
| SC1 | Tray menu exibe submenu 'Voice Mode' com 3 itens radio (Wake Word, Always-Listening, PTT-only) — apenas 1 marcado por vez | ✓ VERIFIED (estrutura); ? HUMAN (renderização) | tray.ts implementa estrutura correta; visual nativo precisa confirmação humana |
| SC2 | Clicar num item do submenu aplica a troca de modo em menos de 1 segundo sem abrir nenhum dialog ou janela | ✓ VERIFIED (sem modal); ? HUMAN (latência <1s) | Nenhum dialog.show* no click handler; latência percebida só com app rodando |
| SC3 | Abrir o tray menu após trocar de modo mostra o radio correto marcado — não o estado stale anterior (Linux, macOS e Windows) | ✓ VERIFIED (lógica); ? HUMAN (multi-OS) | Lazy sync via getMode() + rebuild; verificação cross-platform requer execução em cada SO |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `apps/desktop/src/main/__tests__/tray.test.ts` | Stubs Wave 0 + assertions Wave 1 (VUI-01) | ✓ VERIFIED | 21 testes passam, 9 it.skip (legados D-03), 0 it.todo restantes; bloco "Voice Mode submenu (VUI-01 — Phase 41)" com 6 assertions reais |
| `apps/desktop/src/shared/ipc-types.ts` | VoiceModeSwitchResult + VOICE_MODE_SWITCH_RESULT | ✓ VERIFIED | Interface em linha 177-184 com 3 campos (success, newMode?, label?); canal `'voice-mode:switch-result'` em IPC_CHANNELS:221 |
| `apps/desktop/src/main/tray.ts` | createTray(mainWindow, voiceModeManager) com Voice Mode submenu | ✓ VERIFIED | linha 52 nova assinatura; linhas 81-102 submenu Voice Mode; legado removido (Pause/Resume = 0 ocorrências) |
| `apps/desktop/src/main/ipc/voiceMode.ts` | broadcastModeSwitch() — IPC broadcast | ✓ VERIFIED | Função export em linha 21-27, isDestroyed() guard em linha 23, usa IPC_CHANNELS.VOICE_MODE_SWITCH_RESULT |
| `apps/desktop/src/main/index.ts` | Instância de VoiceModeManager passada para createTray() | ✓ VERIFIED | Imports linha 41, instanciação linhas 260-276, createTray() linha 279, dispose linha 318 |

### Key Link Verification

| From | To  | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| tray.test.ts | tray.ts | fs.readFileSync source-level | ✓ WIRED | tray.test.ts:12-15 reads tray.ts via fs.readFileSync; uses `traySource.toContain` and `traySource.toMatch` (gsd-tools regex did not match exact pattern but manual grep confirms presence) |
| ipc-types.ts | ipc/voiceMode.ts | IPC_CHANNELS.VOICE_MODE_SWITCH_RESULT import | ✓ WIRED | ipc/voiceMode.ts:11 importa `IPC_CHANNELS, type VoiceModeSwitchResult`; usa em linha 24 |
| tray.ts | voiceMode/index.ts | voiceModeManager.setMode() + getMode() | ✓ WIRED | tray.ts:73 `voiceModeManager.getMode()` e tray.ts:89 `voiceModeManager.setMode(option.mode, 'user')` (gsd-tools regex escaping issue; manual grep confirma 2 ocorrências) |
| tray.ts | ipc/voiceMode.ts | broadcastModeSwitch(result) | ✓ WIRED | tray.ts:26 import; tray.ts:90-94 chamada com payload completo |
| index.ts | tray.ts | createTray(mainWindow, voiceModeManager) | ✓ WIRED | index.ts:279 `createTray(mainWindow!, voiceModeManager)` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| tray.ts (submenu) | currentMode | voiceModeManager.getMode() (lazy a cada buildContextMenu) | Yes — VoiceModeManager.getMode() lê this.currentMode (linha 156 de voiceMode/index.ts) populado pelo electron-store via VMODE-02 | ✓ FLOWING |
| tray.ts (broadcast payload) | success / newMode / label | result de voiceModeManager.setMode() (boolean real); option.mode/label de VOICE_MODE_OPTIONS (constants) | Yes — setMode retorna boolean baseado em transição real; labels D-07 são constantes corretas | ✓ FLOWING |
| ipc/voiceMode.ts (renderer broadcast) | result: VoiceModeSwitchResult | Caller (tray.ts) passa payload construído no click handler | Yes — payload sempre tem success real; newMode/label opcionais quando success:true | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Tray test suite passa sem falhas | `pnpm exec vitest run src/main/__tests__/tray.test.ts --no-coverage` | 21 passed, 9 skipped (30 total), 0 failed | ✓ PASS |
| 0 it.todo remanescentes em tray.test.ts | `grep -c "it\.todo" tray.test.ts` | 0 | ✓ PASS |
| Pause/Resume removidos de tray.ts | `grep -E "Pause listening\|Resume listening\|getWakeWordPaused\|setWakeWordPaused\|broadcastPauseToggle" tray.ts` | 0 ocorrências | ✓ PASS |
| 3 radio items presentes no Voice Mode submenu | `grep -E "label: 'Wake Word'\|label: 'Always-Listening'\|label: 'PTT-only'" tray.ts` | 3 linhas (47, 48, 49) | ✓ PASS |
| isDestroyed() guard em broadcastModeSwitch | `grep "isDestroyed" ipc/voiceMode.ts` | 1 ocorrência (linha 23) | ✓ PASS |
| VoiceModeManager wired em index.ts | `grep -E "VoiceModeManager\|voiceModeManager" index.ts` | 6 ocorrências (import, decl, instanc, init, createTray, dispose) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| VUI-01 | 41-01-PLAN, 41-02-PLAN | Tray menu inclui submenu "Voice Mode" com 3 radio button items mutuamente exclusivos; clique aplica mudança em <1s sem necessidade de modal dialog | ✓ SATISFIED (estrutura), ? HUMAN (latência <1s) | Submenu implementado com 3 radios em tray.ts:81-102; nenhum dialog.show* no click handler; latência percebida exige confirmação visual humana |

**Coverage check:** REQUIREMENTS.md mapeia apenas VUI-01 a Phase 41. Ambos os planos (41-01, 41-02) declaram `requirements: [VUI-01]`. Nenhum requirement orfão.

### Anti-Patterns Found

Nenhum. Scan dos 5 arquivos modificados (tray.ts, ipc/voiceMode.ts, index.ts, ipc-types.ts, tray.test.ts) não revelou:
- TODO/FIXME/XXX/HACK/PLACEHOLDER
- Returns vazios (return null/{}/[])
- Handlers placeholder (=> {})
- Strings "not implemented" / "coming soon"

### Human Verification Required

Veja frontmatter `human_verification` para detalhes completos. Resumo:

1. **Tray rendering** — submenu visual com 3 radios mutuamente exclusivos (SC1)
2. **Latência <1s** — performance percebida sem modal (SC2)
3. **Rebuild correto** — radio reflete novo modo após reabrir tray (SC3)
4. **Multi-OS** — Linux + macOS + Windows (SC3 explicitamente exige)
5. **WR-01 race** — clicks rápidos não devem dessincronizar UI (REVIEW warning)
6. **Phase 42 integration** — broadcast IPC consumido por toast/badge na próxima fase

### Gaps Summary

Nenhum gap programático. Todos os 6 must-haves declarados nos PLANs estão verificados (artifacts existem, são substantivos, estão wired, e dados fluem). Os 3 ROADMAP Success Criteria têm a parte estrutural verificada via static analysis e suite de testes (21 passed, 0 failed); a parte experiencial (latência percebida, renderização nativa, comportamento cross-platform) requer verificação humana — esperado para fase com componente UI nativo.

**Notas adicionais:**
- 41-REVIEW.md identificou 3 warnings (WR-01 race condition, WR-02 mocks faltando em index.test.ts, WR-03 não revisado aqui) — nenhum bloqueia o objetivo do phase, mas WR-01 é candidato a follow-up em Phase 42 ou bug fix dedicado.
- Submenu order (D-06) coloca Voice Mode antes de Show — confirmado por teste e visualmente em tray.ts:78-82.
- Tooltip atualizado para `JARVIS — {modeLabel}` (tray.ts:74-75) — verificado por leitura, mas a mudança de tooltip dinâmica em runtime é parte do human verification.

---

_Verified: 2026-04-26T15:20:00Z_
_Verifier: Claude (gsd-verifier)_
