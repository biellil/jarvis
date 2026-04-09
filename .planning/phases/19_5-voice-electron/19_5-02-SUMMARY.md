---
phase: 19_5-voice-electron
plan: 02
subsystem: desktop/ipc-types
tags: [types, ipc, preload, voice]
requires: []
provides: [SendAudioData, SendAudioError, SendAudioResponse]
affects: [apps/desktop/src/main/ipc/chat.ts, apps/desktop/src/renderer/components/ChatInput/ChatInput.tsx]
key-files:
  modified:
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/preload/index.ts
decisions:
  - "SendAudioResponse vira union discriminada própria (não IpcResult<T>) porque error mudou de string pra objeto {code, message}"
metrics:
  duration: ~2min
  completed: 2026-04-09
---

# Phase 19.5 Plan 02: Atualizar SendAudioResponse Summary

Contrato de tipos IPC pro pipeline de voz atualizado — `SendAudioData` agora carrega transcription/message/audioBase64/audioFormat/sttProvider/ttsProvider, e erros são `{code, message}` estruturados.

## Changes

### `apps/desktop/src/shared/ipc-types.ts`
- `SendAudioData`: removido `reply: string`, adicionados `transcription`, `message`, `audioBase64`, `audioFormat: 'mp3' | 'wav'`, `sttProvider`, `ttsProvider`.
- Nova interface `SendAudioError { code: string; message: string }`.
- `SendAudioResponse` agora é union discriminada própria: `{success: true; data: SendAudioData} | {success: false; error: SendAudioError}` (não usa mais `IpcResult<T>` porque o tipo de `error` mudou).
- `SendTextResponse` intacto (continua `IpcResult<SendTextData>`).
- `IPC_CHANNELS`, `PttAction`, `JarvisAPI.sendAudio` (assinatura) inalterados.

### `apps/desktop/src/preload/index.ts`
- Comentário desatualizado "Phase 13, Plan 03: Audio recording with WAV conversion" → "Phase 19.5: WebM/Opus bytes pro gateway /api/chat/audio".
- Import de `SendAudioResponse` mantido, implementação de `sendAudio` inalterada.

## Verification

`pnpm tsc --noEmit` em apps/desktop:
- `src/shared/ipc-types.ts`: 0 erros
- `src/preload/index.ts`: 0 erros
- Erros remanescentes em `src/main/ipc/chat.ts` (plan 19_5-01) e `src/renderer/components/ChatInput/ChatInput.tsx` (plan 19_5-03/04) — esperados, são consumidores do novo tipo que serão atualizados em paralelo nas outras plans da wave.
- Erros pré-existentes não relacionados (express types faltando em integration-chat.test.ts, WebkitAppRegion, audiobuffer-to-wav) — out of scope.

## Deviations from Plan

None — plan executado exatamente como escrito.

## Commits

- `✨ feat(19_5-02): atualiza SendAudioResponse com shape de voz novo`

## Self-Check: PASSED
- FOUND: apps/desktop/src/shared/ipc-types.ts (updated)
- FOUND: apps/desktop/src/preload/index.ts (updated)
