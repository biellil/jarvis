---
phase: 19-voice-backend
plan: 06
subsystem: voice
tags: [voice, orchestration, stt, tts, audit]
requires: [19-01, 19-04, 19-05]
provides: [VoiceHandler]
affects: [19-07]
key_files:
  created:
    - apps/backend-ts/src/voice/voice-handler.ts
    - apps/backend-ts/src/voice/voice-handler.test.ts
  modified: []
decisions:
  - "VoiceHandler é puro (sem Express); lock é responsabilidade do endpoint 19-07"
  - "Usa logVoiceCall após STT ok + updateVoiceCall após TTS (2 writes) para capturar falha em qualquer estágio"
  - "VoiceError com campo `code` (EMPTY_AUDIO|NO_SPEECH|STT_FAILED|LLM_FAILED|TTS_FAILED) pro endpoint mapear HTTP status"
  - "ttsProvider no output prioriza TTSResult.providerUsed (FallbackTTSProvider) com fallback pro tts.name"
metrics:
  tasks_completed: 2
  tests_added: 8
  duration_minutes: ~4
---

# Phase 19 Plan 06: VoiceHandler Orchestration Summary

VoiceHandler classe TS que orquestra audio → STT → ChatSession.send → TTS → audit, com audit garantido em todo caminho de falha.

## O que foi entregue

**`apps/backend-ts/src/voice/voice-handler.ts`**
- `class VoiceHandler` com `constructor({ session, stt, tts, store, conversationId })` e `async handle(audioBuffer: Buffer): Promise<VoiceHandlerResult>`.
- Pipeline:
  1. Valida `audioBuffer.length > 0` → `VoiceError('EMPTY_AUDIO')` antes de qualquer side-effect.
  2. `stt.transcribe(audioBuffer)` com medição `sttLatencyMs = Date.now() - t0`. Falha → `logVoiceCall(success=false, error='stt: ...')` + throw `STT_FAILED`.
  3. Trim transcription → se vazio: log `success=false, error='empty transcription'` + throw `NO_SPEECH`. session/tts NÃO são chamados.
  4. `logVoiceCall(success=true)` capturando o `id` retornado.
  5. `session.send(trimmed)` → falha: `updateVoiceCall(id, success=false, error='llm: ...')` + throw `LLM_FAILED`.
  6. `tts.synthesize(message)` com medição `ttsLatencyMs`. Falha: `updateVoiceCall(id, success=false, error='tts: ...')` + throw `TTS_FAILED`.
  7. `updateVoiceCall(id, { ttsProvider, ttsLatencyMs, ttsBytes, success: true })` e retorna `{ transcription, message, audio, audioFormat, sttProvider, ttsProvider }`.
- `VoiceError extends Error` com campo `code: VoiceErrorCode`.
- `ttsProviderName = result.providerUsed ?? this.tts.name` — respeita decisão do FallbackTTSProvider.

**`apps/backend-ts/src/voice/voice-handler.test.ts`** — 8 casos vitest com stubs manuais (sem `vi.mock`):
1. Happy path: result completo + audit rows corretas + latências numéricas.
2. Empty buffer → `EMPTY_AUDIO`, STT não chamado, nenhum audit.
3. STT retorna `"   "` → `NO_SPEECH` + audit `success=false`.
4. STT throws → `STT_FAILED` + audit `success=false, transcription=null`.
5. `session.send` throws → `LLM_FAILED`, logVoiceCall feito com `success=true` (parcial), `updateVoiceCall` marca `success=false`.
6. TTS throws → `TTS_FAILED` + updateVoiceCall `success=false`.
7. Fallback `providerUsed='local'` → output `ttsProvider==='local'`, audit grava `ttsProvider: 'local'`.
8. Latências ≥ 0 e `conversationId: null` propagado.

## Decisões

- **Lock externo:** VoiceHandler não toca em `SessionLock`. O endpoint 19-07 adquire o lock compartilhado com `/chat` antes de chamar `handle()`.
- **Dois writes de audit:** `logVoiceCall` (insert com STT) + `updateVoiceCall` (patch com TTS/final state) ao invés de um único insert no fim, pra preservar linha de auditoria mesmo quando LLM/TTS travam.
- **`NO_SPEECH` é erro, não result vazio:** mantém contrato do endpoint simples (endpoint sempre recebe result válido OU exception).
- **Falha total de TTS throw-a:** decisão explícita do plano — contrato com o endpoint exige audio, então `TTS_FAILED` propaga.

## Verificação

- `cd apps/backend-ts && pnpm exec tsc --noEmit` → clean
- `pnpm exec vitest run src/voice/voice-handler.test.ts` → **Test Files 1 passed, Tests 8 passed**

## Deviations from Plan

None - plano executado exatamente como escrito.

## Commits

- `8fa8ec5` ✨ feat(19-06): adiciona VoiceHandler orquestrando STT+ChatSession+TTS

## Próximo passo

19-07: endpoint `POST /chat/audio` que adquire `SessionLock` e chama `VoiceHandler.handle()`, mapeando `VoiceError.code` → HTTP status (400 pra EMPTY_AUDIO/NO_SPEECH, 502 pra STT/LLM/TTS_FAILED).

## Self-Check: PASSED

- apps/backend-ts/src/voice/voice-handler.ts: FOUND
- apps/backend-ts/src/voice/voice-handler.test.ts: FOUND
- commit 8fa8ec5: FOUND
