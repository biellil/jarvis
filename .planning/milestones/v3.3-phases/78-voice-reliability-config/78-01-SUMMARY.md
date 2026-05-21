---
phase: 78-voice-reliability-config
plan: 01
subsystem: voice
tags: [python, openwakeword, always-listening, vad, pre-roll, ring-buffer, tdd]

requires:
  - phase: 76-voice-modes
    provides: "_always_listening_loop in voice_modes.py, openwakeword Model usage pattern"

provides:
  - "Fixed _always_listening_loop: wakeword_models=['hey_jarvis'] prevents ONNXRuntimeError (VAD-01)"
  - "Pre-roll deque(maxlen=7) captures ~560ms before speech onset so first word is not cut off (VAD-02)"
  - "D-03: preroll_buffer.clear() when TTS active prevents audio bleed"
  - "Tests: test_always_listening_no_onnx_crash, test_preroll_buffer"

affects:
  - 78-voice-reliability-config
  - any phase using always_listening voice mode

tech-stack:
  added: []
  patterns:
    - "deque(maxlen=N) pre-roll pattern for ring buffer before speech onset"
    - "Import jarvis_desktop.stt in main thread before daemon thread (avoids Python import lock deadlock)"

key-files:
  created: []
  modified:
    - apps/desktop-py/src/jarvis_desktop/voice_modes.py
    - apps/desktop-py/tests/test_voice_modes.py

key-decisions:
  - "wakeword_models=['hey_jarvis'] required even in always_listening mode — openwakeword loads ALL pre-trained models without at least one explicit model arg, causing ONNXRuntimeError on alexa_v0.1.onnx"
  - "deque(maxlen=7) chosen for pre-roll: 7 × 1280 samples ÷ 16000 Hz ≈ 560ms — enough for first phonemes"
  - "Removed startup _console().print() call from _always_listening_loop — rich.Live init from daemon thread hangs on Windows terminals"
  - "Tests must call monkeypatch.setattr('jarvis_desktop.stt.transcribe', ...) before starting daemon thread — this forces stt module import in main thread, avoiding Python import lock deadlock"

patterns-established:
  - "Pre-roll pattern: append every chunk to deque(maxlen=7) before speech detection; at speech onset, prepend list(preroll_buffer) to speech_buffer"
  - "Daemon thread import safety: any module imported inside daemon thread that wasn't already in sys.modules must be pre-imported in main thread via monkeypatch.setattr()"

requirements-completed:
  - VAD-01
  - VAD-02

duration: 35min
completed: 2026-05-20
---

# Phase 78 Plan 01: Voice Reliability Config Summary

**Fixed always_listening ONNXRuntimeError by passing wakeword_models=["hey_jarvis"] and added 7-chunk pre-roll deque for first-word capture**

## Performance

- **Duration:** 35 min
- **Started:** 2026-05-20T00:00:00Z
- **Completed:** 2026-05-20T00:35:00Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Fixed ONNXRuntimeError crash in always_listening mode: openwakeword requires at least one wakeword model; passing none loads all pre-trained models including alexa_v0.1.onnx which fails (VAD-01)
- Added deque(maxlen=7) pre-roll ring buffer capturing ~560ms before speech onset — first word no longer cut off when VAD fires late (VAD-02)
- D-03: preroll_buffer.clear() added alongside existing speech_buffer.clear() when TTS is speaking
- 2 new tests: test_always_listening_no_onnx_crash, test_preroll_buffer — all 11 voice_modes tests pass

## Task Commits

1. **Task 1: Fix _always_listening_loop — VAD-01 wakeword model + VAD-02 pre-roll** - `390409f` (feat)

## Files Created/Modified

- `apps/desktop-py/src/jarvis_desktop/voice_modes.py` - Fixed _always_listening_loop: wakeword_models arg + deque pre-roll
- `apps/desktop-py/tests/test_voice_modes.py` - Added test_always_listening_no_onnx_crash, test_preroll_buffer

## Decisions Made

- Removed `_console().print("Inicializando VAD...")` startup log from `_always_listening_loop` — `rich.Live.start()` called from a daemon thread on Windows terminals causes a hang; this line was cosmetic and not in acceptance criteria
- Tests require `monkeypatch.setattr("jarvis_desktop.stt.transcribe", ...)` before spawning the daemon thread. Python's global import lock means that if `jarvis_desktop.stt` hasn't been imported in the main thread yet, the daemon thread importing it can deadlock. The `setattr` call forces the main-thread import before the daemon starts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed startup console print causing daemon thread hang**
- **Found during:** Task 1 (GREEN phase — test wasn't passing after implementation)
- **Issue:** `_console().print(...)` at startup of `_always_listening_loop` called `rich.Live.start()` from daemon thread on Windows, causing the thread to hang indefinitely before reaching `Model(...)` init
- **Fix:** Removed the cosmetic startup print; the function proceeds directly to `try: Model(...)`
- **Files modified:** apps/desktop-py/src/jarvis_desktop/voice_modes.py
- **Verification:** Tests now pass; Model constructor is called with correct kwargs
- **Committed in:** 390409f (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added stt pre-import in test setup**
- **Found during:** Task 1 (TDD RED/GREEN debugging)
- **Issue:** Python import lock deadlock: daemon thread trying to first-import `jarvis_desktop.stt` while main thread holds import lock caused silent hang
- **Fix:** Added `monkeypatch.setattr("jarvis_desktop.stt.transcribe", ...)` in both new tests to force main-thread import of stt module before daemon spawns
- **Files modified:** apps/desktop-py/tests/test_voice_modes.py
- **Verification:** Both tests pass consistently
- **Committed in:** 390409f (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical test infrastructure)
**Impact on plan:** Both fixes necessary for tests to work correctly. No scope creep.

## Issues Encountered

- Python daemon thread + rich.Live.start() hangs on Windows — daemon threads cannot safely initialize rich.Live (which uses terminal size detection). Workaround: moved startup console output out of daemon-thread functions.
- Python global import lock deadlock pattern: first-time module imports inside daemon threads can deadlock if the main thread holds the import lock. Solution: pre-import modules in main thread via monkeypatch.setattr() calls in test setup.

## Next Phase Readiness

- VAD-01 and VAD-02 fixed and tested — always_listening mode is now reliable
- Pre-roll buffer established as pattern for future audio capture improvements
- Phase 78 Plan 02 can proceed (config persistence and voice reliability settings)

---
*Phase: 78-voice-reliability-config*
*Completed: 2026-05-20*
