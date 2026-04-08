---
phase: 18_5-pc-tools-electron
plan: 02
subsystem: desktop/main
tags: [electron, http-client, auth]
requires: []
provides:
  - loadBackendConfig
  - createBackendClient
  - postToolCallResult
  - buildChatStreamUrl
  - buildToolCallResultUrl
affects: [18_5-04, 18_5-05]
tech-stack:
  added: []
  patterns: [dependency-injection, fail-fast-config]
key-files:
  created:
    - apps/desktop/src/main/backend-client.ts
    - apps/desktop/src/main/__tests__/backend-client.test.ts
  modified: []
decisions:
  - fetchImpl injetável pros testes (sem mock global do fetch)
  - Response mockada como objeto puro (happy-dom/undici barram Response com status 204 + body)
metrics:
  tasks: 2
  tests: 16
  duration: ~5min
  completed: 2026-04-08
---

# Phase 18_5 Plan 02: Backend Client Autenticado — Summary

Cliente HTTP único pro Electron main process com auth Bearer, fail-fast no startup se `JARVIS_API_KEY` ausente, e helpers pra reportar outcome de tool calls.

## Assinaturas

```ts
interface BackendConfig { backendUrl: string; apiKey: string }

type ToolResult =
  | { success: true; output?: string | null }
  | { success: false; output?: string | null; error: string };

function loadBackendConfig(env?: Record<string,string|undefined>): BackendConfig
function buildChatStreamUrl(backendUrl: string, message: string): string
function buildToolCallResultUrl(backendUrl: string, id: number): string

interface BackendClient {
  postToolCallResult(id: number, result: ToolResult): Promise<void>
  getChatStreamRequest(message: string): { url: string; headers: Record<string,string> }
}

function createBackendClient(config: BackendConfig, fetchImpl?: typeof fetch): BackendClient
```

## Exemplo de uso

```ts
// main/index.ts — startup
const config = loadBackendConfig(); // throws se JARVIS_API_KEY ausente
const backend = createBackendClient(config);

// action-executor (18_5-04)
await backend.postToolCallResult(toolCallId, { success: true, output: 'ok' });
await backend.postToolCallResult(toolCallId, { success: false, error: 'user_denied' });

// ipc/chat (18_5-05) + sse-client (18_5-01)
const { url, headers } = backend.getChatStreamRequest('olá jarvis');
```

## Mapeamento HTTP

| Status    | Resultado                                                    |
| --------- | ------------------------------------------------------------ |
| 204       | resolve                                                      |
| 400       | throw `tool-call result failed: HTTP 400 <body>`             |
| 404       | throw `tool-call result failed: HTTP 404 <body>`             |
| 401/5xx   | throw `tool-call result failed: HTTP <status> <body>`        |
| rede      | throw `tool-call result network error: <original message>`  |

Em TODOS os casos o header `Authorization: Bearer <apiKey>` é injetado.

## Testes

16 testes vitest (`src/main/__tests__/backend-client.test.ts`):

- `loadBackendConfig`: missing/empty/default/custom/trailing slash (5)
- URL builders: encodeURIComponent, id format (2)
- `postToolCallResult`: success+auth header, error body, 204, 404, 400, 401, 500, network error (8)
- `getChatStreamRequest`: URL + Authorization header (1)

`fetchImpl` é injetado no client (não mock global), Response mockada como objeto puro (`{status, ok, text}`) porque o runtime Node rejeita `new Response(body, {status: 204})`.

## Deviations from Plan

None - plan executado exatamente como escrito.

## Self-Check: PASSED

- `apps/desktop/src/main/backend-client.ts` FOUND
- `apps/desktop/src/main/__tests__/backend-client.test.ts` FOUND
- Commit `098c82d` FOUND
- 16/16 tests passing
- `grep Authorization backend-client.ts` confirma header injetado
