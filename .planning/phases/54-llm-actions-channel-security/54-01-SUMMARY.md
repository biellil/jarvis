---
phase: 54-llm-actions-channel-security
plan: 01
subsystem: api
tags: [websocket, zod, path-validation, audit-log, ws, gateway]

# Dependency graph
requires: []
provides:
  - WebSocket server at /api/actions (gateway port 3000) with clientId connection tracking
  - Map<clientId, WebSocket> exported as clientConnections for LangGraph tool (Plan 03)
  - pendingAckResolvers Map for Promise-based ACK routing
  - Path whitelist validator (Zod) allowing home, Downloads, Documents, Desktop only
  - ActionRequestSchema and ActionAckSchema with UUID and enum validation
  - audit-logger.ts posting denied/timeout entries to /internal/actions-log
  - gateway index.ts refactored to http.createServer + setupWebSocketServer
affects:
  - 54-02 (actionsLog backend SQLite route receives POST from audit-logger)
  - 54-03 (Electron client connects to /api/actions using clientConnections Map)
  - 54-04 (LangGraph tool imports clientConnections + pendingAckResolvers)

# Tech tracking
tech-stack:
  added: [ws@8.18.0, @types/ws@8.5.14]
  patterns:
    - noServer:true WebSocket upgrade pattern (avoids port conflicts with Express)
    - Map<clientId, WebSocket> for connection registry with replace-on-reconnect
    - pendingAckResolvers Map for Promise-based ack routing without polling
    - Zod refine() for path whitelist validation within schema definition

key-files:
  created:
    - apps/gateway/src/lib/path-validator.ts
    - apps/gateway/src/lib/ws-server.ts
    - apps/gateway/src/lib/audit-logger.ts
    - apps/gateway/src/__tests__/path-validator.test.ts
    - apps/gateway/src/__tests__/ws-actions.test.ts
  modified:
    - apps/gateway/src/index.ts
    - apps/gateway/package.json

key-decisions:
  - "ws noServer:true + httpServer.on('upgrade') to share port 3000 with Express without conflict"
  - "clientConnections Map replace-on-reconnect: old.terminate() before set() prevents stale entries silently accumulating"
  - "pendingAckResolvers Map (not EventEmitter) for ACK routing — simpler, type-safe, Promise-compatible"
  - "isPathValid uses path.resolve() to normalize .. traversal then checks startsWith(home+sep) for cross-platform safety"
  - "Test paths use os.homedir() + path.join() instead of mocked POSIX paths — avoids Windows path.resolve incompatibility"

patterns-established:
  - "WS server: noServer:true pattern — attach via httpServer.on('upgrade') for port sharing with Express"
  - "ACK routing: register resolver in pendingAckResolvers before sending action_request; ws-server calls and removes on receipt"
  - "Path validation: path.resolve() normalizes all traversal; startsWith(home+sep) is the gate"

requirements-completed: [LACT-07, LACT-09]

# Metrics
duration: 12min
completed: 2026-05-06
---

# Phase 54 Plan 01: WebSocket Server + Path Validator Summary

**WebSocket server at /api/actions with clientId connection Map, Zod path whitelist (home/Downloads/Documents/Desktop), audit POST to /internal/actions-log, and http.Server refactor in gateway index.ts**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-06T00:23:52Z
- **Completed:** 2026-05-06T00:35:18Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- WebSocket server running at /api/actions (port 3000) with clientId-keyed connection Map exported for LangGraph tool
- Zod path whitelist validator with path traversal protection, covering home + 3 whitelisted subdirs
- audit-logger.ts posts denied/timeout action entries to backend-ts /internal/actions-log
- gateway index.ts refactored from app.listen to http.createServer + setupWebSocketServer (prerequisite for WS on same port)
- 27 new tests (19 path-validator + 8 ws-actions), all passing; total gateway test suite 113 tests passing

## Task Commits

1. **Task 1: Path validator + Zod message schemas** - `ba9e93c` (test + feat, TDD)
2. **Task 2: WebSocket server + audit-logger + gateway index refactor** - `5ac0574` (feat)

## Files Created/Modified
- `apps/gateway/src/lib/path-validator.ts` - isPathValid, ActionRequestSchema, ActionAckSchema, ActionRequest/Ack types
- `apps/gateway/src/lib/ws-server.ts` - setupWebSocketServer, clientConnections Map, pendingAckResolvers Map
- `apps/gateway/src/lib/audit-logger.ts` - logActionToBackend POSTs ActionLogEntry to backend-ts
- `apps/gateway/src/index.ts` - refactored to http.createServer(app) + setupWebSocketServer(httpServer)
- `apps/gateway/src/__tests__/path-validator.test.ts` - 19 tests: whitelist cases, Zod schema validation
- `apps/gateway/src/__tests__/ws-actions.test.ts` - 8 tests: connect/reject/disconnect/reconnect/ack-routing/drop/malformed-json/wrong-path
- `apps/gateway/package.json` - added ws@8.18.0 + @types/ws@8.5.14

## Decisions Made
- Used `noServer: true` WebSocket pattern — attaches via `httpServer.on('upgrade')` to share port 3000 with Express without spawning a second server. The only viable approach when Express must handle HTTP and WS on the same port.
- `clientConnections` and `pendingAckResolvers` are module-level Map exports (not class instances) — simplifies imports by LangGraph tool in Plan 03; Maps are long-lived singletons.
- Tests use real `os.homedir() + path.join()` instead of mocking `os.homedir()` — on Windows `path.resolve('/home/testuser')` returns `C:\home\testuser`, breaking POSIX-based mock expectations; real paths are always cross-platform correct.

## Deviations from Plan

None — plan executed exactly as written. The only minor adaptation was test strategy: plan specified mocking `os.homedir()` to `/home/testuser`, but on Windows `path.resolve()` transforms POSIX paths to `C:\home\testuser`, making all tests fail. Used real `os.homedir()` + `path.join()` instead — same test coverage, correct on all platforms. No behavioral change to production code.

## Issues Encountered
- `beforeAll` was used in path-validator.test.ts but not imported — caught by TypeScript build (`tsc`), fixed by adding to import. No behavioral impact.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `clientConnections` and `pendingAckResolvers` Maps ready for Plan 03 (Electron WS client) and Plan 04 (LangGraph tool)
- `setupWebSocketServer` exported and tested — gateway boots with WS support on same port 3000
- `audit-logger.ts` ready for Plan 02 (backend-ts /internal/actions-log route)

---
*Phase: 54-llm-actions-channel-security*
*Completed: 2026-05-06*
