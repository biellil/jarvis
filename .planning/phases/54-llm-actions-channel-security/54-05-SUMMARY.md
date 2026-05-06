---
phase: 54-llm-actions-channel-security
plan: "05"
subsystem: gateway
tags: [action-dispatcher, websocket, audit-log, tdd, gap-closure]
dependency_graph:
  requires:
    - 54-01 (ws-server: clientConnections + pendingAckResolvers)
    - 54-02 (path-validator: ActionRequestSchema)
    - 54-03 (audit-logger: logActionToBackend)
  provides:
    - sendActionRequest — gateway→Electron orchestration entry point (consumed by Phase 55 LangGraph tool)
  affects:
    - apps/gateway/src/lib/action-dispatcher.ts
    - apps/gateway/src/__tests__/action-dispatcher.test.ts
tech_stack:
  added: []
  patterns:
    - TDD (RED→GREEN) with real http.Server + ws
    - Promise-based ACK resolver with setTimeout cleanup (pendingAckResolvers Map)
    - Path validation before WS lookup (security-first ordering)
    - confirmed→approved status mapping for audit log
key_files:
  created:
    - apps/gateway/src/lib/action-dispatcher.ts
    - apps/gateway/src/__tests__/action-dispatcher.test.ts
  modified: []
decisions:
  - sendActionRequest sets its own 12s timer (TIMEOUT_MS) so Phase 55 LangGraph tool gets a clean throw — not relying on caller timeout
  - CLIENT_NOT_CONNECTED throws without calling logActionToBackend — missing connection is not an auditable action attempt
  - Unhandled rejection in timeout test fixed by attaching .catch() immediately after promise creation (before vi.advanceTimersByTimeAsync)
metrics:
  duration: "164s"
  completed_date: "2026-05-06"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 54 Plan 05: sendActionRequest + Audit Log Wiring Summary

One-liner: `sendActionRequest` wires `clientConnections`, `pendingAckResolvers`, `ActionRequestSchema`, and `logActionToBackend` into a single callable gateway→Electron orchestration entry point with 12s timeout and whitelist validation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write failing tests for sendActionRequest (RED) | 71a7a0e | apps/gateway/src/__tests__/action-dispatcher.test.ts |
| 2 | Implement sendActionRequest in action-dispatcher.ts (GREEN) | 6f3dd5c | apps/gateway/src/lib/action-dispatcher.ts, apps/gateway/src/__tests__/action-dispatcher.test.ts |

## What Was Built

### `action-dispatcher.ts`

Exports `sendActionRequest(req: ActionDispatchRequest): Promise<'confirmed' | 'denied' | 'timeout'>`.

Implementation order (security-critical):
1. **Validate path** via `ActionRequestSchema.safeParse` — calls `logActionToBackend({ result: 'denied' })` and throws if outside whitelist
2. **Look up WS connection** via `clientConnections.get(clientId)` — throws `CLIENT_NOT_CONNECTED` (no audit log) if absent
3. **Register resolver + send** — sets `pendingAckResolvers`, sends `action_request` JSON, starts 12s `setTimeout`
4. **Await ACK + log** — maps `confirmed→approved`, calls `logActionToBackend` with ACK result, returns `ack.status`

### `action-dispatcher.test.ts`

6 scenarios using real `http.Server` + `ws`:
- Scenario 1: valid path + confirmed ACK → result='confirmed', logActionToBackend result='approved'
- Scenario 2: valid path + denied ACK → result='denied', logActionToBackend result='denied'
- Scenario 3: invalid path `/etc/passwd` → throws /whitelist/, logActionToBackend called with denied, no WS send
- Scenario 4: unknown clientId → throws /CLIENT_NOT_CONNECTED/, logActionToBackend NOT called
- Scenario 5: fake timers, no ACK → throws /TIMEOUT/, pendingAckResolvers.size === 0
- Scenario 6: success cleanup → pendingAckResolvers.size === 0 after resolved

## Verification Results

```
Test Files  16 passed (16)
Tests       119 passed (119)
```

TypeScript build: `tsc` exits 0, no type errors.

Grep checks all pass:
- `sendActionRequest` exported from action-dispatcher.ts
- `logActionToBackend` called at 2 sites (denied path + ACK path)
- `clientConnections.get` used for WS lookup
- `pendingAckResolvers.set` used for ACK routing
- `ActionRequestSchema.safeParse` used for whitelist validation
- `TIMEOUT_MS = 12_000` defined

## Gap Closure: LACT-08

Before this plan, `logActionToBackend` had 0 production call sites — audit log was wired but never called. After this plan, `action-dispatcher.ts` provides 2 call sites:
1. Denied path (whitelist rejection) — before any WS operation
2. ACK path (confirmed/denied/timeout) — after Electron responds

Phase 55's LangGraph tool will call `sendActionRequest` directly to complete the bidirectional channel.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unhandled rejection in timeout test**
- **Found during:** Task 2 (GREEN verification)
- **Issue:** `vi.advanceTimersByTimeAsync` fires the `setTimeout` synchronously within the fake timer context, causing the promise to reject before `await expect(...).rejects.toThrow()` could attach its handler. Vitest treated this as an unhandled global rejection, causing test runner to report `1 error` even though all 6 tests passed.
- **Fix:** Attached `.catch((e) => e)` immediately after `sendActionRequest(...)` (before `advanceTimersByTimeAsync`) to capture the rejection, then asserted on the caught value with `expect(caught).toBeInstanceOf(Error)` + `expect(caught.message).toMatch(...)`.
- **Files modified:** apps/gateway/src/__tests__/action-dispatcher.test.ts
- **Commit:** 6f3dd5c

## Known Stubs

None — sendActionRequest is fully wired. logActionToBackend has real HTTP call to backend-ts `/internal/actions-log`.

## Self-Check: PASSED
