---
phase: 19-voice-backend
plan: 07
subsystem: backend-ts/routes
tags: [voice, http, multer, express]
requires: [19-01, 19-04, 19-06, 17]
provides: [POST /chat/audio]
affects: [app.ts, index.ts]
tech-stack:
  added: [multer@^2, @types/multer]
  patterns: [memoryStorage, shared SessionLock, VoiceError → HTTP mapping]
key-files:
  created:
    - apps/backend-ts/src/routes/chat-audio.ts
    - apps/backend-ts/src/routes/chat-audio.test.ts
  modified:
    - apps/backend-ts/src/app.ts
    - apps/backend-ts/src/index.ts
    - apps/backend-ts/package.json
decisions:
  - "multer memoryStorage (25MB limit) pra manter o buffer em RAM e passar direto ao VoiceHandler.handle — sem I/O de disco"
  - "Whitelist de content-types áudio via fileFilter; rejeição → 400 INVALID_UPLOAD"
  - "Lock compartilhado via mesma instância SessionLock injetada em createChatRouter e createChatAudioRouter — 429 cross-endpoint"
  - "Error mapping: EMPTY_AUDIO/NO_SPEECH → 400; STT/LLM/TTS_FAILED → 500 com {detail, code}"
metrics:
  duration: ~8min
  completed: 2026-04-08
---

# Phase 19 Plan 07: POST /chat/audio Summary

Endpoint HTTP `POST /chat/audio` no backend-ts que recebe multipart/form-data, delega ao `VoiceHandler` (19-06) e retorna JSON com transcrição + resposta + áudio base64. Usa o mesmo `SessionLock` de `/chat` pra garantir serialização cross-endpoint.

## What Shipped

- `createChatAudioRouter(handler, lock)` em `routes/chat-audio.ts`:
  - `multer.memoryStorage()`, limit 25MB, fileFilter whitelist (webm/ogg/wav/mpeg/mp3/mp4/m4a).
  - 400 MISSING_FILE sem arquivo; 400 INVALID_UPLOAD se content-type rejeitado.
  - 429 "Session busy — try again later" se lock ocupado (mesma string da Fase 17).
  - try/finally garante release do lock mesmo em exceção.
  - Response JSON: `{transcription, message, audio_base64, audio_format, stt_provider, tts_provider}`.
  - Mapping `VoiceError.code` → HTTP: EMPTY_AUDIO/NO_SPEECH → 400; STT/LLM/TTS_FAILED → 500.
- `app.ts`: `CreateAppOptions.voiceHandler?` monta o router quando presente junto com `lock`.
- `index.ts`: bootstrap chama `assertFfmpegAvailable()`, cria `createSTTProvider()`/`createTTSProvider()`, instancia `VoiceHandler` com `MemoryStore` default e loga `[voice] STT=... TTS=...`.
- Deps: `multer` + `@types/multer`.

## Tests

7 casos supertest em `chat-audio.test.ts`, todos verdes:
1. 400 MISSING_FILE sem arquivo
2. 400 INVALID_UPLOAD com text/plain
3. 429 com lock pré-adquirido
4. Happy path 200 + payload completo + lock liberado
5. 400 NO_SPEECH (VoiceError)
6. 500 STT_FAILED
7. 500 TTS_FAILED + lock liberado

## Verification

- `pnpm exec tsc --noEmit` → exit 0
- `pnpm vitest run src/routes/chat-audio.test.ts` → 7/7 pass

## Deviations from Plan

None — executado conforme spec. (Plan previa 500 pra *_FAILED; a nota de docstring do VoiceHandler sobre 502 foi intencionalmente ignorada em favor do que o plano dita.)

## Self-Check: PASSED
- `apps/backend-ts/src/routes/chat-audio.ts` FOUND
- `apps/backend-ts/src/routes/chat-audio.test.ts` FOUND
- `app.ts`/`index.ts` wiring FOUND
- Tests 7/7 passing
