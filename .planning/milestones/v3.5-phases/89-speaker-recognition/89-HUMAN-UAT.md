---
status: partial
phase: 89-identifica-o-de-voz-speaker-recognition-backlog
source: [89-VERIFICATION.md]
started: 2026-05-30T01:04:09Z
updated: 2026-05-30T01:04:09Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Enrollment real via microfone (SPK-10)
expected: Iniciar JARVIS, executar /config → 10 (Perfis de voz) → 1 (Adicionar perfil), digitar nome (ex: "biel"), gravar 5 utterances de ~4s cada quando solicitado. Arquivo `~/.jarvis/speakers/{nome}.npy` deve ser criado com shape (256,) float32.
result: [pending]

### 2. Identificação ao vivo end-to-end (SPK-02, SPK-08)
expected: Com um perfil enrolled e `speaker_recognition_enabled=true`, falar via voz e verificar: (a) log `[SPK] {nome} ({score}) -> {nome}` no terminal; (b) prefixo `[{nome}]:` no message enviado ao gateway; (c) header `x-jarvis-speaker={nome}` chegando ao gateway.
result: [pending]

### 3. Threshold rejeita voz desconhecida (SPK-03)
expected: Outro usuário (voz diferente da enrolada) fala. Sistema reporta `name=unknown` no log, prefixo `[unknown]:` (ou `[{candidate}?]:` se score>0 abaixo do threshold) no turn enviado ao gateway.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
