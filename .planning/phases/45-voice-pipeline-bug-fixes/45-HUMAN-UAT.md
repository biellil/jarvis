---
status: approved
phase: 45-voice-pipeline-bug-fixes
source: [45-VERIFICATION.md]
started: 2026-05-01T00:00:00Z
updated: 2026-05-01T00:00:00Z
---

## Teste Atual

[aguardando teste manual]

## Testes

### 1. PTT Guard — Teste no modo wake-word
expected: Iniciar o app no modo wake-word padrão. Pressionar o atalho PTT (CmdOrCtrl+Space). Nenhuma gravação deve iniciar. Console deve exibir "[PTT] Hotkey ignored — voice mode is not ptt-only".
result: PASSOU — console exibiu "[PTT] Hotkey ignored — voice mode is not ptt-only" duas vezes após mudar para wake-word.

### 2. Whisper Override — Teste de modelo nas Configurações
expected: Abrir Configurações, definir o modelo Whisper como "medium". Reiniciar o app. Console deve exibir "[voice] Applying user override: medium (was: base)" na inicialização.
result: APROVADO — override aplicado corretamente (modelo "medium" baixado e carregado).

### 3. Modo Auto — Teste com override desativado
expected: Definir o modelo de volta para "auto" nas Configurações. Reiniciar o app. Console deve exibir o log de VRAM ("[voice] Model selected by VRAM: ..."), mas SEM nenhum log de override.
result: APROVADO — comportamento confirmado pelo usuário.

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
