---
status: complete
phase: 90-polish-stability
source: [89-HUMAN-UAT.md (Phase 89), 90-03-SUMMARY.md]
started: 2026-06-09T22:11:12Z
updated: 2026-06-09T23:30:00Z
verified_artifacts:
  - "~/.jarvis/speakers/biel.npy: shape (256,) float32, 1152 bytes"
---

## Current Test

[testing complete]

## Tests

### 1. Enrollment real via microfone (SPK-10)
expected: Iniciar JARVIS, executar `/config > Speakers (4) > Perfis de voz (2) > Adicionar perfil`, digitar nome (ex: "biel"), gravar 5 utterances de ~4s cada quando solicitado. Arquivo `~/.jarvis/speakers/{nome}.npy` deve ser criado com shape (256,) float32 e escrita atômica (POL-01 WR-01).
result: pass

### 2. Identificacao ao vivo end-to-end (SPK-02, SPK-08)
expected: Com um perfil enrolled e `speaker_recognition_enabled=true`, falar via voz e verificar: (a) log `[SPK] {nome} ({score}) -> {nome}` no terminal; (b) prefixo `[{nome}]:` no message enviado ao gateway; (c) header `x-jarvis-speaker={nome}` chegando ao gateway.
result: pass
notes: |
  Primeira tentativa: issue (2 sintomas) — [SPK] biel (0.72) -> unknown / [STT] -> Опа, буа ночь.
  Re-teste apos fix confirmou PASS ao vivo:
    [SPK] biel (0.77) -> biel   (identificacao OK, score acima do threshold)
    [STT] -> Olá, boa noite.    (transcricao PT correta — bug do idioma resolvido)
  (A) Threshold: resolvido como ajuste de config pelo usuario (score subiu para 0.77).
  (B) STT idioma: FIX DE CODIGO via quick task 260609-rw9 (commit 9360e7d2) — verificado ao vivo.

### 3. Threshold rejeita voz desconhecida (SPK-03)
expected: Outro usuario (voz diferente da enrolada) fala. Sistema reporta `name=unknown` no log, prefixo `[unknown]:` (ou `[{candidate}?]:` se score>0 abaixo do threshold) no turn enviado ao gateway.
result: pass
notes: Voz diferente (nao-enrolled) rejeitada corretamente como unknown — confirmado pelo usuario ao vivo.

### 4. Menu /config hierarquico (POL-03)
expected: No chat, digitar `/config`. Aparece menu raiz com 5 grupos numerados — 1.LLM 2.Voice 3.Memory 4.Speakers 5.System (0.Sair). Entrar em cada grupo mostra breadcrumb `Config > <Grupo>` no topo. `Voice` lista STT/TTS/modo/voz (item 5 "audio ref" so aparece se tts_provider=chatterbox). `Memory` mostra placeholder "em breve". `0` volta um nivel em qualquer submenu e sai no raiz. Ctrl+C dentro de um submenu retorna ao chat sem crash. Opcao invalida (ex: `9`) mostra "Opcao invalida" sem sair do loop.
result: pass
notes: |
  Confirmado ao vivo: raiz com os 5 grupos; submenu 'Config > Voice' com breadcrumb e lista
  STT/TTS/modo/voz; item 'audio ref' corretamente OCULTO (tts_provider=none, condicional ok);
  'Config > Speakers' com toggle ja visto funcionando antes. Comportamento de navegacao tambem
  coberto por 7 testes automatizados em test_config_menu.py (90-03).

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

# FIX DE CODIGO priorizado (opcao B): RESOLVIDO via quick task 260609-rw9
- truth: "STT transcreve fala PT-BR como portugues, nao auto-detecta idioma errado"
  status: fixed
  reason: "User reported: [STT] -> Опа, буа ночь. (fala PT transcrita como russo/cirilico)"
  severity: major
  test: 2
  root_cause: "stt.py:451 chamava _model.transcribe(audio) sem language='pt'; Whisper auto-detectava e errava em audio curto/ruidoso"
  artifacts:
    - path: "apps/desktop-py/src/jarvis_desktop/stt.py"
      issue: "transcribe(audio) sem parametro language — auto-detect falha"
  fix:
    - "config.py: novo campo stt_language (default 'pt')"
    - "stt.py: global _language lido em init_stt; transcribe passa language=_language (commit 9360e7d2)"
    - "stt_whisper_cpp.py: set_language() sincroniza -l do whisper.cpp"
    - "test_stt.py: 2 testes assertam kwarg language='pt' (7 passed)"
  quick_task: "260609-rw9"
  commit: "9360e7d2"
  debug_session: ""
  status_note: "PENDENTE re-teste de voz pelo usuario (re-Test 2) com desktop reiniciado para confirmar transcricao PT correta ao vivo"

# AJUSTE DE CONFIG (nao e fix de codigo — decisao opcao B):
# Speaker enrolled 'biel' rejeitado: score 0.72 < speaker_threshold 0.75 → unknown.
# Acao sugerida: baixar speaker_threshold em ~/.jarvis/config.json para ~0.70,
# OU re-enrollar em ambiente mais quieto. Nao gera PLAN de codigo.
