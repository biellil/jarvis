---
phase: 07-monorepo-express-gateway
verified: 2026-04-05T22:26:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
human_verification:
  - test: "End-to-end SSE streaming without buffering (live)"
    expected: "GET /api/chat/stream?message=oi delivers tokens incrementally, not all-at-once"
    why_human: "Unit tests mock the upstream stream; real latency and chunking behavior can only be observed with both services running"
---

# Phase 7: Monorepo + Express Gateway Verification Report

**Phase Goal:** O projeto tem estrutura pnpm workspaces com um gateway Express/TypeScript que recebe requests externos, valida payloads e proxia para FastAPI sem buffering de stream
**Verified:** 2026-04-05T22:26:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Notable Path Deviation (Non-Blocking)

Plans specified `packages/gateway/` as the gateway location. The actual implementation placed the gateway at `apps/gateway/`. The `pnpm-workspace.yaml` was updated to include **both** `apps/*` and `packages/*` globs, so workspace resolution works correctly. All plan must-haves are satisfied — only the physical path differs from what was documented in plan frontmatter. The SUMMARY files did not call out this deviation explicitly.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `pnpm install` na raiz instala dependencias do gateway sem erro | VERIFIED | `pnpm install` exits 0 in 1.1s; `apps/gateway/node_modules/express/` exists |
| 2 | Gateway Express inicia sem erro e escuta na porta configurada | VERIFIED | `index.ts` calls `app.listen(config.gatewayPort)`; `config.ts` reads `GATEWAY_PORT` from env; no dotenv import |
| 3 | Payload invalido retorna 400 com shape `{error: true, code: 'VALIDATION_ERROR', message: '...'}` | VERIFIED | `validate.ts` exports `validate()` + `ChatRequestSchema`; 3 vitest tests confirm 400/VALIDATION_ERROR for missing/empty message |
| 4 | Erros inesperados retornam shape normalizado sem stack trace | VERIFIED | `errorHandler.ts` returns `{error:true, code, message}` — no `err.stack` present in handler |
| 5 | POST /api/chat com `{message:'oi'}` retorna resposta JSON do JARVIS proxiada pelo gateway | VERIFIED | `chat.ts` GW-01 route proxies to FastAPI via undici; 5 tests including upstream 429 normalization |
| 6 | GET /api/chat/stream?message=oi retorna tokens SSE incrementalmente sem buffering | VERIFIED | `res.flushHeaders()` called before reader loop; `X-Accel-Buffering: no` in SSE_HEADERS; `reader.read()` loop streams chunks |
| 7 | GET /api/health retorna `{gateway:'ok', python:'ok\|not_ready\|unreachable'}` com status HTTP correto | VERIFIED | `health.ts` maps 3 states; HTTP 200 only on python=ok, HTTP 503 otherwise; 3 tests confirm all cases |
| 8 | Erros do upstream (FastAPI 429, 500) sao normalizados pelo error handler | VERIFIED | `chat.ts` and `stream.ts` create error objects with `status` + `code: "UPSTREAM_ERROR"` and pass to `next(err)` |

**Score:** 8/8 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `pnpm-workspace.yaml` | Workspace declaration | VERIFIED | Contains `apps/*` and `packages/*` globs |
| `package.json` (root) | Root workspace manifest | VERIFIED | `"private": true`, `"name": "jarvis"`, engines node>=22 |
| `apps/gateway/package.json` | Gateway package manifest | VERIFIED | `"name": "@jarvis/gateway"`, `"type": "module"`, express+zod+undici deps |
| `apps/gateway/src/app.ts` | Express app factory | VERIFIED | Exports `createApp()`; wires json, chatRouter, healthRouter, errorHandler in order |
| `apps/gateway/src/middleware/validate.ts` | Zod validation middleware | VERIFIED | Exports `validate` and `ChatRequestSchema`; uses `z.string().min(1)` |
| `apps/gateway/src/middleware/errorHandler.ts` | Error normalization middleware | VERIFIED | Exports `errorHandler`; returns `{error:true, code, message}`; no stack trace |
| `apps/gateway/src/routes/chat.ts` | Chat proxy routes | VERIFIED | Exports `chatRouter`; GW-01 and GW-02 implemented |
| `apps/gateway/src/routes/health.ts` | Aggregated health route | VERIFIED | Exports `healthRouter`; GW-03 with AbortSignal.timeout(3000) |
| `apps/gateway/src/lib/proxy.ts` | SSE header constants | VERIFIED | Exports `SSE_HEADERS` with `text/event-stream` and `X-Accel-Buffering: no` |
| `apps/gateway/src/config.ts` | Env config reader | VERIFIED | Reads `FASTAPI_URL` and `GATEWAY_PORT` from `process.env`; no dotenv import |
| `apps/gateway/src/index.ts` | Entry point | VERIFIED | Creates app, calls `app.listen(config.gatewayPort)` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `app.ts` | `errorHandler.ts` | `app.use(errorHandler)` as last middleware | VERIFIED | Line 13: after chatRouter and healthRouter |
| `app.ts` | `validate.ts` | `validate` imported in `chat.ts`, registered on route | VERIFIED | `chat.ts` line 4 imports `validate, ChatRequestSchema` |
| `chat.ts` | FastAPI POST /chat | `fetch(${fastapiUrl}/chat)` via undici | VERIFIED | Line 12: undici fetch with JSON body passthrough |
| `chat.ts` | FastAPI GET /chat/stream | `reader.read()` loop + `res.write(chunk)` | VERIFIED | Lines 69-75: ReadableStream pipe without buffering |
| `health.ts` | FastAPI GET /health/ready | `fetch(${fastapiUrl}/health/ready)` with 3s timeout | VERIFIED | Line 12: AbortSignal.timeout(3000) |
| `app.ts` | `chat.ts` | `app.use("/api", chatRouter)` | VERIFIED | Line 9 in app.ts |
| `app.ts` | `health.ts` | `app.use("/api", healthRouter)` | VERIFIED | Line 10 in app.ts |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `chat.ts` POST route | `data` from upstream JSON | `undici.fetch` to FastAPI `/chat` | Yes — awaits and returns `upstream.json()` | FLOWING |
| `chat.ts` stream route | raw bytes from upstream body | `upstream.body.getReader()` | Yes — byte-level passthrough via `res.write(value)` | FLOWING |
| `health.ts` | `pythonStatus` | `undici.fetch` to FastAPI `/health/ready` | Yes — mapped from `upstream.ok` | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 18 vitest tests pass | `pnpm --filter gateway test --run` | 18/18 passed in 2.68s | PASS |
| TypeScript compiles cleanly | `pnpm --filter gateway exec tsc --noEmit` | exit 0, no errors | PASS |
| pnpm install from root succeeds | `pnpm install` | Done in 1.1s, 0 errors | PASS |
| gateway package has correct name | `grep name apps/gateway/package.json` | `@jarvis/gateway` | PASS |
| .env retains Python vars + gateway vars | `grep -n LLM_PROVIDER .env` | Present on line 2 | PASS |
| FASTAPI_URL set in .env | `grep FASTAPI_URL .env` | `FASTAPI_URL=http://127.0.0.1:8000` | PASS |
| Commits documented in SUMMARY exist | `git log --oneline` | 63dbb3a, 6eefd56, 3f5af0b all present | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MONO-01 | 07-01 | pnpm install installs all deps via workspace | SATISFIED | `pnpm-workspace.yaml` with `apps/*` glob; `pnpm install` exits 0; `node_modules/express` present in gateway |
| GW-01 | 07-02 | POST /api/chat proxies to FastAPI | SATISFIED | `chat.ts` GW-01 route; undici fetch to `/chat`; 5 unit tests including 429 normalization |
| GW-02 | 07-02 | GET /api/chat/stream SSE passthrough without buffering | SATISFIED | `res.flushHeaders()` before reader loop; `X-Accel-Buffering: no`; `reader.read()` byte stream; human verified (SUMMARY 07-02) |
| GW-03 | 07-02 | GET /api/health aggregated health | SATISFIED | `health.ts` maps 3 states; HTTP 200/503 logic; 3 unit tests; human verified |
| GW-04 | 07-01 | Error shape `{error, code, message}` — no stack trace | SATISFIED | `errorHandler.ts` returns exact shape; no `err.stack` in handler; 3 unit tests |
| GW-05 | 07-01 | Zod validation rejects invalid payloads before proxy | SATISFIED | `ChatRequestSchema` with `z.string().min(1)`; `validate()` middleware on POST /chat route; 3 unit tests |

All 6 requirements covered — no orphaned requirements.

**Note on REQUIREMENTS.md checkboxes:** MONO-01, GW-04, and GW-05 still show `[ ]` (unchecked) in `.planning/REQUIREMENTS.md`. This is a documentation tracking issue — the implementation satisfies these requirements and the table below the checklist correctly shows them as "Pending" (stale). The checkbox status does not reflect actual implementation state.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | No anti-patterns found |

Scan results:
- Zero TODO/FIXME/PLACEHOLDER comments in `apps/gateway/src/`
- No `return null` / `return []` / `return {}` stubs
- No stack trace exposure in errorHandler
- No hardcoded empty data arrays
- No dotenv import in config.ts (correctly uses `--env-file` flag)

---

### Human Verification Required

#### 1. SSE Streaming Incremental Delivery (Live Integration)

**Test:** Start FastAPI (`uvicorn jarvis.api.app:app --port 8000`) and gateway (`pnpm dev`), then run: `curl -N "http://localhost:3001/api/chat/stream?message=oi"`
**Expected:** Tokens arrive incrementally over time, not all at once after a delay
**Why human:** Unit tests mock the upstream ReadableStream; the actual no-buffering behavior under network I/O conditions requires live observation. Note: `GATEWAY_PORT` is set to 3001 in `.env` (not 3000 as in plan defaults).

Note: The 07-02 SUMMARY documents that this was already human-verified on 2026-04-05 with all 7 curl tests approved. Re-verification at human level is optional.

---

### Gaps Summary

No gaps found. All 8 observable truths are verified, all 6 requirements are satisfied, all key links are wired, data flows are live (not hardcoded), and 18/18 unit tests pass with TypeScript compiling cleanly.

The only noteworthy deviation is the gateway residing at `apps/gateway/` instead of the plan-documented `packages/gateway/`. This was accommodated by expanding the workspace glob to include `apps/*` in addition to `packages/*`. The deviation does not impact any requirement or observable truth.

---

_Verified: 2026-04-05T22:26:00Z_
_Verifier: Claude (gsd-verifier)_
