---
phase: 19-voice-backend
plan: 02
subsystem: voice/tts
tags: [tts, elevenlabs, provider, fetch]
requirements: [VOICE-TS-02]
provides:
  - "interface TTSProvider + type TTSResult"
  - "class ElevenLabsTTSProvider"
requires: []
affects:
  - apps/backend-ts/src/voice/tts/
key-files:
  created:
    - apps/backend-ts/src/voice/tts/provider.ts
    - apps/backend-ts/src/voice/tts/elevenlabs.ts
    - apps/backend-ts/src/voice/tts/elevenlabs.test.ts
  modified: []
tech-stack:
  added: []
  patterns:
    - fetch nativo Node 22 (sem SDK externo)
    - env-driven config com defaults
    - erros HTTP mapeados para Error messages estruturadas
decisions:
  - "Usar fetch nativo em vez de adicionar dep (node 22 já tem global fetch)"
  - "Default voice Sarah (EXAVITQu4vr4xnSDxMaL), model eleven_multilingual_v2 (pt-BR)"
  - "Throw no synthesize (não no constructor) pra permitir construção antes do env estar populado"
metrics:
  duration: "~5min"
  completed: 2026-04-08
tasks: 1/1
---

# Phase 19 Plan 02: ElevenLabs TTS Provider Summary

Entrega da interface `TTSProvider` + implementação `ElevenLabsTTSProvider` consumindo a API REST da ElevenLabs via fetch nativo, com erros estruturados e 9 testes unitários mockando `global.fetch`.

## O que foi feito

- **`provider.ts`** — define `TTSResult = { audio: Buffer, format: 'mp3' | 'wav' | 'opus' }` e `TTSProvider` com `readonly name` + `synthesize(text): Promise<TTSResult>`.
- **`elevenlabs.ts`** — `ElevenLabsTTSProvider`:
  - `name = 'elevenlabs'`
  - Constructor lê `ELEVENLABS_VOICE_ID` (default `EXAVITQu4vr4xnSDxMaL`) e `ELEVENLABS_MODEL_ID` (default `eleven_multilingual_v2`).
  - `synthesize(text)` valida texto não-vazio, lê `ELEVENLABS_API_KEY` do env (throw se ausente), monta `POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}` com headers `xi-api-key`, `Content-Type: application/json`, `Accept: audio/mpeg` e body `{text, model_id, voice_settings:{stability:0.5, similarity_boost:0.75}}`.
  - Em non-2xx, throw `ElevenLabs error ${status}: ${body.slice(0,200)}`.
  - Em network error (fetch reject), throw `ElevenLabsTTSProvider: network error: ${msg}`.
  - Sucesso: `arrayBuffer()` → `Buffer` + `format: 'mp3'`.
- **`elevenlabs.test.ts`** — 9 testes vitest com `vi.stubGlobal('fetch', ...)`:
  1. `name === 'elevenlabs'`
  2. Success path — valida URL, headers, body JSON, Buffer de saída.
  3. Respeita env vars customizados (`ELEVENLABS_VOICE_ID` e `ELEVENLABS_MODEL_ID`).
  4. Empty text → throw.
  5. Missing `ELEVENLABS_API_KEY` → throw.
  6. 401 → throw com `ElevenLabs error 401`.
  7. 429 → throw com `ElevenLabs error 429`.
  8. 5xx → throw com `ElevenLabs error 500`.
  9. Network error (fetch reject) → throw `network error: ECONNREFUSED`.

## Verificação

- `pnpm vitest run src/voice/tts/elevenlabs.test.ts` → **9/9 PASSED** (763ms)
- `tsc` nos arquivos de `voice/tts/` → **0 errors**

## Deviações

Nenhuma — plano executado exatamente como escrito.

## Deferred Issues (out of scope)

- `apps/backend-ts/src/memory/voice-log.test.ts` referencia métodos `logVoiceCall`/`updateVoiceCall`/`getVoiceCall` que ainda não existem no `MemoryStore`. **Isso pertence ao plano 19-05 (memory schema, rodando em paralelo)** — fora do escopo deste plano. O `pnpm build` full falha por causa disso, mas os arquivos deste plano compilam limpos.

## Commits

- `5551e76` — ✨ feat(19-02): adiciona ElevenLabsTTSProvider via fetch HTTP

## Self-Check: PASSED

- FOUND: apps/backend-ts/src/voice/tts/provider.ts
- FOUND: apps/backend-ts/src/voice/tts/elevenlabs.ts
- FOUND: apps/backend-ts/src/voice/tts/elevenlabs.test.ts
- FOUND: commit 5551e76
