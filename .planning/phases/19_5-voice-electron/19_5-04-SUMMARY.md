---
phase: 19_5-voice-electron
plan: 04
subsystem: desktop/renderer
tags: [voice, electron, renderer, toast, tdd]
requires:
  - 19_5-01  # chat:send-audio refatorado (shape novo)
  - 19_5-02  # SendAudioResponse em shared/ipc-types
  - 19_5-03  # ttsPlayer e useAudioRecorder WebM
provides:
  - handleAudioResponse pura
  - ChatProvider com histórico + toast state
  - Toast component controlado
  - mapErrorCode pt-BR
affects:
  - apps/desktop/src/main/ipc/chat.ts (reconcilia TODO do 19_5-01)
  - apps/desktop/src/renderer/components/ChatInput/ChatInput.tsx (novo shape)
  - apps/desktop/src/renderer/src/App.tsx
tech-stack:
  added: []
  patterns: [dependency-injection, pure-function, react-context]
key-files:
  created:
    - apps/desktop/src/renderer/src/lib/errorMessages.ts
    - apps/desktop/src/renderer/src/lib/__tests__/errorMessages.test.ts
    - apps/desktop/src/renderer/src/components/Toast.tsx
    - apps/desktop/src/renderer/src/components/__tests__/Toast.test.tsx
    - apps/desktop/src/renderer/src/voice/handleAudioResponse.ts
    - apps/desktop/src/renderer/src/voice/__tests__/handleAudioResponse.test.ts
    - apps/desktop/src/renderer/src/chat/ChatContext.tsx
  modified:
    - apps/desktop/src/main/ipc/chat.ts
    - apps/desktop/src/renderer/components/ChatInput/ChatInput.tsx
    - apps/desktop/src/renderer/src/App.tsx
decisions:
  - "ChatContext com useChat fail-soft (NOOP defaults fora de provider) pra não quebrar testes unitários existentes do ChatInput"
  - "handleAudioResponse como função pura com deps injetadas — testada sem renderizar App completo"
  - "Histórico de chat renderizado como lista simples dentro do app-container (MVP), não extraído em componente dedicado"
  - "Re-export SendAudioResponse de main/ipc/chat.ts apontando pra shared/ipc-types (evita quebra em imports existentes)"
metrics:
  tasks_completed: 3
  tests_added: 22
  duration_minutes: ~20
  files_created: 7
  files_modified: 3
completed: 2026-04-09
---

# Phase 19.5 Plan 04: Integração Final do Loop de Voz no App.tsx Summary

Fecha o loop de voz end-to-end no Electron: transcription vira HumanMessage, response vira AIMessage, TTS toca via `playTTSResponse`, erros do backend viram Toast pt-BR. Também reconcilia o TODO deixado pelo Plano 19_5-01 (tipo local `SendAudioResponse` substituído pelo import de `shared/ipc-types`). Último plano da Fase 19.5.

## O que foi entregue

1. **`lib/errorMessages.ts`** — mapping puro `mapErrorCode(code, fallback?)` + `isRecoverableWithMessage(code)` cobrindo EMPTY_AUDIO, NO_SPEECH, STT_FAILED, LLM_FAILED, TTS_FAILED, NETWORK, TIMEOUT, NO_API_KEY, HTTP_429, HTTP_5xx, HTTP_4xx e default. 13 testes.
2. **`components/Toast.tsx`** — componente controlado (`message`, `variant`, `onClose`, `autoCloseMs`), auto-fecha após 5s, clique fecha, `WebkitAppRegion: no-drag` para funcionar sobre a drag region do app. 4 testes.
3. **`voice/handleAudioResponse.ts`** — função pura com deps injetadas (`addHumanMessage`, `addAgentMessage`, `setToast`, `playTTS`). Happy path insere mensagens e chama playTTS. Se playTTS falhar, mantém mensagens e mostra toast warning. Erro do backend vira toast pt-BR (warning se TTS_FAILED, error caso contrário). 5 testes.
4. **`chat/ChatContext.tsx`** — ChatProvider com `messages`, `addHumanMessage`, `addAgentMessage`, `toast`, `setToast`. `useChat` é fail-soft: retorna NOOP defaults quando renderizado fora de provider (preserva testes legados do ChatInput).
5. **`App.tsx`** — envolve com `<ChatProvider>`, renderiza histórico simples, Toast global, e `stopTTSPlayback()` no unmount.
6. **`ChatInput.tsx`** — PTT stop agora consome o shape novo do `sendAudio` e delega a `handleAudioResponse(result, deps)`. Mantém transição de estado do orb (`responding` → idle 2s).
7. **`main/ipc/chat.ts`** — remove tipo local `SendAudioResponse` com TODO, passa a importar de `shared/ipc-types` (re-export mantém compat com imports existentes).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ChatInput ainda consumia shape antigo do sendAudio**
- **Found during:** Task 3
- **Issue:** `ChatInput.tsx` usava `result.data.reply` e `result.error` (shape da Fase 13). Com o Plano 19_5-01 já tendo refatorado o handler, o tsc falhava com TS2339 em ChatInput mesmo antes das minhas mudanças (confirmado via baseline `git stash` + `pnpm tsc`). Era wasteland pré-existente.
- **Fix:** Roteou o response pelo `handleAudioResponse`, removeu uso de `result.data.reply`/`result.error`, mantém `setReply(result.data.message)` só pra SpeechBubble.
- **Files modified:** `apps/desktop/src/renderer/components/ChatInput/ChatInput.tsx`
- **Commit:** `c0a19ac`

**2. [Rule 3 - Blocker] Paths relativos errados na 1ª versão do handleAudioResponse**
- **Found during:** Task 3 typecheck
- **Fix:** Corrigido `../../../shared/ipc-types` a partir de `src/renderer/src/voice/` e `../../../../shared/ipc-types` a partir do `__tests__`.

**3. [Rule 3] useChat quebrava testes existentes do ChatInput**
- **Found during:** Task 3 vitest run
- **Issue:** 6 testes de ChatInput existentes não envolvem em provider; `useChat` throw quebrou todos.
- **Fix:** `useChat` agora retorna defaults NOOP quando fora de provider.

**4. [Rule 3] user-event + fake timers travavam teste do Toast**
- **Found during:** Task 2 vitest run
- **Fix:** Substituído `userEvent.click` por `fireEvent.click` (fake timers friendly).

### Deferred (out of scope)
Ver `.planning/phases/19_5-voice-electron/deferred-items.md`:
- `tray.test.ts` DESK-04 desatualizado (3 vs 4 itens) — pré-existente.
- `integration-chat.test.ts` sem `express` tipado — pré-existente.
- `WebkitAppRegion` inline style sem cast (App.tsx, ChatInput.tsx) — TS2353 pré-existente desde Fase 10/12.

## Verificação

- `pnpm vitest run src/renderer/src/voice src/renderer/src/components src/renderer/src/lib` → **22/22 tests passing** (13 errorMessages + 4 Toast + 5 handleAudioResponse).
- `pnpm vitest run` full suite → 207/208 passing (1 pré-existente em tray.test.ts, out of scope).
- `pnpm tsc --noEmit` → somente erros pré-existentes (integration-chat express + WebkitAppRegion inline style). **Nenhum erro introduzido por este plano.**

## Task 4 (checkpoint human-verify)

O plano original tinha um checkpoint manual de verificação end-to-end (backend + gateway + electron + microfone real). **Não executado** por este agente autônomo — requer hardware de áudio e serviços externos rodando. Caminho para verificação manual continua documentado no plano (`how-to-verify`). A pipeline automática está completa e testada isoladamente.

## Fase 19.5 — Status

Com este plano, **todos os módulos técnicos da Fase 19.5 estão entregues**:
- 19_5-01: handler `chat:send-audio` (backend-client + Bearer + audio/webm + shape novo) — DONE
- 19_5-02: tipos compartilhados `SendAudioResponse`/`VoiceError` — DONE
- 19_5-03: `ttsPlayer` e `useAudioRecorder` WebM — DONE
- 19_5-04: integração no App + Toast + handleAudioResponse + reconciliação do TODO — DONE (este plano)

Loop de voz end-to-end fechado no código. **Fase 19.5 COMPLETA** pendente apenas a verificação manual end-to-end (Task 4 deste plano) com hardware real.

## Self-Check: PASSED

Arquivos criados verificados:
- `apps/desktop/src/renderer/src/lib/errorMessages.ts` ✓
- `apps/desktop/src/renderer/src/lib/__tests__/errorMessages.test.ts` ✓
- `apps/desktop/src/renderer/src/components/Toast.tsx` ✓
- `apps/desktop/src/renderer/src/components/__tests__/Toast.test.tsx` ✓
- `apps/desktop/src/renderer/src/voice/handleAudioResponse.ts` ✓
- `apps/desktop/src/renderer/src/voice/__tests__/handleAudioResponse.test.ts` ✓
- `apps/desktop/src/renderer/src/chat/ChatContext.tsx` ✓

Commits verificados: `70608ec`, `01924ed`, `c0a19ac` — todos presentes em `git log`.
