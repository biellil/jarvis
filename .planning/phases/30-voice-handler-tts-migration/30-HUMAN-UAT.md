---
status: partial
phase: 30-voice-handler-tts-migration
source: [30-VERIFICATION.md]
started: 2026-04-14T00:00:00Z
updated: 2026-04-14T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. End-to-end pipeline
expected: Falar via PTT, receber resposta em áudio reproduzida pelo renderer (STT → LLM → TTS → playback)
result: [pending]

### 2. VRAM log at startup
expected: Console exibe `[whisper] VRAM detected: XXXX MB` com modelo correto selecionado (tiny/base/large) para o hardware em uso
result: [pending]

### 3. STT latency < 2s
expected: Tempo de parede do release do PTT até o log de transcrição é inferior a 2 segundos no modelo `base` com GPU compatível
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
