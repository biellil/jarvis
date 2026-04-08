---
phase: 17-chatsession-agent-runtime
plan: 04
subsystem: backend-ts/api
tags: [express, sse, lock, chat-session]
requires: [17-03]
provides: [POST /chat, GET /chat/stream, SessionLock, app.locals.session wiring]
affects: [apps/backend-ts/src/app.ts, apps/backend-ts/src/index.ts]
tech-stack:
  added: []
  patterns: [Promise-free boolean mutex, SSE raw write, DI via createApp options]
key-files:
  created:
    - apps/backend-ts/src/session/lock.ts
    - apps/backend-ts/src/session/lock.test.ts
    - apps/backend-ts/src/routes/chat.ts
    - apps/backend-ts/src/routes/chat.test.ts
  modified:
    - apps/backend-ts/src/app.ts
    - apps/backend-ts/src/index.ts
decisions:
  - Boolean mutex suficiente (Node single-threaded, um handler por vez)
  - Router mantém paridade 1:1 com chat.py, inclusive string 429 "Session busy — try again later"
  - createApp aceita {session, lock} opcionais — testes antigos (health) continuam funcionando sem DI
metrics:
  tasks: 2
  files: 6
  tests_before: 83
  tests_after: 95
  duration: ~5min
---

# Phase 17 Plan 04: Expose HTTP API Endpoints — Summary

Entrega final da Fase 17: backend TS ganha paridade externa com `src/jarvis/api/routes/chat.py`. Frontend Electron pode apontar para `localhost:8001` sem adapters.

## What Shipped

1. **SessionLock** (`src/session/lock.ts`) — mutex booleano com `isBusy()` + `tryAcquire(): release | null`. Release idempotente.
2. **createChatRouter** (`src/routes/chat.ts`):
   - `POST /chat` body `{message}` → 200 `{message}` / 400 body inválido / 429 busy / 500 erro. `lock.tryAcquire` + try/finally release.
   - `GET /chat/stream?message=...` → 200 `text/event-stream`, `data: <token>\n\n` raw, 400 sem query, 429 busy. `res.flushHeaders()` + loop `for await`.
3. **createApp({session, lock})** monta o router (opcional — testes antigos ainda chamam `createApp()` sem DI).
4. **src/index.ts** bootstrap: `runMigrations() → createLLM() → new MemoryManager() → ChatSession.create() → new SessionLock() → createApp(...)`.

## Testes

`pnpm --filter backend-ts vitest run` → **95/95 verdes** (83 → 95, +12 novos):
- 4 em `session/lock.test.ts` (mutex, idempotência)
- 8 em `routes/chat.test.ts` (happy path POST, 400, 429, release-on-error, SSE body concat, 400 stream, 429 stream, release-after-stream)

Typecheck: `pnpm exec tsc --noEmit` zero erros.

LLM mockado em todos os testes via `ChatSession` stub (`send: vi.fn`, `sendStream: async function*`).

## Paridade contra Python

| Aspecto | Python (`chat.py`) | TS (`routes/chat.ts`) |
|---|---|---|
| POST body | `ChatRequest.message: str` | `typeof req.body.message === 'string'` |
| POST resp | `ChatResponse{message}` | `res.json({message})` |
| 429 detail | `"Session busy — try again later"` | idêntico |
| Lock | `asyncio.Lock` | `SessionLock` (boolean) |
| SSE format | `EventSourceResponse` (`data: ...\n\n`) | `res.write(\`data: ${token}\n\n\`)` |
| GET stream | query `message: str` | `req.query.message` |

Diff char-a-char das strings de erro: ok. `\n\n` terminator: ok.

## Divergência consciente 4b ↔ 5a

Confirmada (herdada do Plan 17-02): TS delega memória ao agente via tool `recall_memory`, Python injeta no system prompt. Request/response externos **idênticos**, então o frontend não vê diferença.

## Bug conhecido herdado (Fase 16)

`MemoryVectorsOptions` não aceita `collection` — não bloqueia o plano. Documentado em 16-SUMMARY, será tratado em fase de cleanup.

## Smoke test (manual, opcional)

Não executado (LM Studio não rodando neste sandbox). Comandos de referência:

```bash
pnpm --filter backend-ts dev
curl -X POST http://localhost:8001/chat -H 'Content-Type: application/json' -d '{"message":"oi"}'
curl -N 'http://localhost:8001/chat/stream?message=oi'
```

## Status Success Criteria da Fase 17

| # | Critério | Status |
|---|---|---|
| 1 | POST /chat → JSON completa | ✅ Plan 17-04 |
| 2 | GET /chat/stream → SSE incrementais | ✅ Plan 17-04 |
| 3 | Conversation history persiste em SQLite | ✅ via `MemoryManager.saveTurn` (17-01) |
| 4 | Semantic retrieval via tool calling | ✅ `recall_memory` tool (17-02) |
| 5 | Agent ReAct loop funciona | ✅ `createReactAgent` em `send()` (17-02) |

**Fase 17 COMPLETA.**

## Commits

- `ec2faa5` ✨ feat(17-04): adiciona SessionLock mutex para serializar requests
- `5e2233a` ✨ feat(17-04): expõe POST /chat e GET /chat/stream com lock global e SSE

## Self-Check: PASSED

- lock.ts, lock.test.ts, chat.ts, chat.test.ts: FOUND
- app.ts, index.ts: modified & FOUND
- Commits ec2faa5, 5e2233a: FOUND in git log
- 95/95 tests green, tsc clean
