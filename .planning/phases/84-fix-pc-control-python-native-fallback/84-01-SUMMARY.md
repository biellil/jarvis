---
phase: 84-fix-pc-control-python-native-fallback
plan: "01"
subsystem: gateway
tags: [sse, python-client, pc-control, gateway, typescript]
dependency_graph:
  requires: []
  provides:
    - pythonSseClients Map exported from ws-server.ts
    - GET /api/actions/events SSE registration endpoint
    - POST /api/actions/ack ACK resolution endpoint
  affects:
    - apps/gateway/src/lib/ws-server.ts
    - apps/gateway/src/app.ts
tech_stack:
  added: []
  patterns:
    - SSE long-lived connection with heartbeat + disconnect cleanup
    - Zod validation on ACK payload
    - Delete-before-resolve pattern to prevent double-resolution race
key_files:
  created:
    - apps/gateway/src/routes/actions-events.ts
    - apps/gateway/src/routes/actions-ack.ts
    - apps/gateway/src/__tests__/actions-events.test.ts
    - apps/gateway/src/__tests__/actions-ack.test.ts
  modified:
    - apps/gateway/src/lib/ws-server.ts
    - apps/gateway/src/app.ts
decisions:
  - pythonSseClients uses http.ServerResponse (already imported) — no new imports needed in ws-server.ts
  - SSE heartbeat interval 30s — matches plan spec for EPIPE detection
  - Delete resolver before calling it — prevents double-resolution race condition
  - ACK endpoint does not import ActionAckSchema from path-validator.ts — uses local AckPayloadSchema without the 'type' discriminant field, to keep Python client payload minimal
  - SSE integration tests replaced with unit-level tests — supertest cannot easily handle long-lived SSE connections in vitest; 400-path tests use supertest, stale/disconnect tests use mock objects
metrics:
  duration: "~15 minutes"
  completed: "2026-05-28"
  tasks: 3
  files: 6
---

# Phase 84 Plan 01: Gateway SSE + ACK Infrastructure Summary

Gateway-side SSE registration endpoint and ACK endpoint for Python desktop client PC control, using `Map<string, http.ServerResponse>` pattern mirroring existing Electron WS pattern.

## What Was Built

- **`pythonSseClients` Map** exported from `ws-server.ts` — stores active Python SSE connections keyed by `clientId`
- **GET /api/actions/events** — Python client connects on boot, gateway stores `ServerResponse` in the map, 30s heartbeat detects stale TCP, disconnect removes entry via `close` event
- **POST /api/actions/ack** — Python client POSTs `{ requestId, status, content? }` after executing action; resolves matching `pendingAckResolvers` entry; 404 on unknown requestId; delete-before-resolve prevents race
- **10 new tests** — 4 SSE (400 validation x2, stale replacement, disconnect cleanup) + 6 ACK (400 invalid payload, 400 invalid status, 404 no resolver, 200 ok, content passthrough, no double-resolution)

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Export pythonSseClients | f22cb8d | ws-server.ts |
| 2 | SSE + ACK routes + app.ts | a795d83 | actions-events.ts, actions-ack.ts, app.ts |
| 3 | Vitest tests | 042c8ef | actions-events.test.ts, actions-ack.test.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SSE test timeout with supertest**
- **Found during:** Task 3
- **Issue:** `supertest` holds the test open waiting for a response from a long-lived SSE connection — the test times out at 5000ms. Fake timers also blocked `setTimeout` used inside the test itself.
- **Fix:** 400-path tests (synchronous responses) use supertest. Stale-replacement and disconnect-cleanup tests use mock `ServerResponse` objects that test the Map state directly without opening real HTTP connections.
- **Files modified:** actions-events.test.ts
- **Commit:** 042c8ef

### Pre-existing Failures (Out of Scope)

Two pre-existing test failures exist before my changes and are unrelated:
- `path-validator.test.ts` — "rejects action_request with path outside whitelist" (Windows path whitelist behavior)
- `action-dispatcher.test.ts` — "Scenario 3 — invalid path" (same root cause)

These failures existed before this plan and are out of scope per deviation rules. Logged to `deferred-items.md`.

## Known Stubs

None. All endpoints are fully wired.

## Self-Check: PASSED

Files exist:
- apps/gateway/src/routes/actions-events.ts ✓
- apps/gateway/src/routes/actions-ack.ts ✓
- apps/gateway/src/__tests__/actions-events.test.ts ✓
- apps/gateway/src/__tests__/actions-ack.test.ts ✓

Commits exist:
- f22cb8d ✓
- a795d83 ✓
- 042c8ef ✓

TypeScript: `npx tsc --noEmit` exits 0 ✓
Tests: 89 passing (10 new), 2 pre-existing failures unchanged ✓
