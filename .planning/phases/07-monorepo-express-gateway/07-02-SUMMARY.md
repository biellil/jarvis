---
phase: 07-monorepo-express-gateway
plan: "02"
subsystem: gateway
tags: [express, typescript, proxy, sse, health, vitest, undici]
dependency_graph:
  requires: [07-01-gateway-foundation]
  provides: [chat-proxy-route, sse-passthrough-route, health-aggregation-route]
  affects: [GW-01, GW-02, GW-03]
tech_stack:
  added: []
  patterns: [sse-passthrough, undici-fetch-proxy, abort-signal-timeout, readable-stream-pipe]
key_files:
  created:
    - packages/gateway/src/lib/proxy.ts
    - packages/gateway/src/routes/chat.ts
    - packages/gateway/src/routes/health.ts
    - packages/gateway/test/chat.test.ts
    - packages/gateway/test/stream.test.ts
    - packages/gateway/test/health.test.ts
  modified:
    - packages/gateway/src/app.ts
decisions:
  - "SSE_HEADERS extracted to lib/proxy.ts — reusable constants shared between route and tests"
  - "encodeURIComponent(message) on stream query param — prevents injection via special chars"
  - "AbortSignal.timeout(3000) on health probe — prevents health check from hanging when Python unreachable"
  - "res.flushHeaders() before reader loop — ensures SSE headers reach client immediately, no buffering"
  - "headers-not-sent guard on stream error — avoids double response when error occurs mid-stream"
metrics:
  duration: "~2 minutes"
  completed: "2026-04-06"
  tasks_completed: 1
  files_created: 6
  files_modified: 1
---

# Phase 7 Plan 02: Proxy Routes + SSE Passthrough Summary

**One-liner:** Express gateway proxy routes implementing chat (GW-01), SSE token streaming (GW-02), and aggregated health (GW-03) via undici fetch with 18 vitest tests passing.

## What Was Built

Completed the gateway's core proxy functionality — all three routes that bridge the Express gateway to the FastAPI Python service.

### Files Created

```
packages/gateway/
├── src/
│   ├── lib/
│   │   └── proxy.ts        SSE_HEADERS constants (text/event-stream, X-Accel-Buffering: no)
│   └── routes/
│       ├── chat.ts         GW-01 POST /chat proxy + GW-02 GET /chat/stream SSE passthrough
│       └── health.ts       GW-03 GET /health aggregated status
└── test/
    ├── chat.test.ts        5 tests for POST /api/chat (success, validation, 429, 500)
    ├── stream.test.ts      4 tests for GET /api/chat/stream (SSE headers, validation, 429)
    └── health.test.ts      3 tests for GET /api/health (ok, not_ready, unreachable)
```

### Route Details

**GW-01: POST /api/chat**
- Applies `validate(ChatRequestSchema)` middleware (min 1 char message)
- Proxies to `${fastapiUrl}/chat` via undici fetch with JSON body passthrough
- On upstream error: creates error with `status` and `code: "UPSTREAM_ERROR"`, passes to `next(err)`
- errorHandler normalizes to `{ error: true, code, message }` shape

**GW-02: GET /api/chat/stream**
- Validates `message` query param (non-empty, non-whitespace)
- Uses `encodeURIComponent(message)` for safe URL encoding
- Sets SSE_HEADERS and calls `res.flushHeaders()` before piping
- Pipes via `upstream.body.getReader()` + `res.write(chunk)` loop — zero buffering
- Headers-sent guard prevents double response on mid-stream errors

**GW-03: GET /api/health**
- Fetches `${fastapiUrl}/health/ready` with `AbortSignal.timeout(3000)`
- Maps response: `ok=true → "ok"`, `ok=false → "not_ready"`, exception → `"unreachable"`
- Returns HTTP 200 only when python is "ok", else HTTP 503

### app.ts Updated

```typescript
app.use("/api", chatRouter);    // GW-01 + GW-02
app.use("/api", healthRouter);  // GW-03
app.use(errorHandler);          // last — error normalization (GW-04)
```

## Verification Results

```
pnpm --filter gateway exec tsc --noEmit   ✓  TypeScript compiles cleanly (0 errors)
pnpm --filter gateway test --run           ✓  18/18 tests passing (4 test files)
```

Test breakdown:
- `error.test.ts` — 6 tests (GW-04/GW-05, from Plan 01)
- `chat.test.ts` — 5 tests (GW-01 proxy)
- `stream.test.ts` — 4 tests (GW-02 SSE)
- `health.test.ts` — 3 tests (GW-03 aggregated health)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 — Proxy routes + tests | 3f5af0b | feat(07-02): implement proxy routes, SSE passthrough, and health aggregation |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all routes are fully wired to upstream FastAPI. No placeholder data or hardcoded responses.

## Pending

**Task 2 (checkpoint:human-verify):** Manual end-to-end verification with both FastAPI and Express gateway running. Human must confirm:
1. `curl http://localhost:3000/api/health` → `{"gateway":"ok","python":"ok"}` HTTP 200
2. `curl -X POST http://localhost:3000/api/chat -H 'Content-Type: application/json' -d '{"message":"oi"}'` → JARVIS response
3. `curl -N "http://localhost:3000/api/chat/stream?message=oi"` → incremental SSE tokens
4. `curl -X POST http://localhost:3000/api/chat -H 'Content-Type: application/json' -d '{}'` → 400 VALIDATION_ERROR
5. `curl "http://localhost:3000/api/chat/stream"` → 400 VALIDATION_ERROR

## Self-Check: PASSED

All files exist on disk and commit 3f5af0b is present in git log.
