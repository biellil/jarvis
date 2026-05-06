---
phase: 54-llm-actions-channel-security
plan: "03"
subsystem: api
tags: [websocket, ipc, electron, actions-channel, reconnect, backoff]

requires:
  - phase: 53-streaming-tts
    provides: IPC multi-window broadcast pattern (BrowserWindow.getAllWindows) reused verbatim

provides:
  - getOrCreateClientId() — stable UUID persisted in electron-store for gateway WS identity
  - ACTION_REQUEST and ACTION_ACK IPC channel constants + ActionRequestPayload/ActionAckPayload types
  - actionsClient.ts — WebSocket client with exponential backoff reconnect and IPC bridge to renderer
  - startActionsClient() wired into main/index.ts lifecycle (start + graceful stop)

affects: [54-04, gateway-ws-server, renderer-action-toast]

tech-stack:
  added: [ws (ws@8.20.0 from root node_modules)]
  patterns:
    - vi.hoisted() for inline class definitions referenced in vi.mock factories
    - Module-scope state (ws, reconnectDelayMs, stopped) for WebSocket lifecycle management
    - Exponential backoff with Math.min(delay * 2, MAX) on 'close' event

key-files:
  created:
    - apps/desktop/src/main/actions/actionsClient.ts
    - apps/desktop/src/main/actions/__tests__/actionsClient.test.ts
    - apps/desktop/src/main/__tests__/store-clientId.test.ts
  modified:
    - apps/desktop/src/main/store.ts (getOrCreateClientId + electronClientId schema field)
    - apps/desktop/src/shared/ipc-types.ts (ACTION_REQUEST, ACTION_ACK, ActionRequestPayload, ActionAckPayload)
    - apps/desktop/src/main/index.ts (startActionsClient + stopActionsClient wired)

key-decisions:
  - "vi.hoisted() used with inline MinimalEmitter class to avoid import-before-initialization error in vi.mock factory for ws"
  - "stopActionsClient() added to before-quit in main/index.ts for clean WS shutdown — not in plan but required for correctness (Rule 1)"
  - "GATEWAY_URL read from process.env['GATEWAY_URL'] with fallback ws://localhost:3000 — matches existing env-var pattern"
  - "reconnectDelayMs reset to RECONNECT_BASE_MS on startActionsClient() call to allow clean restart after stopActionsClient()"

patterns-established:
  - "vi.hoisted() pattern for inline class definitions in test files when vi.mock factory needs a class reference"
  - "Module-scope singleton pattern for WebSocket lifecycle (ws, stopped, reconnectTimer) mirrors existing singleton patterns in voiceInput"

requirements-completed: [LACT-09]

duration: 35min
completed: 2026-05-05
---

# Phase 54 Plan 03: Electron WebSocket Actions Channel Summary

**Stable clientId persisted via crypto.randomUUID + electron-store; actionsClient.ts WebSocket client with 1s→30s exponential backoff connects to gateway /api/actions and bridges action_request messages to renderer via ACTION_REQUEST IPC channel**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-05-05T21:10:00Z
- **Completed:** 2026-05-05T21:45:00Z
- **Tasks:** 2 (Task 1 was pre-committed; Task 2 implemented in this session)
- **Files modified:** 5

## Accomplishments

- Task 1 (pre-committed): `getOrCreateClientId()` in store.ts with UUID generation + persistence, `ACTION_REQUEST`/`ACTION_ACK` IPC channels + `ActionRequestPayload`/`ActionAckPayload` types in ipc-types.ts, 5-test suite for store-clientId
- Task 2: `actionsClient.ts` with WebSocket connect, exponential backoff reconnect (1000→2000→4000→…→30000ms), `action_request` message validation + IPC broadcast, `sendActionAck()` for gateway round-trip
- Wired `startActionsClient()` and `stopActionsClient()` into `main/index.ts` lifecycle (after window creation; before-quit cleanup)
- 10-test suite for actionsClient covering URL construction, IPC broadcast, malformed JSON, missing fields, backoff doubling, ACK send, stop behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: clientId store accessor + IPC channel additions** - `1aeabd6` (feat)
2. **Task 2: actionsClient.ts WebSocket client with reconnect + IPC bridge** - `0fa0430` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `apps/desktop/src/main/store.ts` - Added `electronClientId` to StoreSchema + `getOrCreateClientId()` accessor using `crypto.randomUUID`
- `apps/desktop/src/shared/ipc-types.ts` - Added `ACTION_REQUEST`/`ACTION_ACK` to `IPC_CHANNELS` + `ActionRequestPayload`/`ActionAckPayload` types + `FileAction`/`ActionAckStatus` type aliases
- `apps/desktop/src/main/actions/actionsClient.ts` - New: WebSocket client with module-scope state, exponential backoff, IPC broadcast, sendActionAck
- `apps/desktop/src/main/index.ts` - Import + call `startActionsClient()` post-window-creation; `stopActionsClient()` in before-quit handler
- `apps/desktop/src/main/__tests__/store-clientId.test.ts` - New: 5 tests for getOrCreateClientId
- `apps/desktop/src/main/actions/__tests__/actionsClient.test.ts` - New: 10 tests using vi.hoisted() + FakeWebSocket inline class

## Decisions Made

- Used `vi.hoisted()` with inline `MinimalEmitter` class (not importing from `events`) to avoid the import-before-initialization error that `vi.mock` hoisting causes when factories reference module-level classes
- `reconnectDelayMs` explicitly reset to `RECONNECT_BASE_MS` at the start of `startActionsClient()` so calling stop then start yields a clean 1s backoff
- `stopActionsClient()` added to `before-quit` handler in `main/index.ts` — plan only mentioned `startActionsClient()` but clean shutdown is required for correctness

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added stopActionsClient() to before-quit cleanup**
- **Found during:** Task 2 (main/index.ts wiring)
- **Issue:** Plan specified only `startActionsClient()` in main/index.ts. Without `stopActionsClient()` in before-quit, the WS would not be closed cleanly on app exit, potentially leaving the gateway connection open.
- **Fix:** Added `stopActionsClient()` to the `before-quit` handler alongside existing cleanup (unregisterAll, destroyTray, etc.)
- **Files modified:** apps/desktop/src/main/index.ts
- **Verification:** `stopActionsClient()` exported and test confirms it closes WS + prevents reconnect
- **Committed in:** 0fa0430 (Task 2 commit)

**2. [Rule 1 - Bug] Reset reconnectDelayMs in startActionsClient()**
- **Found during:** Task 2 (actionsClient.ts implementation)
- **Issue:** If `stopActionsClient()` was called mid-backoff and then `startActionsClient()` called again, the module-scoped `reconnectDelayMs` would retain its last doubled value, causing incorrect initial delay on restart.
- **Fix:** Added `reconnectDelayMs = RECONNECT_BASE_MS` at the start of `startActionsClient()`.
- **Files modified:** apps/desktop/src/main/actions/actionsClient.ts
- **Verification:** Test suite confirms correct 1000ms initial delay after stop+start
- **Committed in:** 0fa0430 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - correctness bugs)
**Impact on plan:** Both fixes necessary for correct lifecycle behavior. No scope creep.

## Issues Encountered

- `vi.mock` with a class defined at test file scope caused `ReferenceError: Cannot access 'FakeWebSocket' before initialization` due to hoisting. Resolved by using `vi.hoisted()` with an inline minimal EventEmitter implementation (no imports) to define the fake class before vi.mock executes.

## Known Stubs

None — actionsClient connects to real gateway WebSocket. No hardcoded empty values flowing to UI.

## User Setup Required

None — no external service configuration required. GATEWAY_URL defaults to `ws://localhost:3000` and is read from env.

## Next Phase Readiness

- Electron WS client is complete and wired — ready for gateway to implement `/api/actions` WebSocket endpoint
- Renderer needs ACTION_REQUEST IPC listener + confirmation toast UI (Phase 54 Plan 04+)
- ACTION_ACK handler in main (ipcMain.handle for renderer → main → gateway round-trip) not yet implemented — next plan

---
*Phase: 54-llm-actions-channel-security*
*Completed: 2026-05-05*
