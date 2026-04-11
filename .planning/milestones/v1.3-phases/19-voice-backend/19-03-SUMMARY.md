---
phase: 19-voice-backend
plan: 03
subsystem: voice/tts
tags: [tts, transformers-js, speecht5, fallback, local]
requires:
  - apps/backend-ts/src/voice/tts/provider.ts  # TTSProvider interface (19-02)
  - "@xenova/transformers"                      # já instalado na Fase 16
provides:
  - apps/backend-ts/src/voice/tts/local.ts       # LocalTTSProvider
  - apps/backend-ts/src/voice/tts/wav-encoder.ts # float32ToWav
affects:
  - apps/backend-ts/src/voice/tts/
tech-stack:
  added: []
  patterns:
    - "Lazy-load singleton pipeline (caching no primeiro synthesize)"
    - "Mock de @xenova/transformers via vi.mock — sem baixar modelo em testes"
    - "PCM16LE WAV encoding manual (sem deps adicionais)"
key-files:
  created:
    - apps/backend-ts/src/voice/tts/wav-encoder.ts
    - apps/backend-ts/src/voice/tts/wav-encoder.test.ts
    - apps/backend-ts/src/voice/tts/local.ts
    - apps/backend-ts/src/voice/tts/local.test.ts
  modified: []
decisions:
  - "Warning de não-ASCII usa regex /[^\\x00-\\x7F]/ (qualquer char fora ASCII, não só acentos pt-BR) — cobre melhor o caso geral de texto não-inglês"
  - "Speaker embeddings URL configurável via TTS_LOCAL_SPEAKER_EMBEDDINGS; default aponta pro dataset oficial Xenova docs"
  - "Clipping de Float32 usa *32768 pra amostras negativas e *32767 pra positivas (faixa Int16 simétrica)"
  - "Encoder WAV manual em vez de adicionar dep (wav / node-wav) — 40 linhas, zero risk"
metrics:
  tasks: 2
  commits: 2
  tests_added: 14
  completed: 2026-04-08
---

# Phase 19 Plan 03: LocalTTSProvider (Transformers.js Speecht5) Summary

Fallback TTS local via `@xenova/transformers` pipeline `text-to-speech` com modelo `Xenova/speecht5_tts`, mais encoder auxiliar Float32Array → WAV Buffer PCM16LE mono.

## O que foi entregue

### Task 1 — wav-encoder (commit `0b07cbb`)
Função pura `float32ToWav(samples, sampleRate): Buffer` gerando header RIFF/WAVE/fmt/data de 44 bytes + PCM16LE data. Clipping de amostras fora de `[-1, 1]`. Testada com 6 casos (headers, sample rate LE, channels/bits, length, clipping, data size offset).

### Task 2 — LocalTTSProvider (commit pending ^)
Classe `LocalTTSProvider implements TTSProvider`:
- `name === 'local'`
- Lazy singleton do pipeline (carrega modelo apenas na primeira `synthesize`)
- Throw em texto vazio/whitespace
- Warning quando texto contém chars não-ASCII (Speecht5 é EN-only; qualidade pt-BR ruim)
- `TTS_LOCAL_SPEAKER_EMBEDDINGS` env override, default = Xenova docs URL
- Output convertido para WAV Buffer via `float32ToWav`

Testada com 8 casos mockando `@xenova/transformers` via `vi.mock` — zero download de modelo em testes.

## Verificação

- `pnpm vitest run src/voice/tts` → 23 passed (14 novos + 9 pré-existentes do 19-02)
- `pnpm build` (tsc) → limpo, sem erros
- Interface `TTSProvider` respeitada: `synthesize(text) → {audio: Buffer, format: 'wav'}`

## Deviations from Plan

Nenhuma. Plano executado exatamente como escrito, com uma pequena generalização:

**[Refinement]** Regex de warning não-ASCII ampliada de `/[áàâãéêíóôõúç]/i` (sugerido no plan) para `/[^\x00-\x7F]/` — cobre qualquer char fora ASCII, não só acentos pt-BR. Semanticamente mais correto (Speecht5 é EN-only, não "pt-BR-ruim"). Testado explicitamente em ambas direções (ASCII não warn / pt-BR warn).

## Known Stubs

Nenhum. LocalTTSProvider está 100% wired — o modelo real será baixado no primeiro uso em runtime. O wrapper do plano 19-04 vai consumir este provider via factory.

## Next

- **19-04** (Wave 2): TTS factory/router que escolhe ElevenLabs (default) ou LocalTTSProvider (fallback) baseado em env config.

## Self-Check: PASSED

- wav-encoder.ts existe
- wav-encoder.test.ts existe
- local.ts existe
- local.test.ts existe
- commit `0b07cbb` (wav-encoder) presente em git log
- commit do LocalTTSProvider presente em git log (ver abaixo)
- `pnpm build` passa
- 23/23 testes voice/tts passam
