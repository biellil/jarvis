---
status: partial
phase: 23-orb-ux-polish
source: [23-VERIFICATION.md]
started: 2026-04-11T16:20:00Z
updated: 2026-04-11T16:20:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Wake burst visual timing
expected: Após disparar o wake word 'Hey JARVIS', o orb mostra um pulse (scale 1.0→1.1→1.0) + amber ring (#F59E0B) por ~350ms antes de virar laranja (listening)
result: [pending]

### 2. Paused visual distinction (idle ATIVO vs idle PAUSADO)
expected: Clicar 'Pause listening' no tray → orb fica visualmente mais tênue (opacity 0.6, glow cyan mais fraco, border interno cinza). Clicar 'Resume listening' → orb volta pro visual normal
result: [pending]

### 3. Tray menu label dinâmico + tooltip sincronizado
expected: Primeiro item do menu tray alterna entre 'Pause listening' ↔ 'Resume listening'. Tooltip do tray alterna entre 'JARVIS — listening' ↔ 'JARVIS — paused'
result: [pending]

### 4. Persistência cross-session do wakeWordPaused
expected: Pausar → fechar app → reabrir → orb ainda paused (estado persistido via electron-store)
result: [pending]

### 5. prefers-reduced-motion desliga animações preservando transitions
expected: Com OS setting de reduced-motion ativo — (a) orb NÃO tem animate-pulse-idle loop, (b) mudança de state ainda transiciona cor/glow em 0.4s, (c) wake word detection pula o delay de 350ms e vai direto pra listening
result: [pending]

### 6. E2E wake word flow com burst precedendo listening
expected: Falar 'Hey JARVIS' → burst amber aparece IMEDIATAMENTE → 350ms depois orb vira listening (laranja). Usuário percebe 'detectei você' antes de 'gravando'
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
