---
phase: 84-fix-pc-control-python-native-fallback
verified: 2026-05-28T15:30:00Z
status: human_needed
score: 11/11 must-haves verified
human_verification:
  - test: "Start gateway (pnpm dev:gateway) and Python client only (no Electron), type 'abre a pasta downloads' in chat"
    expected: "Terminal shows 'Confirmar: abrir pasta Downloads? [s/n] (5s): ', typing 's' opens Downloads folder, gateway receives confirmed ACK"
    why_human: "End-to-end flow across two processes requires running servers; cannot verify SSE long-lived connection behavior, terminal prompt interaction, or file explorer launch programmatically"
  - test: "With Python client running, wait 5 seconds without responding to a confirmation prompt"
    expected: "Action auto-cancels, terminal shows cancellation message, gateway receives denied ACK, no folder opens"
    why_human: "Requires interactive terminal input with timed cancellation — not testable without running process"
  - test: "Check ~/.jarvis/client_id file after first Python client boot"
    expected: "File exists and contains a valid UUID string"
    why_human: "File is created at runtime — can check statically if file already exists but cannot verify fresh-boot creation without running the client"
---

# Phase 84: Fix PC Control Python Native Fallback — Verification Report

**Phase Goal:** Fix PC Control Python native fallback — wire the Python desktop client to receive and execute PC control actions (openFolder, openFile, closeFile) via SSE when Electron WS is absent.
**Verified:** 2026-05-28T15:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GET /api/actions/events responds with SSE headers and keeps connection open | ✓ VERIFIED | `actions-events.ts` sets Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive, calls flushHeaders() |
| 2 | Gateway stores SSE response in pythonSseClients Map keyed by clientId | ✓ VERIFIED | `ws-server.ts` line 8 exports `pythonSseClients`; `actions-events.ts` lines 31-35 sets entry in map |
| 3 | POST /api/actions/ack resolves pendingAckResolvers and returns { ok: true } | ✓ VERIFIED | `actions-ack.ts` lines 41-43: delete-before-resolve + resolver call + `res.json({ ok: true })` |
| 4 | POST /api/actions/ack with unknown requestId returns 404 | ✓ VERIFIED | `actions-ack.ts` lines 34-37: 404 when resolver not found |
| 5 | Client disconnect removes entry from pythonSseClients Map | ✓ VERIFIED | `actions-events.ts` lines 48-53: `res.on('close')` deletes clientId from map and clears heartbeat |
| 6 | action-dispatcher.ts falls back to Python SSE when Electron WS is unavailable | ✓ VERIFIED | `action-dispatcher.ts` lines 55-110: dual-path — checks `isElectronConnected`, falls back to `pythonSseClients.get(req.clientId)` |
| 7 | Python client sends x-jarvis-client-id on all gateway requests | ✓ VERIFIED | `chat.py` line 122: `headers["x-jarvis-client-id"] = client_id`; all callers pass client_id |
| 8 | sse_listener.py starts a daemon thread on boot that connects to /api/actions/events | ✓ VERIFIED | `sse_listener.py` lines 50-56: `threading.Thread(..., daemon=True)`; `__main__.py` line 102: `start_sse_listener(config, client_id)` before chat_loop |
| 9 | sse_listener.py reconnects automatically with exponential backoff on connection failure | ✓ VERIFIED | `sse_listener.py` lines 121-122, 127-128, 133-134: `_stop_event.wait(backoff)` + `backoff = min(backoff * 2, 30)` in all except branches |
| 10 | JarvisConfig has client_id field | ✓ VERIFIED | `config.py` lines 68-71: `client_id: str = Field(default="")` |
| 11 | __main__.py generates/loads persistent UUID and starts SSE listener before chat_loop | ✓ VERIFIED | `__main__.py` lines 59-102: `_load_or_create_client_id()`, `config.client_id = client_id`, `start_sse_listener(config, client_id)` before `chat_loop(config)` |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/gateway/src/lib/ws-server.ts` | Exports pythonSseClients Map | ✓ VERIFIED | Line 8: `export const pythonSseClients = new Map<string, http.ServerResponse>()` |
| `apps/gateway/src/routes/actions-events.ts` | SSE registration endpoint, exports actionsEventsRouter | ✓ VERIFIED | 61 lines, full implementation with heartbeat, disconnect cleanup, clientId validation |
| `apps/gateway/src/routes/actions-ack.ts` | ACK endpoint, exports actionsAckRouter | ✓ VERIFIED | 47 lines, Zod validation, delete-before-resolve pattern, 404 on missing resolver |
| `apps/gateway/src/app.ts` | Mounts both routers under /api | ✓ VERIFIED | Lines 9-10: imports; lines 26-27: `app.use("/api", actionsEventsRouter)` and `app.use("/api", actionsAckRouter)` |
| `apps/gateway/src/lib/action-dispatcher.ts` | Python SSE fallback with TIMEOUT_PY_MS=30000 | ✓ VERIFIED | Lines 16, 55-110: dual-path logic with SSE event emission and ACK resolver |
| `apps/gateway/src/__tests__/actions-events.test.ts` | Vitest tests for SSE endpoint | ✓ VERIFIED | Exists, tests 400 validation, stale connection replacement, disconnect cleanup |
| `apps/gateway/src/__tests__/actions-ack.test.ts` | Vitest tests for ACK endpoint | ✓ VERIFIED | Exists, 6 test cases covering all branches |
| `apps/desktop-py/src/jarvis_desktop/config.py` | JarvisConfig with client_id field | ✓ VERIFIED | Lines 68-71: field present with default="" |
| `apps/desktop-py/src/jarvis_desktop/chat.py` | Updated build_request_headers + _post_action_ack + task:pc_action handler | ✓ VERIFIED | Lines 112-123: new signature; lines 178-209: _post_action_ack; lines 290-333: confirmation + ACK flow |
| `apps/desktop-py/src/jarvis_desktop/sse_listener.py` | Daemon thread with backoff, exports start/stop | ✓ VERIFIED | 141 lines, start_sse_listener, stop_sse_listener, exponential backoff capped at 30s |
| `apps/desktop-py/src/jarvis_desktop/__main__.py` | Boot wires client_id + SSE listener | ✓ VERIFIED | Lines 20-35: _load_or_create_client_id helper; lines 59-102: step 6.5 and step 7 |
| `apps/desktop-py/tests/test_sse_listener.py` | pytest tests for SSE listener | ✓ VERIFIED | Exists with lifecycle, backoff, and header injection test classes |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| actions-ack.ts | ws-server.ts pendingAckResolvers | `import { pendingAckResolvers } from '../lib/ws-server.js'` | ✓ WIRED | Line 11 in actions-ack.ts; resolver called at line 42 |
| action-dispatcher.ts | ws-server.ts pythonSseClients | `import { pythonSseClients } from './ws-server.js'` | ✓ WIRED | Line 3 in action-dispatcher.ts; `pythonSseClients.get(req.clientId)` at line 60 |
| actions-events.ts | ws-server.ts pythonSseClients | `import { pythonSseClients } from '../lib/ws-server.js'` | ✓ WIRED | Line 11; set/delete operations at lines 31-35, 44, 50 |
| sse_listener.py | /api/actions/events | `urllib.request.urlopen` | ✓ WIRED | Line 84: constructs URL with `/api/actions/events?clientId=`; line 93: `urlopen(req, timeout=300)` |
| chat.py build_request_headers | x-jarvis-client-id header | `headers["x-jarvis-client-id"] = client_id` | ✓ WIRED | Line 122; all 3 callers pass client_id arg |
| __main__.py | sse_listener.start_sse_listener | `from jarvis_desktop.sse_listener import start_sse_listener` | ✓ WIRED | Lines 101-102 in __main__.py |
| chat.py task:pc_action branch | /api/actions/ack | `_post_action_ack(config, request_id, status, content)` | ✓ WIRED | Lines 301, 326, 328, 330, 333: all branch exits call _post_action_ack |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| action-dispatcher.ts Python SSE path | ack (ActionAck) | pendingAckResolvers resolved by POST /api/actions/ack | Yes — resolver populated by Python client POST | ✓ FLOWING |
| sse_listener.py | events (task:pc_action) | urllib SSE stream from /api/actions/events | Yes — SSE emitted by action-dispatcher.ts write() | ✓ FLOWING |
| chat.py _post_action_ack | requestId, status | data.get("requestId") from parsed SSE payload | Yes — requestId is a real UUID from dispatcher | ✓ FLOWING |
| __main__.py client_id | client_id | _load_or_create_client_id() reads/writes ~/.jarvis/client_id | Yes — UUID from file or uuid.uuid4() | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| sse_listener.py exports importable | `python -c "from jarvis_desktop.sse_listener import start_sse_listener, stop_sse_listener; print('ok')"` | Not run (no Python env in scope) | ? SKIP |
| actionsAckRouter exported | grep check in actions-ack.ts | `export const actionsAckRouter = Router()` on line 15 | ✓ PASS |
| actionsEventsRouter exported | grep check in actions-events.ts | `export const actionsEventsRouter = Router()` on line 14 | ✓ PASS |
| Full end-to-end SSE dispatch flow | Requires running gateway + Python client | Cannot test without running server | ? SKIP (route to human) |

Step 7b: PARTIAL — module exports verified statically; runtime behavior routed to human verification.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| REQ-84-01 | 84-01, 84-02 | SSE registration endpoint + Python daemon thread consuming events | ✓ SATISFIED | actions-events.ts + sse_listener.py both exist and are wired |
| REQ-84-02 | 84-02, 84-03 | Python client generates and sends persistent client_id | ✓ SATISFIED | config.py client_id field + __main__.py _load_or_create_client_id + build_request_headers header injection |
| REQ-84-04 | 84-03 | task:pc_action handler shows confirmation prompt and posts ACK | ✓ SATISFIED | chat.py lines 290-333: confirmation + _post_action_ack on all exit paths |
| REQ-84-05 | 84-01, 84-03 | POST /api/actions/ack endpoint resolves pending resolver | ✓ SATISFIED | actions-ack.ts full implementation + _post_action_ack caller in chat.py |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | No stubs, placeholders, or hardcoded empty returns detected in Phase 84 files | — | — |

Key checks performed:
- No `return null` / `return []` / `return {}` in route handlers
- No `TODO` / `FIXME` / `placeholder` comments in Phase 84 files
- All task:pc_action exit paths call `_post_action_ack` (not no-ops)
- `_post_task_resume` preserved intact (not removed) — verified present at line 155

### Human Verification Required

#### 1. End-to-End PC Control via SSE (Electron absent)

**Test:** Start gateway (`pnpm dev:gateway`), then start Python client only without Electron (`pnpm dev:desktop-py`). In chat, type: `abre a pasta downloads`
**Expected:** Terminal shows `Confirmar: abrir pasta Downloads? [s/n] (5s): `. Typing `s` opens Downloads folder in the system file explorer. Gateway logs show `action_ack received from Python` with status `confirmed`.
**Why human:** Requires two running processes, interactive terminal input, OS-level file explorer launch, and SSE long-lived connection — none of which can be verified statically.

#### 2. Auto-cancel on 5-second timeout

**Test:** Trigger a PC action (`abre a pasta documents`), then wait without typing anything for 5+ seconds.
**Expected:** Prompt disappears, terminal shows a cancellation message, no folder opens, gateway receives a `denied` ACK.
**Why human:** Requires interactive timing and observation of terminal behavior under timeout.

#### 3. Persistent client_id file

**Test:** Run `cat ~/.jarvis/client_id` after first Python client boot.
**Expected:** File exists and contains a UUID string (e.g. `550e8400-e29b-41d4-a716-446655440000`).
**Why human:** The SUMMARY reports this was approved in the human smoke test checkpoint, but the file's presence after a fresh boot cannot be confirmed without running the process.

### Gaps Summary

No gaps found. All 11 truths verified with substantive implementation and full wiring. Three items are routed to human verification because they require running processes, interactive terminal input, or OS-level behavior that static code analysis cannot confirm.

---

_Verified: 2026-05-28T15:30:00Z_
_Verifier: Claude (gsd-verifier)_
