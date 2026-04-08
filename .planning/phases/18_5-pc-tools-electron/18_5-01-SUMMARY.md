---
phase: 18_5-pc-tools-electron
plan: 01
subsystem: desktop/main/sse
tags: [sse, streaming, electron, main-process]
status: complete
completed: 2026-04-08
requirements: [TOOL-TS-01, TOOL-TS-02]
key-files:
  created:
    - apps/desktop/src/main/sse-client.ts
    - apps/desktop/src/main/__tests__/sse-client.test.ts
---

# Phase 18.5 Plan 01: SSE Client Summary

Cliente SSE puro no main process do Electron que consome `GET /chat/stream`, distingue tokens de eventos `action` e reconecta com backoff exponencial — base para o refactor do ipc/chat.ts (18_5-05).

## API Exported (`apps/desktop/src/main/sse-client.ts`)

### Types
```ts
type SseToken  = { type: 'token';  data: string };
type SseAction = {
  type: 'action';
  payload: {
    tool_call_id: number;
    action: string;
    args: Record<string, unknown>;
    requires_confirmation: boolean;
  };
};
type SseFrame = SseToken | SseAction;
```

### Pure functions
- `parseFrame(raw: string): SseFrame | null` — parseia um frame (sem `\n\n` final). JSON inválido em action → null + warn.
- `splitBuffer(buffer: string): { frames: string[]; rest: string }` — separa por `\n\n`.
- `computeBackoffMs(attempt: number): number` — `[1000,2000,4000,8000,16000,30000,...30000]`.

### Main entrypoint
```ts
openChatStream(opts: {
  url: string;
  apiKey: string;
  message: string;
  onToken:  (token: string) => void;
  onAction: (payload: SseAction['payload']) => void;
  onEnd:    () => void;
  onError:  (err: Error) => void;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch; // injetável para testes
}): Promise<void>
```

### Comportamento
- `GET ${url}?message=${encoded}` com header `Authorization: Bearer <apiKey>` + `Accept: text/event-stream`.
- Lê `response.body.getReader()` + `TextDecoder`, acumula buffer, `splitBuffer` → `parseFrame` → `onToken`/`onAction`.
- **Reconnect:** stream encerrando normalmente ou erro 5xx/network → `sleep(computeBackoffMs(attempt++))` e reabre. Reset do attempt após conexão OK.
- **Não retenta:** 400, 401, 403, 404, 429 → `onError` + `onEnd` + return.
- **Abort:** `signal.aborted` em qualquer ponto → `onEnd` e return. Signal abortado antes de começar → no-op (onEnd imediato).
- **Sem side effects** além de `fetch` e callbacks. Nenhum import de `electron`, `child_process`, `dialog`.

## Tests (13 passing)
- `parseFrame`: token simples, action válido, action JSON inválido (→ null+warn), multi-linha `data`, frame vazio.
- `splitBuffer`: 2 frames + resto parcial, nenhum frame completo.
- `computeBackoffMs`: tabela [0..10].
- `openChatStream`: emissão tokens+actions na ordem, reconnect após stream vazio, 401 não retenta, signal pré-abortado, 5xx retenta.

## Verification
- `pnpm --filter desktop vitest run src/main/__tests__/sse-client.test.ts` — 13/13 verde.
- Nenhum novo erro de `pnpm tsc --noEmit` no sse-client. (Erros pré-existentes em ipc-chat/integration-chat/App.tsx/etc são out-of-scope — pré-existentes antes deste plano, deferred.)

## Downstream
Consumido por 18_5-05 (refactor do `ipc/chat.ts` para usar streaming) e indiretamente por 18_5-03 (actions queue receberá os `onAction` payloads).

## Deviations
Nenhuma — plano executado como escrito. Ajuste menor em 1 teste (abortar após 2 tokens ao invés de dentro do onEnd) pra evitar loop infinito com fake timers; comportamento produção inalterado.

## Self-Check: PASSED
- `apps/desktop/src/main/sse-client.ts` — FOUND
- `apps/desktop/src/main/__tests__/sse-client.test.ts` — FOUND
- commit `d1bb52d` — FOUND
