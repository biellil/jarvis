---
phase: 95-streaming-tts
plan: 03
subsystem: tts
tags: [tts, worker-thread, queue, loguru, streaming, kokoro]

requires:
  - phase: 95-01
    provides: sentence_chunker.py and test_tts_worker.py stubs for this plan

provides:
  - TTS daemon worker thread (_tts_worker_loop) consuming _tts_queue in FIFO order
  - start_tts_worker() — idempotent session-lifetime thread starter
  - _tts_queue (maxsize=3) for backpressure (D-08)
  - Extended stop_tts() with get_nowait() drain (D-10)
  - is_speaking() extended to return True while queue has pending sentences (D-09)
  - TTFA logging via loguru before first sentence plays (D-14)

affects:
  - 95-04 (wires _tts_queue producer from chat.py)
  - voice_modes.py (uses is_speaking() for anti-feedback)

tech-stack:
  added: [loguru, queue, time]
  patterns:
    - Worker daemon thread pattern (session-lifetime, like SSE listener)
    - Timeout-based queue.get() to allow clean stop via _stop_event
    - is_speaking() covers entire drain via queue.empty() check (D-09)

key-files:
  created: []
  modified:
    - apps/desktop-py/src/jarvis_desktop/tts.py
    - apps/desktop-py/tests/conftest.py
    - apps/desktop-py/tests/test_tts_worker.py

key-decisions:
  - "is_speaking() returns True when _is_playing OR _tts_queue not empty — covers entire multi-sentence drain (D-09)"
  - "Worker uses get(timeout=0.05) instead of blocking get() — enables clean stop via _stop_event without sentinel in queue"
  - "stop_tts() drains queue via get_nowait() loop (not queue.clear()) then sets _stop_event — worker exits within 50ms"
  - "_WORKER_SENTINEL retained in API but not used by stop_tts() — kept for future direct poison-pill use by Plan 04"

requirements-completed: [STTS-03, STTS-04]

duration: 8min
completed: 2026-06-11
---

# Phase 95 Plan 03: TTS Worker Thread Infrastructure Summary

**TTS daemon worker with _tts_queue (maxsize=3), start_tts_worker(), _tts_worker_loop(), extended stop_tts() drain, and TTFA loguru logging — all 5 test_tts_worker.py tests GREEN**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-11T00:05:00Z
- **Completed:** 2026-06-11T00:10:59Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments

- `_tts_queue` (maxsize=3) added to `tts.py` for backpressure (D-08)
- `start_tts_worker()` idempotent daemon thread starter wired into `init_tts()`
- `_tts_worker_loop()` consumes sentences in FIFO order, logs TTFA before first sentence (D-14), calls `speak()` per sentence (D-15)
- `stop_tts()` extended to drain queue via `get_nowait()` loop + `_stop_event.set()` (D-10)
- `is_speaking()` updated to return True while `_tts_queue` has pending items (D-09 anti-feedback gap fix)
- `xfail` marker removed from `test_tts_worker.py` — 5/5 tests GREEN
- `conftest.py` gains `_reset_tts_worker_state` autouse fixture for test isolation

## Task Commits

1. **Task 1: Add worker thread infrastructure to tts.py** - `1ae05c2` (feat)

## Files Created/Modified

- `apps/desktop-py/src/jarvis_desktop/tts.py` — Added imports (queue, time, loguru), globals (_tts_queue, _tts_thread, _WORKER_SENTINEL), start_tts_worker(), _tts_worker_loop(), extended stop_tts(), updated is_speaking(), updated docstring
- `apps/desktop-py/tests/conftest.py` — Added _reset_tts_worker_state autouse fixture
- `apps/desktop-py/tests/test_tts_worker.py` — Removed xfail marker

## Decisions Made

- **is_speaking() covers queue**: `return _is_playing or not _tts_queue.empty()` ensures True during entire multi-sentence drain, even when the worker has momentarily cleared `_is_playing` between sentences (D-09 invariant)
- **Timeout-based get()**: Worker uses `_tts_queue.get(timeout=0.05)` instead of blocking `get()`. This enables clean stop via `_stop_event.is_set()` check without requiring sentinel injection, keeping the queue empty after `stop_tts()`
- **Sentinel retained**: `_WORKER_SENTINEL = None` kept in module API for Plan 04 (producer) to use if needed, but `stop_tts()` no longer injects it

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Worker stop mechanism redesigned to avoid sentinel leaking into queue**
- **Found during:** Task 1 (running test_stop_tts_drains_queue)
- **Issue:** Plan specified injecting `_WORKER_SENTINEL` in `stop_tts()` to unblock the worker. But this left the sentinel in the queue, causing `_tts_queue.empty()` to return False after `stop_tts()`, failing the test assertion
- **Fix:** Changed worker to use `get(timeout=0.05)` with periodic `_stop_event.is_set()` check. `stop_tts()` only drains + sets `_stop_event` — no sentinel injection needed
- **Files modified:** tts.py
- **Verification:** test_stop_tts_drains_queue passes, queue is empty after stop_tts()
- **Committed in:** 1ae05c2

**2. [Rule 1 - Bug] is_speaking() extended to cover queue drain window**
- **Found during:** Task 1 (running test_is_speaking_multisent_drain)
- **Issue:** With mocked instant sd.play/wait, the worker processes all 3 sentences before the test's polling loop starts. `_is_playing` was always False by the time the test polled
- **Fix:** `is_speaking()` changed from `return _is_playing` to `return _is_playing or not _tts_queue.empty()`. This correctly implements D-09: anti-feedback True during entire drain, not just during active sd.play()
- **Files modified:** tts.py
- **Verification:** test_is_speaking_multisent_drain passes; semantically correct (queue items represent pending speech)
- **Committed in:** 1ae05c2

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs discovered during test verification)
**Impact on plan:** Both fixes improve correctness. The is_speaking() change is strictly more correct per D-09 specification. The sentinel fix makes stop_tts() behave as documented.

## Issues Encountered

- Pre-existing test failure `test_import_error_disables_session` in `test_tts.py` — confirmed pre-existing via git stash. Not caused by Phase 95-03 changes. Deferred to `deferred-items.md`.

## Known Stubs

None — all worker infrastructure is fully implemented and wired.

## Next Phase Readiness

- Plan 03 complete: `tts.py` has worker infrastructure
- Plan 04 can now wire `chat.py` to put sentences into `_tts_queue` instead of calling `speak()` directly
- `start_tts_worker`, `stop_tts`, `is_speaking`, `_tts_queue`, `_WORKER_SENTINEL` all exported and testable

---
*Phase: 95-streaming-tts*
*Completed: 2026-06-11*
