---
phase: 06-fastapi-core
plan: "02"
subsystem: api
tags: [fastapi, sse, send_stream, asyncio-queue, chat-endpoint, tdd]

# Dependency graph
requires:
  - phase: 06-fastapi-core/06-01
    provides: FastAPI app, lifespan, conftest fixtures, ChatSession via app.state

provides:
  - POST /chat endpoint (API-01) wrapping ChatSession.send()
  - GET /chat/stream SSE endpoint (API-02) using ChatSession.send_stream()
  - ChatSession.send_stream() async generator method (no stdout, token-by-token)
  - Session concurrency lock returning 429 on busy session
  - Complete API test suite (test_chat.py, test_stream.py)

affects:
  - jarvis.api:app — routes /chat and /chat/stream now registered
  - CLI unchanged — python -m jarvis still works identically

# Tech tracking
tech-stack:
  added: []
  patterns:
    - asyncio.Queue bridge pattern for async generator from astream() (D-02)
    - EventSourceResponse + ServerSentEvent for native SSE (FastAPI 0.135.3)
    - asyncio.Lock as session concurrency guard returning 429
    - TDD RED/GREEN workflow for send_stream()

key-files:
  created:
    - src/jarvis/api/routes/chat.py
    - tests/api/test_chat.py
    - tests/api/test_stream.py
  modified:
    - src/jarvis/core/session.py
    - src/jarvis/api/__init__.py
    - tests/api/conftest.py

key-decisions:
  - "send_stream() uses asyncio.Queue not send() internally — avoids stdout pollution (D-02)"
  - "send_stream() uses self.llm.astream (no tools) — tool streaming deferred to future phase"
  - "asyncio.Lock for session concurrency — returns 429 immediately (not queue waiting)"
  - "SSE uses GET /chat/stream?message=... query param — EventSource API is GET-only in browsers"

requirements-completed:
  - API-01
  - API-02

# Metrics
duration: 5min
completed: "2026-04-05"
---

# Phase 6 Plan 02: Chat Endpoints Summary

**POST /chat (API-01) and GET /chat/stream SSE (API-02) implemented with send_stream() async generator in ChatSession — 251 tests passing**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-05T23:22:51Z
- **Completed:** 2026-04-05T23:27:24Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- `send_stream()` added to `ChatSession` as a new async generator method using `asyncio.Queue` to bridge LLM `astream()` with the generator interface. Does NOT print to stdout (D-02). Sentinel `None` in `finally` block ensures no hang on LLM exceptions (RESEARCH Pitfall 3).
- `POST /chat` endpoint wraps `session.send()` with an `asyncio.Lock`, returning 429 immediately if session is busy (RESEARCH open question 1).
- `GET /chat/stream` endpoint uses `EventSourceResponse` + `ServerSentEvent` from `fastapi.sse` (native FastAPI 0.135.3, no sse-starlette).
- `chat_router` registered in `jarvis.api:app` — routes `/chat` and `/chat/stream` now live.
- `conftest.py` updated to include `chat_router` in test fixture for Plan 02 test isolation.
- Full regression: 251 tests passing (238 pre-existing + 5 stream unit tests + 8 endpoint tests).

## Task Commits

Each task was committed atomically:

1. **TDD RED — test_stream.py** - `84650b6` (test)
2. **Task 1: send_stream() implementation** - `ec64fcb` (feat)
3. **Task 2: Chat endpoints + conftest update + test_chat.py** - `22cc319` (feat)

## Files Created/Modified

- `src/jarvis/core/session.py` — Added `send_stream()` method + `AsyncGenerator` import
- `src/jarvis/api/routes/chat.py` — NEW: POST /chat and GET /chat/stream endpoints
- `src/jarvis/api/__init__.py` — Added `chat_router` registration
- `tests/api/conftest.py` — Updated `client` fixture to include `chat_router`
- `tests/api/test_stream.py` — NEW: 5 unit tests for send_stream() (TDD)
- `tests/api/test_chat.py` — NEW: 8 endpoint tests for API-01 and API-02

## Decisions Made

- **asyncio.Queue bridge:** `send_stream()` runs its own `astream()` loop via background task + Queue. Does NOT call `send()` internally to avoid stdout side effects.
- **Tool calls deferred:** `send_stream()` uses `self.llm.astream` (not `self._llm_with_tools`) — tool streaming is explicitly out of scope for Phase 6 per RESEARCH open question 2.
- **Lock returns 429 immediately:** `_session_lock.locked()` check returns 429 without waiting — correct behavior for personal use where concurrent requests indicate misuse.

## Deviations from Plan

None — plan executed exactly as written. TDD flow followed: RED commit → GREEN commit.

## Known Stubs

None — `send_stream()` is fully wired to real `astream()` logic. The SSE endpoint yields real tokens from the session.

## Self-Check: PASSED

All created files exist on disk. All commits verified in git log.
- src/jarvis/api/routes/chat.py: FOUND
- tests/api/test_chat.py: FOUND
- tests/api/test_stream.py: FOUND
- Commit 84650b6 (RED tests): FOUND
- Commit ec64fcb (send_stream impl): FOUND
- Commit 22cc319 (endpoints + tests): FOUND
