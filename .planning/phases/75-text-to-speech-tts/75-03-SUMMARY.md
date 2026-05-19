---
phase: 75-text-to-speech-tts
plan: 03
subsystem: tts
tags: [tts, elevenlabs, murf, kokoro, sounddevice, python, voice]

# Dependency graph
requires:
  - phase: 75-02
    provides: tts.py Kokoro singleton with _elevenlabs_speak/_murf_speak stubs
  - phase: 73-terminal-chat
    provides: chat.py _stream_response SSE loop
provides:
  - Complete tts.py with real ElevenLabs and Murf SDK implementations
  - chat.py accumulates full SSE response and calls speak() after stream completes (D-01)
  - __main__.py wires init_tts(config) before chat_loop() (D-02 sequence)
  - All 7 test_tts.py tests passing (0 xfailed)
  - test_stream_response_triggers_tts in test_chat.py passing
affects: [76-voice-modes, 77-minimal-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Module-level import of speak in chat.py (not lazy) — enables monkeypatching in tests
    - Cloud TTS functions return bool (True=success, False=any error) for clean fallback chain
    - PCM int16 NumPy decode pattern for ElevenLabs pcm_24000 output
    - soundfile.read(io.BytesIO(audio_data)) pattern for WAV URL/bytes Murf response

key-files:
  created: []
  modified:
    - apps/desktop-py/src/jarvis_desktop/tts.py
    - apps/desktop-py/src/jarvis_desktop/chat.py
    - apps/desktop-py/src/jarvis_desktop/__main__.py
    - apps/desktop-py/tests/test_tts.py
    - apps/desktop-py/tests/test_chat.py

key-decisions:
  - "Module-level import of speak in chat.py (not lazy) — required for monkeypatching in tests via jarvis_desktop.chat.speak"
  - "ElevenLabs uses pcm_24000 format matching Kokoro sample rate — no resampling needed"
  - "Murf response.audio_file may be URL string or bytes — both cases handled with soundfile decode"
  - "Cloud stubs return False on any exception — fallback to Kokoro is automatic (D-09)"

patterns-established:
  - "Cloud TTS bool return pattern: True=success, False=exception — speak() uses this for fallback chain"
  - "Full SSE accumulation: full_response list appended inside token loop; speak() called with join after stream"

requirements-completed: [PYTTS-02, PYTTS-03, PYTTS-04]

# Metrics
duration: 3min
completed: 2026-05-18
---

# Phase 75 Plan 03: TTS Cloud Providers + Chat Integration Summary

**ElevenLabs + Murf cloud TTS implemented with SDK calls, PCM/WAV audio decode, fallback to Kokoro; JARVIS now speaks every SSE response aloud**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-18T20:01:51Z
- **Completed:** 2026-05-18T20:04:30Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Implemented `_elevenlabs_speak()` with ElevenLabs SDK (Rachel voice, eleven_flash_v2_5, pcm_24000 → NumPy float32 → sounddevice)
- Implemented `_murf_speak()` with Murf SDK (en-US-natalie, WAV/24kHz, soundfile decode → sounddevice)
- Wired `speak(full_text, config)` into `chat.py._stream_response()` after SSE loop completes (D-01)
- Wired `init_tts(config)` into `__main__.py` between `init_stt()` and `chat_loop()` (D-02 sequence)
- All 7 `test_tts.py` tests pass (xfail removed from 3 cloud/local_only tests)
- `test_stream_response_triggers_tts` added to `test_chat.py` and passes
- Full pytest suite: 23 passed + 4 xpassed, 0 failed

## Task Commits

1. **Task 1: Implement _elevenlabs_speak and _murf_speak in tts.py** - `565eace` (feat)
2. **Task 2: Make all 7 TTS tests pass; wire TTS in chat.py and __main__.py** - `8d624a3` (feat)

## Files Created/Modified

- `apps/desktop-py/src/jarvis_desktop/tts.py` - _elevenlabs_speak and _murf_speak fully implemented (stubs replaced)
- `apps/desktop-py/src/jarvis_desktop/chat.py` - speak imported at module level; _stream_response accumulates full_response and calls speak() post-stream
- `apps/desktop-py/src/jarvis_desktop/__main__.py` - init_tts(config) wired as Step 4; chat_loop moved to Step 5
- `apps/desktop-py/tests/test_tts.py` - xfail removed from 3 tests; mock.return_value=False for fallback simulation
- `apps/desktop-py/tests/test_chat.py` - test_stream_response_triggers_tts added

## Decisions Made

- Module-level import of `speak` in `chat.py` (rather than lazy inside `_stream_response`) — required so `unittest.mock.patch("jarvis_desktop.chat.speak")` can intercept calls in tests
- ElevenLabs pcm_24000 output decoded as int16 → float32/32768.0 (matches Kokoro sample rate, no resampling)
- Murf `response.audio_file` may be URL string or raw bytes — both paths handled via soundfile.read(io.BytesIO)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] speak not patchable via jarvis_desktop.chat.speak with lazy import**
- **Found during:** Task 2 (test_stream_response_triggers_tts)
- **Issue:** Plan specified lazy `from jarvis_desktop.tts import speak` inside `_stream_response()`; test patches `jarvis_desktop.chat.speak` which requires the name to exist at module level in chat.py
- **Fix:** Moved `from jarvis_desktop.tts import speak` to module-level imports in chat.py; removed lazy import line from function body
- **Files modified:** apps/desktop-py/src/jarvis_desktop/chat.py
- **Verification:** test_stream_response_triggers_tts passes; all 23 tests green
- **Committed in:** 8d624a3 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Fix required for test patchability. No scope creep. speak() behavior unchanged at runtime.

## Issues Encountered

None beyond the lazy-import patching issue documented above.

## User Setup Required

None — no external service configuration required for tests. ElevenLabs and Murf API keys are optional runtime config (fallback to Kokoro when absent).

## Next Phase Readiness

- Phase 75 complete — full TTS pipeline delivered (Kokoro offline + ElevenLabs + Murf cloud fallback)
- `stop_tts()` thread-safe and exposed for Phase 76 PTT interrupt during playback (D-11)
- Phase 76 (Voice Modes) can build on tts.py singleton and stop_tts() without modifications

---
*Phase: 75-text-to-speech-tts*
*Completed: 2026-05-18*
