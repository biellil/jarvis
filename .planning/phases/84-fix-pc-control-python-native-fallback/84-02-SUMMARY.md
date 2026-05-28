---
phase: 84-fix-pc-control-python-native-fallback
plan: "02"
subsystem: desktop-py + gateway
tags: [sse, python, pc-control, dispatch, fallback]
dependency_graph:
  requires: [84-01]
  provides: [sse-listener-thread, client-id-header, python-sse-dispatch]
  affects: [action-dispatcher.ts, chat.py, config.py]
tech_stack:
  added: []
  patterns: [daemon-thread, exponential-backoff, sse-event-stream, lazy-import]
key_files:
  created:
    - apps/desktop-py/src/jarvis_desktop/sse_listener.py
    - apps/desktop-py/tests/test_sse_listener.py
  modified:
    - apps/gateway/src/lib/action-dispatcher.ts
    - apps/desktop-py/src/jarvis_desktop/config.py
    - apps/desktop-py/src/jarvis_desktop/chat.py
decisions:
  - Python SSE fallback uses TIMEOUT_PY_MS=30_000 (vs 12s Electron) for 5s confirmation window
  - Lazy imports in _sse_loop avoid circular imports at module load time
  - task:pc_action dispatched in separate thread to avoid blocking SSE read loop
  - _console() lazy accessor pattern (same as tts.py, voice_modes.py) prevents circular import
metrics:
  duration_minutes: 6
  completed_date: "2026-05-28"
  tasks_completed: 3
  files_changed: 5
---

# Phase 84 Plan 02: Python SSE Dispatch Wiring Summary

Python SSE client channel fully wired: action-dispatcher.ts falls back to Python SSE when Electron WS absent, JarvisConfig carries client_id, all gateway requests inject x-jarvis-client-id header, and sse_listener.py daemon thread connects to /api/actions/events with exponential backoff reconnection.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add Python SSE fallback to action-dispatcher.ts | c1cf908 | apps/gateway/src/lib/action-dispatcher.ts |
| 2 | Add client_id to JarvisConfig and update build_request_headers | b490834 | config.py, chat.py |
| 3 | Create sse_listener.py and write pytest tests | 198c2b6 | sse_listener.py, test_sse_listener.py |

## What Was Built

**action-dispatcher.ts dual-path dispatch:**
- Imports `pythonSseClients` from ws-server.ts (already exported in Plan 01)
- `TIMEOUT_PY_MS = 30_000` constant for Python SSE path (30s vs 12s Electron)
- If Electron WS connected: existing code path unchanged
- If not connected: checks `pythonSseClients.get(req.clientId)`, throws `CLIENT_NOT_CONNECTED` if absent
- SSE event format: `event: task:pc_action\ndata: {requestId, action, params}\n\n`
- Same ACK resolver pattern as Electron path; early return after Python path

**JarvisConfig.client_id field:**
- `client_id: str = Field(default="")` added at end of field declarations
- Forward-compatible with existing config.json files (unknown keys ignored by load_config)

**build_request_headers updated:**
- New signature: `def build_request_headers(api_key: str, client_id: str = "") -> dict`
- Injects `x-jarvis-client-id` header when client_id is non-empty
- Both callers updated: `_post_task_resume` and `_stream_response` in chat.py

**sse_listener.py:**
- `start_sse_listener(config, client_id)` — idempotent daemon thread start
- `stop_sse_listener()` — sets stop event, joins thread with 5s timeout
- `_sse_loop` reconnects with exponential backoff: 1 -> 2 -> 4 -> 8 -> 16 -> 30s cap
- Sends `x-jarvis-client-id` header and `?clientId=` query param on SSE connection
- `task:pc_action` events dispatched via `_handle_agentic_event` in separate thread (non-blocking)

## Verification

- `npx tsc --noEmit` in apps/gateway: exits 0 (clean compile)
- `uv run pytest tests/test_sse_listener.py -x -q`: 5 passed
- `uv run pytest tests/test_chat.py -x -q`: 1 passed, 1 xfailed, 3 xpassed (no regressions)
- Full suite: 3 pre-existing failures (test_config_persistence, test_open_folder_native, test_ptt_mode_hotkey) — all confirmed pre-existing via git stash check

## Decisions Made

1. `TIMEOUT_PY_MS = 30_000` — Python path gets 30s (vs 12s Electron) because PC control requires a user confirmation window of up to 5s on Python side
2. Lazy imports in `_sse_loop` (`from jarvis_desktop.chat import ...`) — avoids circular import at module load, same pattern as existing modules
3. `task:pc_action` handler spawns a new daemon thread — SSE read loop must not block waiting for user confirmation input
4. `_console()` lazy accessor — same pattern as `tts.py` and `voice_modes.py` to avoid circular import at module level

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all wiring is complete. The `sse_listener` is ready to be called from `__main__.py` (Plan 03 task).

## Self-Check: PASSED

- FOUND: apps/gateway/src/lib/action-dispatcher.ts
- FOUND: apps/desktop-py/src/jarvis_desktop/config.py
- FOUND: apps/desktop-py/src/jarvis_desktop/chat.py
- FOUND: apps/desktop-py/src/jarvis_desktop/sse_listener.py
- FOUND: apps/desktop-py/tests/test_sse_listener.py
- FOUND commit c1cf908 (action-dispatcher.ts)
- FOUND commit b490834 (config.py + chat.py)
- FOUND commit 198c2b6 (sse_listener.py + tests)
