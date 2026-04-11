---
phase: 19_5-voice-electron
plan: 03
subsystem: renderer-audio
tags: [electron, renderer, web-audio-api, tts, mediarecorder]
requires: []
provides:
  - ttsPlayer.playTTSResponse
  - ttsPlayer.stopTTSPlayback
  - useAudioRecorder (webm bruto)
affects:
  - apps/desktop/src/renderer/src/App.tsx (futuro consumer — Plano 04)
tech-stack:
  added: []
  patterns:
    - AudioContext singleton lazy
    - Cancel-before-decode para playback interrompível
    - MediaRecorder WebM/Opus bruto (sem conversão client-side)
key-files:
  created:
    - apps/desktop/src/renderer/src/audio/ttsPlayer.ts
    - apps/desktop/src/renderer/src/audio/__tests__/ttsPlayer.test.ts
  modified:
    - apps/desktop/src/renderer/hooks/useAudioRecorder.ts
decisions:
  - "AudioContext singleton lazy reutilizado — evita warning do browser e custo de setup"
  - "currentSource?.stop() ANTES do decode do novo áudio — UX de cancelamento imediato"
  - "Renderer entrega WebM cru ao backend; conversão STT roda server-side via ffmpeg"
metrics:
  duration: ~10min
  completed: 2026-04-09
---

# Phase 19.5 Plan 03: Renderer Audio (TTS Player + WebM cru) Summary

Módulo de playback TTS no renderer usando Web Audio API com singleton lazy e cancelamento imediato de áudio anterior; `useAudioRecorder` simplificado pra devolver bytes WebM/Opus brutos (backend converte).

## What Was Built

### 1. `ttsPlayer.ts` (novo)
- `playTTSResponse(base64, format)`: decodifica via `AudioContext.decodeAudioData` e toca via `AudioBufferSourceNode`.
- Cancela `currentSource?.stop()` IMEDIATAMENTE antes de iniciar o decode do novo (UX de interrupção correta).
- `onended` só zera `currentSource` se ainda for o mesmo source (protege contra race com cancelamento manual).
- `getAudioContext()` lazy singleton; chama `.resume()` se `state === 'suspended'`.
- `stopTTSPlayback()` idempotente pra cleanup no unmount.
- `__resetForTests()` reset de module-level state.

### 2. `__tests__/ttsPlayer.test.ts` (novo)
7 testes vitest com `vi.stubGlobal('AudioContext', MockAudioContext)`:
1. Toca com sucesso (decode + createBufferSource + start).
2. Cancela anterior (segundo play chama stop no source velho).
3. `onended` limpa `currentSource`.
4. Resume se suspended.
5. Singleton (construtor chamado 1x em 2 plays).
6. `stopTTSPlayback` para source corrente + idempotente.
7. `stop` lançando não crasha (try/catch).

### 3. `useAudioRecorder.ts` (refactor)
- Removido import `audiobuffer-to-wav`, `AudioContext({sampleRate:16000})`, `decodeAudioData`, `audioBufferToWav`, `audioContext.close()`.
- `stopRecording` agora: `new Blob(chunks,'audio/webm')` → `arrayBuffer()` → `Uint8Array` → resolve.
- Comentário do header atualizado: WebM/Opus bruto; conversão STT server-side.
- Mantido: error handling NotAllowedError/NotFoundError, refs cleanup, estado isRecording.
- `audiobuffer-to-wav` permanece no package.json (cleanup futuro).

## Verification

- `pnpm vitest run src/renderer/src/audio/__tests__/ttsPlayer.test.ts` → 7 passed.
- `pnpm tsc --noEmit | grep useAudioRecorder` → sem erros novos. Erros pré-existentes em ChatInput.tsx/App.tsx/integration-chat.test.ts são out-of-scope (relacionados a Plan 02 shared types + CSS type do Electron + teste de integração Fase 13).
- `grep audiobuffer-to-wav useAudioRecorder.ts` → vazio.

## Deviations from Plan

None — plan executado exatamente como escrito.

## Commits

- `501871b` ✨ feat(19_5-03): adiciona ttsPlayer com Web Audio API e cancel anterior
- `33ad04e` ♻️ refactor(19_5-03): useAudioRecorder devolve WebM bruto (sem conversão WAV)

## Notes for Plan 04 (Integration)

- `App.tsx` vai importar `playTTSResponse` de `@renderer/src/audio/ttsPlayer` (ou path relativo) e chamar após receber `{audioBase64, audioFormat}` do IPC.
- Considerar `stopTTSPlayback()` no `useEffect` cleanup do componente que chama o player.
- Erros de `decodeAudioData` propagam — caller trata como `TTS_FAILED` soft (texto ainda aparece no chat).
- Os erros tsc pré-existentes em ChatInput.tsx (`data.reply`, `response.error`) serão resolvidos quando Plan 02 (shared types) + Plan 04 (App integration) chegarem.

## Self-Check: PASSED

- ttsPlayer.ts: FOUND
- ttsPlayer.test.ts: FOUND (7 tests passed)
- useAudioRecorder.ts: FOUND (audiobuffer-to-wav removido)
- Commits 501871b e 33ad04e: FOUND
