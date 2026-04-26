---
status: partial
phase: 41-tray-menu-mode-switch-ux
source: [41-VERIFICATION.md]
started: 2026-04-26T15:20:00Z
updated: 2026-04-26T15:20:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Tray menu mostra 3 radio items mutuamente exclusivos no submenu Voice Mode (apenas 1 marcado por vez)
expected: Ao abrir o tray, o submenu 'Voice Mode' apresenta 'Wake Word', 'Always-Listening' e 'PTT-only' com exatamente um marcado refletindo o modo persistido
result: [pending]

### 2. Trocar de modo via tray aplica em <1s sem dialog
expected: Click em qualquer item troca o modo, fecha o menu, e a aplicação continua sem abrir nenhuma janela modal; nenhum spinner ou bloqueio perceptível
result: [pending]

### 3. Reabrir o tray após troca mostra o radio correto (sem stale state)
expected: Após selecionar 'Always-Listening', fechar o menu, e reabri-lo: o radio em 'Always-Listening' está marcado (não o anterior)
result: [pending]

### 4. Comportamento confirmado em Linux, macOS e Windows
expected: Os 3 success criteria do ROADMAP funcionam idênticos nas 3 plataformas (sistema de tray varia: Linux usa AppIndicator/StatusNotifier, macOS usa NSStatusItem, Windows usa Shell_NotifyIcon)
result: [pending]

### 5. WR-01: clicks rápidos consecutivos em modos diferentes não deixam o radio dessincronizado
expected: Clicar em 'Always-Listening' e imediatamente em 'PTT-only' antes do primeiro completar — o radio final reflete o modo realmente ativo (sem ficar marcando algo diferente do estado real)
result: [pending]

### 6. broadcastModeSwitch entrega o evento ao renderer com payload correto
expected: Phase 42 renderer recebe { success, newMode?, label? } via canal 'voice-mode:switch-result' e renderiza toast/badge
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
