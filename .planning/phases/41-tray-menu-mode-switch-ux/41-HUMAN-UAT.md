---
status: complete
phase: 41-tray-menu-mode-switch-ux
source: [41-VERIFICATION.md]
started: 2026-04-26T15:20:00Z
updated: 2026-04-26T17:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Tray menu mostra 3 radio items mutuamente exclusivos no submenu Voice Mode (apenas 1 marcado por vez)
expected: Ao abrir o tray, o submenu 'Voice Mode' apresenta 'Wake Word', 'Always-Listening' e 'PTT-only' com exatamente um marcado refletindo o modo persistido
result: pass

### 2. Trocar de modo via tray aplica em <1s sem dialog
expected: Click em qualquer item troca o modo, fecha o menu, e a aplicação continua sem abrir nenhuma janela modal; nenhum spinner ou bloqueio perceptível
result: pass

### 3. Reabrir o tray após troca mostra o radio correto (sem stale state)
expected: Após selecionar 'Always-Listening', fechar o menu, e reabri-lo: o radio em 'Always-Listening' está marcado (não o anterior)
result: pass

### 4. Comportamento confirmado em Linux, macOS e Windows
expected: Os 3 success criteria do ROADMAP funcionam idênticos nas 3 plataformas (sistema de tray varia: Linux usa AppIndicator/StatusNotifier, macOS usa NSStatusItem, Windows usa Shell_NotifyIcon)
result: pass

### 5. WR-01: clicks rápidos consecutivos em modos diferentes não deixam o radio dessincronizado
expected: Clicar em 'Always-Listening' e imediatamente em 'PTT-only' antes do primeiro completar — o radio final reflete o modo realmente ativo (sem ficar marcando algo diferente do estado real)
result: pass

### 6. broadcastModeSwitch entrega o evento ao renderer com payload correto
expected: Phase 42 renderer recebe { success, newMode?, label? } via canal 'voice-mode:switch-result' e renderiza toast/badge
result: pass
note: "Closed by Plan 41-03 (gap closure) — gate D-02 removido em VoiceModeManager.setMode()"

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Closed Gaps

- truth: "Usuário consegue trocar de modo via tray menu sem precisar parar a captura de áudio em andamento"
  status: closed
  closed_by: "Plan 41-03 (gap closure) — commit 8c98c8e remove gate D-02 em VoiceModeManager.setMode()"
  original_reason: "User reported: [VoiceModeManager] setMode('wake-word') blocked — active strategy status: capturing. O VoiceModeManager.setMode() retorna false quando a strategy ativa está em estado 'capturing', impedindo a troca durante captura de áudio."
  severity: major
  test: 6
