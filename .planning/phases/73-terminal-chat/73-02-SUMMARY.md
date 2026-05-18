---
phase: 73-terminal-chat
plan: 02
subsystem: ui
tags: [python, sse, streaming, urllib, chat, terminal]

# Dependency graph
requires:
  - phase: 73-01
    provides: JarvisConfig with api_key field, check_health() function, Wave 0 test stubs in test_chat.py
provides:
  - chat.py with SSE streaming loop (parse_sse_line, parse_sse_chunk, build_request_headers, run_with_health_check, chat_loop)
  - __main__.py wired to real chat_loop, sleep placeholder removed
  - Clean gateway-offline error (exit 1, no traceback)
  - Ctrl+C clean exit via KeyboardInterrupt handler in chat_loop
affects: [74-voice-pipeline, any phase that extends the terminal chat interaction model]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SSE chunk-boundary buffering: accumulate raw bytes into buffer, split on newlines, keep last incomplete line for next read"
    - "Health gate before loop entry: run_with_health_check exits sys.exit(1) before chat_loop is called"
    - "stdlib-only HTTP: urllib.request.urlopen with timeout=30 — no third-party dependency"
    - "D-01/D-02: print()+flush=True for streaming tokens, input('> ') for prompt"

key-files:
  created:
    - apps/desktop-py/src/jarvis_desktop/chat.py
  modified:
    - apps/desktop-py/src/jarvis_desktop/__main__.py
    - apps/desktop-py/src/jarvis_desktop/health.py

key-decisions:
  - "stdlib urllib.request used for SSE (no httpx/requests) — consistent with health.py, zero new dependencies"
  - "KeyboardInterrupt caught inside chat_loop (not just SIGINT handler) — covers both signal and direct Ctrl+C in input()"
  - "health.py timeout raised from 2s to 5s to handle slow gateway startup; HTTP 503 body read to avoid ResourceWarning"
  - "parse_sse_chunk keeps lines[-1] as incomplete buffer — handles tokens split across read() boundaries"

patterns-established:
  - "SSE buffer pattern: combined = buffer + chunk; lines = combined.split('\\n'); incomplete = lines[-1]"
  - "Chat module exports: parse_sse_line, parse_sse_chunk, build_request_headers, run_with_health_check, chat_loop"
  - "Error display convention: [erro: mensagem] inline after partial tokens, never traceback to user"

requirements-completed: [PYCHAT-01, PYCHAT-02, PYCHAT-03]

# Metrics
duration: ~45min
completed: 2026-05-18
---

# Phase 73 Plan 02: Terminal Chat Implementation Summary

**SSE streaming chat loop (chat.py) wired into __main__.py — tokens stream one-by-one from gateway, gateway-offline exits cleanly with exit code 1, Ctrl+C exits with "Shutdown."**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-05-18T00:00:00Z
- **Completed:** 2026-05-18T00:45:00Z
- **Tasks:** 2 implementation + 1 human-verify checkpoint (approved)
- **Files modified:** 3

## Accomplishments

- Implemented chat.py with SSE chunk-boundary buffering, auth header injection, health gate, and chat loop — all 4 Wave 0 test stubs turned GREEN (were xfail)
- Replaced Phase 72 sleep placeholder in __main__.py with real run_with_health_check + chat_loop call chain
- Fixed health.py edge cases (5s timeout, HTTP 503 body drain, KeyboardInterrupt in chat_loop) identified during human smoke test

## Task Commits

1. **Task 1: Create chat.py with SSE streaming, parse helpers, and health gate** - `296dda2` (feat)
2. **Task 2: Wire chat_loop into __main__.py, remove sleep placeholder** - `3373d22` (feat)
3. **Deviation: health.py timeout + 503 body fix** - `744873f` (fix)
4. **Deviation: KeyboardInterrupt catch in chat_loop** - `90b86f3` (fix)

## Files Created/Modified

- `apps/desktop-py/src/jarvis_desktop/chat.py` — New, 162 lines. SSE parse helpers, health gate, and interactive chat loop
- `apps/desktop-py/src/jarvis_desktop/__main__.py` — Updated. Removed sleep placeholder; calls run_with_health_check(config) + chat_loop(config)
- `apps/desktop-py/src/jarvis_desktop/health.py` — Fixed. Timeout raised 2s→5s; HTTP 503 response body read to avoid ResourceWarning

## Decisions Made

- Used stdlib `urllib.request` for SSE streaming (consistent with health.py, zero new dependencies)
- Catch `KeyboardInterrupt` explicitly inside `chat_loop` in addition to the SIGINT handler — covers both signal delivery and interactive `input()` interruption
- `parse_sse_chunk` keeps `lines[-1]` as buffer to handle tokens split across `read(1024)` call boundaries
- `run_with_health_check` prints "offline" in the error path to satisfy the test assertion `"offline" in captured.out.lower()`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Health check timeout too short, HTTP 503 body not drained**
- **Found during:** Task 3 (human smoke test — gateway-offline scenario)
- **Issue:** 2s timeout fired before gateway returned 503; response body unread caused ResourceWarning
- **Fix:** Raised timeout to 5s in `check_health()`; added `.read()` on 503 response before closing
- **Files modified:** `apps/desktop-py/src/jarvis_desktop/health.py`
- **Verification:** Gateway-offline path exits with exit 1 and prints clean error, no traceback
- **Committed in:** `744873f`

**2. [Rule 1 - Bug] KeyboardInterrupt not caught inside chat_loop**
- **Found during:** Task 3 (human smoke test — Ctrl+C during input() prompt)
- **Issue:** SIGINT handler in __main__.py covers signal delivery, but interactive `input()` raises KeyboardInterrupt directly; loop exited with traceback on some platforms
- **Fix:** Wrapped `input('> ')` call with `except KeyboardInterrupt` → print "\nShutdown." + sys.exit(0)
- **Files modified:** `apps/desktop-py/src/jarvis_desktop/chat.py`
- **Verification:** Ctrl+C at prompt exits cleanly with "Shutdown." — confirmed in human smoke test
- **Committed in:** `90b86f3`

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs caught during human smoke test)
**Impact on plan:** Both fixes were necessary for correct behavior. No scope creep.

## Issues Encountered

- Wave 0 test stubs used `xfail` markers — confirmed all 4 turned GREEN after Task 1 (7 passed, 4 xpassed reported by pytest)
- Human smoke test revealed two edge cases in health.py and chat_loop Ctrl+C handling; both fixed and re-verified before approval

## User Setup Required

None - no external service configuration required. Gateway URL defaults to `http://localhost:3000`.

## Next Phase Readiness

- Terminal chat is fully functional end-to-end: config load → health gate → SSE streaming loop → clean exit
- Phase 74 (voice pipeline) can import `chat_loop` or extend `_stream_response` for audio output
- No blockers

---
*Phase: 73-terminal-chat*
*Completed: 2026-05-18*
