---
phase: 19-voice-backend
plan: 01
status: complete
completed_at: 2026-04-09
commits:
  - 1beca76  # build(19-01): nodejs-whisper + WAV fixture
  - a898a59  # feat(19-01): STTProvider + LocalSTTProvider + ffmpeg-check
  - c176073  # feat(19-01): createSTTProvider() factory
---

# Plan 19-01 Summary — STTProvider + LocalSTTProvider

## Delivered

- `apps/backend-ts/src/voice/stt/provider.ts` — interface `STTProvider { transcribe(audio, opts?), name }`
- `apps/backend-ts/src/voice/stt/local.ts` — `LocalSTTProvider` via nodejs-whisper, modelo `base` default, override via `WHISPER_MODEL` env var, lazy load, cache em `~/.cache/jarvis/whisper-models/`
- `apps/backend-ts/src/voice/stt/index.ts` — `createSTTProvider()` factory lendo `STT_PROVIDER` env (default `local`)
- `apps/backend-ts/src/voice/ffmpeg-check.ts` — validação no startup, warning não-fatal se `ffmpeg` ausente do PATH
- `apps/backend-ts/test/fixtures/audio/small.wav` — fixture de 16kHz/mono/s16le gerado manualmente em Node
- `nodejs-whisper@^0.2.9` adicionado ao package.json

## Testes

- 23/23 vitest verdes em `voice/stt/*.test.ts` e `ffmpeg-check.test.ts`
- nodejs-whisper mockado — zero side effects reais
- `pnpm build` (tsc) limpo

## Requirements Covered

- VOICE-TS-01 ✅ (STTProvider interface)

## Success Criteria Coverage

- SC#2 ✅ (STTProvider + LocalSTTProvider nodejs-whisper)

## Deviações (Rule 3 auto-fix)

1. `vi.mock` factory referenciando top-level `const` quebrou por hoisting ESM — resolvido com `vi.hoisted(() => ({...}))`.
2. Fixture WAV gerada via Node manual (header + zeros 16kHz/mono/s16le) em vez de `ffmpeg -f lavfi` — ffmpeg não estava disponível no ambiente dev.

## Hand-off

Pronto pra consumo pelo plano 19-06 (VoiceHandler). Interface estável, factory lê env, fallback local funcionando.
