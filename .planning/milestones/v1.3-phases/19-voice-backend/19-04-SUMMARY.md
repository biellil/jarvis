---
phase: 19-voice-backend
plan: 04
subsystem: voice/tts
tags: [tts, factory, fallback, elevenlabs, local]
requires: [19-02, 19-03]
provides:
  - createTTSProvider factory
  - FallbackTTSProvider wrapper
  - providerUsed metadata em TTSResult
key-files:
  created:
    - apps/backend-ts/src/voice/tts/fallback.ts
    - apps/backend-ts/src/voice/tts/fallback.test.ts
    - apps/backend-ts/src/voice/tts/index.ts
    - apps/backend-ts/src/voice/tts/index.test.ts
  modified:
    - apps/backend-ts/src/voice/tts/provider.ts
decisions:
  - TTSResult.providerUsed opcional pra não quebrar providers base
  - Factory trata string vazia como default (stubEnv edge case)
requirements: [VOICE-TS-02]
metrics:
  tasks: 2
  tests: 9
  duration: ~5min
---

# Phase 19 Plan 04: TTS factory com fallback automático — Summary

Wrapper `FallbackTTSProvider` tenta primary → se throw loga warning e tenta secondary; ambos falham → Error combinado. `createTTSProvider()` lê `TTS_PROVIDER` env (default `elevenlabs`), monta `Fallback(ElevenLabs, Local)` se API key presente, cai pra `LocalTTSProvider` direto sem key ou em `local`/valor desconhecido.

## Deviations from Plan

None — plan executado exatamente como escrito. Única micro-ajuste: factory trata `TTS_PROVIDER=""` como default (Rule 1 bug defensivo, emerso de test usando `vi.stubEnv` que seta string vazia em vez de unset).

## Verification

- `pnpm vitest run src/voice/tts/fallback.test.ts src/voice/tts/index.test.ts` → 9/9 verde
- `pnpm tsc --noEmit` → clean

## Commits

- `24e69cd` ✨ feat(19-04): adiciona FallbackTTSProvider com providerUsed no TTSResult
- `25fdb10` ✨ feat(19-04): adiciona createTTSProvider factory com dispatch por TTS_PROVIDER

## Self-Check: PASSED

- FOUND: apps/backend-ts/src/voice/tts/fallback.ts
- FOUND: apps/backend-ts/src/voice/tts/fallback.test.ts
- FOUND: apps/backend-ts/src/voice/tts/index.ts
- FOUND: apps/backend-ts/src/voice/tts/index.test.ts
- FOUND commit: 24e69cd
- FOUND commit: 25fdb10
