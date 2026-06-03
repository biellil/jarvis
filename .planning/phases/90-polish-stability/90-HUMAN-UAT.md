---
status: partial
phase: 90-polish-stability
source: [89-HUMAN-UAT.md (Phase 89)]
started: ""
updated: ""
---

## Current Test

[awaiting human testing]

## Tests

### 1. Enrollment real via microfone (SPK-10)
expected: Iniciar JARVIS, executar `/config > Speakers (4) > Perfis de voz (2) > Adicionar perfil`, digitar nome (ex: "biel"), gravar 5 utterances de ~4s cada quando solicitado. Arquivo `~/.jarvis/speakers/{nome}.npy` deve ser criado com shape (256,) float32 e escrita atômica (POL-01 WR-01).
result: [pending]

### 2. Identificacao ao vivo end-to-end (SPK-02, SPK-08)
expected: Com um perfil enrolled e `speaker_recognition_enabled=true`, falar via voz e verificar: (a) log `[SPK] {nome} ({score}) -> {nome}` no terminal; (b) prefixo `[{nome}]:` no message enviado ao gateway; (c) header `x-jarvis-speaker={nome}` chegando ao gateway.
result: [pending]

### 3. Threshold rejeita voz desconhecida (SPK-03)
expected: Outro usuario (voz diferente da enrolada) fala. Sistema reporta `name=unknown` no log, prefixo `[unknown]:` (ou `[{candidate}?]:` se score>0 abaixo do threshold) no turn enviado ao gateway.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

[a preencher se algum teste falhar — listar findings que precisam de fix em sub-task dentro da Phase 90]
