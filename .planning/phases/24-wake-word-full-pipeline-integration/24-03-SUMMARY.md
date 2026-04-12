---
phase: 24-wake-word-full-pipeline-integration
plan: 03
subsystem: voice / renderer / ptt
one_liner: "ChatInput PTT migra para sendAudioAndHandle compartilhado — elimina duplicação entre PTT e wake word, com Branch A (closure-capture agentReplyCapture) para preservar SpeechBubble local"
tags:
  - voice
  - renderer
  - ptt
  - refactor
  - WAKE-13
  - D-07
requirements:
  - WAKE-13
dependency_graph:
  requires:
    - apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts (Wave 1 — shared helper)
    - apps/desktop/src/renderer/components/SpeechBubble/SpeechBubble.tsx (reads `text` prop from local `reply` state)
  provides:
    - Zero duplicação PTT vs wake word — ambos consomem sendAudioAndHandle
  affects:
    - (Wave 2 parallel) apps/desktop/src/renderer/hooks/useWakeWord.ts — plan 24-04 usa o mesmo helper
tech_stack:
  - TypeScript
  - React hooks
  - Electron renderer
---

# Plan 24-03 — ChatInput PTT Migration to sendAudioAndHandle

## What Was Built

ChatInput.tsx `handleStopRecording` foi migrado de uma implementação inline (setState transitions + `window.jarvis.sendAudio` + `handleAudioResponse` + setTimeout idle return) para uma chamada única ao helper compartilhado `sendAudioAndHandle` criado em Wave 1 (Plan 24-02).

### Changes

**File touched:** `apps/desktop/src/renderer/components/ChatInput/ChatInput.tsx` (apenas `handleStopRecording` + imports; `handleStartRecording`, `handleSubmit`, PTT toggle useEffect, `reply`/`setReply` state, e JSX ficaram intactos)

**Imports removidos:**
- `handleAudioResponse` (agora consumido indiretamente via sendAudioAndHandle)
- `playTTSResponse` (dependência interna do handleAudioResponse)

**Imports adicionados:**
- `sendAudioAndHandle` from `'../../src/voice/sendAudioAndHandle'`

**`handleStopRecording` logic:**
- Antes: ~50 linhas inline (`setState('processing')` → `window.jarvis.sendAudio` → branch success/error → `handleAudioResponse(...)` → `setTimeout(() => setState('idle'), 2000)`)
- Depois: ~20 linhas delegando 100% da lógica para `sendAudioAndHandle(audioBuffer, deps)`

## SpeechBubble Decision: Branch A (closure-capture)

Plan 24-03 documentou duas estratégias:
- **Branch A:** Wrappa `addAgentMessage` numa closure que captura o texto para `setReply` local
- **Branch B:** Remove `setReply` + `reply` state e confia em `ChatContext.messages` para renderizar a bubble

**Investigação:** `SpeechBubble.tsx` recebe `text: string` como prop (`{reply && <SpeechBubble text={reply} />}` em ChatInput.tsx:218). O componente NÃO consulta `useChat()` — ele é puramente controlado pelo parent. Remover `reply`/`setReply` local quebraria a bubble do PTT.

**Escolha: Branch A.** Code pattern:
```typescript
let agentReplyCapture = '';
await sendAudioAndHandle(audioBuffer, {
  setState,
  setToast,
  addHumanMessage,
  addAgentMessage: (text: string) => {
    agentReplyCapture = text;
    addAgentMessage(text);
  },
});
if (agentReplyCapture) {
  setReply(agentReplyCapture);
}
```

**Thread-safety:** A captura via closure é segura porque PTT é serializado pelo `voiceInputManager` (`acquire('ptt')`/`release('ptt')`). Nunca há duas invocações concorrentes de `handleStopRecording`.

## Behavior Changes

**Removido: 2s idle dwell pós-success.** A implementação anterior fazia `setTimeout(() => setState('idle'), 2000)` depois de `handleAudioResponse` terminar, mantendo o orb em `responding` por 2 segundos visuais. O `sendAudioAndHandle` da Wave 1 impõe `setState('idle')` num `finally` block imediato (invariante Nyquist). O orb agora volta para idle assim que o TTS termina — mais responsivo, mas menos "dwell visual".

Se o UX pedir o dwell de volta: é uma decisão do sendAudioAndHandle (helper compartilhado), não do ChatInput. Hoje o idle-invariant é intencional e testado.

## Tests / Regression Coverage

- **ChatInput test suite:** 6/6 passing (`pnpm --filter @jarvis/desktop exec vitest run src/renderer/components/ChatInput`)
- **Type check:** `tsc --noEmit` — zero novos erros. Todos os erros pré-existentes (WebkitAppRegion, integration-chat, settings, useWakeWord, rmsZeroGuard) documentados em `deferred-items.md` do 24-02.
- **Sem testes novos adicionados:** este plano é refactor puro; a cobertura de regressão vem do existing suite.

## Key Files

**Modified:**
- `apps/desktop/src/renderer/components/ChatInput/ChatInput.tsx`

**Consumed (Wave 1 artifact):**
- `apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts`

## Self-Check: PASS

- [x] `handleStopRecording` delega 100% para `sendAudioAndHandle`
- [x] Imports de `handleAudioResponse` + `playTTSResponse` removidos (não mais necessários no ChatInput)
- [x] Import de `sendAudioAndHandle` adicionado
- [x] Branch A (closure-capture) preserva local `reply` state → SpeechBubble continua renderizando
- [x] `voiceInputManager.acquire('ptt')` + `release('ptt')` lifecycle intocados
- [x] 6/6 ChatInput tests passando
- [x] Zero novos tsc errors
- [x] Commit atômico com pt-BR Conventional Commit + emoji

## Commit

- `fab16b3` ♻️ refactor(phase-24-03): ChatInput PTT delega para sendAudioAndHandle (WAKE-13)
