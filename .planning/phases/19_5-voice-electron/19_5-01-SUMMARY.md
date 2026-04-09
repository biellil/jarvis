---
phase: 19_5-voice-electron
plan: 01
subsystem: desktop/ipc
tags: [electron, ipc, voice, refactor]
requires: [backend-client (18.5), gateway /api/chat/audio (19)]
provides: [handleSendAudio puro, SendAudioResponse shape novo local]
affects: [apps/desktop/src/main/ipc/chat.ts]
tech-stack:
  added: []
  patterns: [pure handler + deps injection, retry-with-backoff (4xx no-retry), structured error mapping]
key-files:
  created:
    - apps/desktop/src/main/ipc/__tests__/chat-send-audio.test.ts
  modified:
    - apps/desktop/src/main/ipc/chat.ts
    - apps/desktop/src/main/ipc/__tests__/chat.test.ts
decisions:
  - "SendAudioResponse definido local em chat.ts com TODO — 19_5-02 vai mover pra shared/ipc-types.ts e 19_5-04 reconcilia"
  - "Testes antigos de audio em chat.test.ts removidos (shape obsoleto), substituídos por chat-send-audio.test.ts"
metrics:
  tasks: 2
  duration: ~15min
  completed: 2026-04-09
---

# Phase 19.5 Plan 01: chat:send-audio refactor — Summary

Refatora o IPC handler `chat:send-audio` do Electron main pra falar corretamente com o gateway `/api/chat/audio` da Fase 19: auth bearer via backend-client, content-type `audio/webm`, parsing do response shape novo `{transcription, message, audio_base64, audio_format, stt_provider, tts_provider}`, error mapping estruturado `{code, message}` com 4xx no-retry e timeout 60s.

## What Changed

### `apps/desktop/src/main/ipc/chat.ts`
- Removida constante `GATEWAY_AUDIO_URL` hardcoded. URL agora derivada de `deps.config.backendUrl + '/api/chat/audio'`.
- `AUDIO_REQUEST_TIMEOUT_MS` sobe de 30s → 60s (áudio + STT + LLM + TTS é mais lento que texto).
- Exporta `handleSendAudio(audioBuffer, deps)` puro — testável sem ipcMain.
- Blob agora `type: 'audio/webm'`, filename `'recording.webm'` (corrige o bug do MediaRecorder WebM/Opus marcado como WAV).
- Header `Authorization: Bearer ${deps.config.apiKey}` injetado. Content-Type do FormData é deixado pro runtime (boundary).
- Parsing de resposta 2xx normaliza snake_case → camelCase:
  `{transcription, message, audioBase64, audioFormat, sttProvider, ttsProvider}`.
- Error mapping estruturado:
  - HTTP error com body JSON `{code, detail}` → `{code, message: detail}`
  - HTTP error com body não-JSON → `{code: 'HTTP_<status>', message: bodyText || 'HTTP <status>'}`
  - `TypeError`/fetch throw sem status → `{code: 'NETWORK', message}`
  - `AbortError` → `{code: 'TIMEOUT', message: 'Request timeout after 60 seconds'}`
- `retryWithBackoff` reusado com `shouldRetry` que retorna false para `status >= 400 && status < 500` (inclui 429) — comportamento mantido da Fase 13.
- Handler `ipcMain.handle(CHAT_SEND_AUDIO)` reduzido a delegação em `handleSendAudio`.
- `SendAudioResponse` **definido local** (type union discriminado com `error: {code, message}`) com TODO(19_5-02) — o shared `ipc-types.ts` ainda tem o shape velho `IpcResult<{reply}>` que o plano 19_5-02 vai atualizar. Plano 19_5-04 reconcilia importando do shared.

### `apps/desktop/src/main/ipc/__tests__/chat-send-audio.test.ts` (novo)
10 testes vitest cobrindo:
1. Success — parse correto do shape novo
2. URL correta (`http://localhost:3000/api/chat/audio`)
3. Authorization Bearer header presente
4. Blob com `type: 'audio/webm'` e filename `'recording.webm'`
5. Erro 400 com body JSON `{code:'NO_SPEECH', detail}` → error estruturado
6. Erro 500 com body não-JSON → `code: 'HTTP_500'`
7. 4xx não retrya (fetch chamado 1x)
8. 5xx retrya e recupera no 2º attempt
9. Network error (`TypeError`) → `code: 'NETWORK'`
10. Timeout 60s via fake timers + AbortSignal → `code: 'TIMEOUT'`

### `apps/desktop/src/main/ipc/__tests__/chat.test.ts`
Testes antigos do `CHAT_SEND_AUDIO` removidos (assertavam shape obsoleto `data.reply` e `error` como string). Substituídos pelo novo arquivo. Placeholder `it` mantido para evitar "empty suite" do vitest.

## Verification

- `pnpm vitest run src/main/ipc` → **11 testes passando** (10 novos audio + 1 placeholder + text handler intocado)
- `pnpm tsc --noEmit` filtrado em `src/main/ipc/` → **zero erros**
- `grep -n 'audio/wav\|recording.wav\|GATEWAY_AUDIO_URL' apps/desktop/src/main/ipc/chat.ts` → vazio

### Pre-existing errors (out of scope — Rule: escopo)
Os seguintes erros de `tsc --noEmit` em apps/desktop **não são deste plano** e serão resolvidos pelos planos paralelos:
- `src/renderer/components/ChatInput/ChatInput.tsx` → usa `data.reply`/`error` como string do shape velho. **Plano 19_5-02/03** vai atualizar.
- `src/renderer/**/WebkitAppRegion` → pré-existente, CSS typings.
- `src/main/__tests__/integration-chat.test.ts` → pré-existente (express sem types, signature mismatch).

Registrados em `.planning/phases/19_5-voice-electron/deferred-items.md` se necessário — mas a maior parte é consumida pelos planos 19_5-02/03/04 da mesma wave.

## Deviations from Plan

Nenhuma. Plano executado exatamente como escrito. O único ajuste foi adicionar um `it` placeholder em `chat.test.ts` porque vitest 4.x falha com "No test found in suite" quando um `describe` fica vazio — ajuste trivial, sem impacto funcional.

## Commits

- `183bdd2` ♻️ refactor(19_5-01): send-audio usa backend-client + audio/webm + novo response

## Self-Check: PASSED

- [x] `apps/desktop/src/main/ipc/chat.ts` modificado (handleSendAudio exportado, shape novo)
- [x] `apps/desktop/src/main/ipc/__tests__/chat-send-audio.test.ts` criado (10 testes)
- [x] `apps/desktop/src/main/ipc/__tests__/chat.test.ts` audio tests removidos
- [x] Commit `183bdd2` presente em git log
- [x] `pnpm vitest run src/main/ipc` passa (11/11)
- [x] Zero tsc errors em `src/main/ipc/`
- [x] Zero ocorrências de `audio/wav`, `recording.wav`, `GATEWAY_AUDIO_URL` em chat.ts
