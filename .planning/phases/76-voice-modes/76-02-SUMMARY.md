---
phase: 76-voice-modes
plan: 02
subsystem: voice
tags: [openwakeword, sounddevice, pynput, threading, queue, tts, stt]

# Dependency graph
requires:
  - phase: 76-01
    provides: wake_word_threshold in JarvisConfig, is_speaking() in tts.py, openwakeword dep
  - phase: 75-text-to-speech-tts
    provides: tts.is_speaking(), tts.stop_tts() for D-06 blocking
  - phase: 74-speech-to-text-stt
    provides: record_until_silence, transcribe, _parse_ptt_hotkey from stt.py
provides:
  - "voice_modes.py module singleton with 5 public + 3 private + 2 helper functions"
  - "init_voice_modes, start_mode, stop_mode, switch_mode, get_text_queue public API"
  - "_ptt_loop: pynput GlobalHotKeys migrated from chat.py with D-06 TTS blocking"
  - "_wake_word_loop: openwakeword hey_jarvis model with configurable vad_threshold"
  - "_always_listening_loop: VAD-only accumulation with speech buffer"
  - "switch_mode() hot-swap without restart (D-07) + config persistence (D-08)"
  - "8 passing voice_modes tests, 1 xfail stub for Plan 03"
affects:
  - 76-03
  - 77-minimal-ui

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level singleton state machine (flat pattern, matches stt.py/tts.py)"
    - "threading.Queue for cross-thread text delivery to chat_loop()"
    - "Daemon threads with threading.Event stop signal and 3s join timeout"
    - "D-06: all audio capture guarded by tts.is_speaking() poll before mic open"
    - "Lazy imports inside mode loops to avoid circular imports and startup cost"

key-files:
  created:
    - apps/desktop-py/src/jarvis_desktop/voice_modes.py
    - apps/desktop-py/tests/test_voice_modes.py
  modified: []

key-decisions:
  - "switch_mode() calls start_mode() which internally calls _stop_current() — not a separate stop_mode() call"
  - "test_switch_mode_hot_swap validates observable behavior (config updated, save_config called, start_mode called) rather than internal call sequence"
  - "D-06 enforced inside each loop's hotkey callback (_on_ptt) and audio capture paths, not at module level"
  - "Always-listening uses openwakeword Model(vad_threshold=0.5) with no wakeword_models for pure VAD behavior"
  - "speech_buffer.clear() on TTS block in always_listening_loop discards captured TTS audio (D-06 echo prevention)"

patterns-established:
  - "Module reset helper _reset_voice_modes(monkeypatch) pattern for thread-safe test isolation"
  - "Monkeypatch sys.modules for lazy-imported modules (openwakeword, pynput) inside test functions"
  - "Mock InputStream as context manager with __enter__/__exit__ for sounddevice stream tests"

requirements-completed:
  - PYMODE-01
  - PYMODE-02
  - PYMODE-03

# Metrics
duration: 18min
completed: 2026-05-18
---

# Phase 76 Plan 02: Voice Modes — voice_modes.py State Machine

**voice_modes.py singleton with three exclusive capture loops (PTT/wake-word/always-listening), thread hot-swap via switch_mode(), and D-06 TTS blocking across all modes**

## Performance

- **Duration:** 18 min
- **Started:** 2026-05-18T21:47:22Z
- **Completed:** 2026-05-18T22:05:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Implemented `voice_modes.py` (250+ lines) with all 5 public functions and 3 mode loops
- All three voice modes properly block audio capture when `tts.is_speaking()` returns True (D-06)
- `switch_mode()` hot-swaps modes without client restart and persists via `save_config()` (D-07/D-08)
- 8 of 9 voice_modes tests passing; 1 deferred xfail stub for Plan 03 (chat_loop refactor)
- Full suite green: 31 passed, 1 xfailed, 4 xpassed

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement voice_modes.py** - `3d27d34` (feat)
2. **Task 2: Full voice_modes tests** - `9e3d202` (test)

**Plan metadata:** (docs commit — follows this summary)

## Files Created/Modified

- `apps/desktop-py/src/jarvis_desktop/voice_modes.py` — Voice mode state machine with init_voice_modes, start_mode, stop_mode, switch_mode, get_text_queue, _ptt_loop, _wake_word_loop, _always_listening_loop
- `apps/desktop-py/tests/test_voice_modes.py` — 9 tests (8 passing + 1 xfail for Plan 03)

## Decisions Made

- `switch_mode()` delegates to `start_mode()` which calls `_stop_current()` internally — no separate `stop_mode()` call in the hot-swap path. This keeps the API cleaner; `stop_mode()` remains available for callers that need explicit stop.
- Test for switch_mode validates observable effects (config updated, save_config called, start_mode called) rather than internal call sequence — more robust to future refactors.
- Always-listening uses `Model(vad_threshold=0.5)` with no `wakeword_models` argument — pure VAD behavior without wake word trigger.
- `speech_buffer.clear()` called inside TTS block in always-listening loop to discard any TTS audio that leaked into the buffer (D-06 echo prevention).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test_switch_mode_hot_swap to match implementation**
- **Found during:** Task 2 (test writing)
- **Issue:** Initial test monkeypatched `stop_mode` expecting switch_mode() to call it directly. But switch_mode() calls start_mode() which calls _stop_current() — not stop_mode(). Test was testing wrong behavior.
- **Fix:** Rewrote test to verify observable effects: config.voice_mode updated, save_config called with new mode, start_mode called with new mode.
- **Files modified:** apps/desktop-py/tests/test_voice_modes.py
- **Verification:** test_switch_mode_hot_swap now passes
- **Committed in:** 9e3d202 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in test vs implementation alignment)
**Impact on plan:** No scope creep. Test fix ensures correct behavior is validated.

## Issues Encountered

None — implementation proceeded cleanly after test-implementation alignment fix.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `voice_modes.py` is ready for Plan 03 to wire `chat_loop()` to consume from `get_text_queue()`
- `switch_mode()` API ready for Phase 77 config menu integration (D-07)
- All PYMODE-01/02/03 requirements implemented and tested with mocks
- Remaining xfail: `test_chat_loop_consumes_voice_queue` — requires Plan 03 chat_loop refactor

## Self-Check

- [x] `apps/desktop-py/src/jarvis_desktop/voice_modes.py` — FOUND
- [x] `apps/desktop-py/tests/test_voice_modes.py` — FOUND
- [x] Commit 3d27d34 — FOUND
- [x] Commit 9e3d202 — FOUND

## Self-Check: PASSED

---
*Phase: 76-voice-modes*
*Completed: 2026-05-18*
