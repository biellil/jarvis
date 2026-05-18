---
phase: 74-speech-to-text-stt
plan: 02
subsystem: voice
tags: [faster-whisper, sounddevice, pynput, stt, tdd, chat, ptt]

# Dependency graph
requires:
  - phase: 74-01
    provides: STT deps in pyproject.toml, JarvisConfig ptt_key/silence_threshold_ms, Wave 0 xfail stubs, STT test fixtures
provides:
  - stt.py singleton module (init_stt, record_until_silence, transcribe, _parse_ptt_hotkey)
  - chat.py chat_loop with PTT pynput GlobalHotKeys integration
  - __main__.py wired with init_stt before chat_loop
  - All 5 stt tests passing (xfail markers removed)
affects: [75-tts, 76-voice-modes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Singleton with threading.Lock guard for Whisper model (D-07/D-08)"
    - "threading.Event ptt_triggered for non-blocking PTT in main loop"
    - "pynput GlobalHotKeys listener with finally cleanup (Pitfall 3)"
    - "Test isolation via unittest.mock.patch.object on module namespace (not sys.modules)"

key-files:
  created:
    - apps/desktop-py/src/jarvis_desktop/stt.py
  modified:
    - apps/desktop-py/tests/test_stt.py
    - apps/desktop-py/src/jarvis_desktop/chat.py
    - apps/desktop-py/src/jarvis_desktop/__main__.py

key-decisions:
  - "patch.object(stt_module, 'WhisperModel') preferred over sys.modules patching — faster_whisper already imported at module load time"
  - "threading.Event ptt_triggered used for PTT detection in main loop — avoids blocking input() while listening for hotkey"
  - "listener.stop() in finally block guarantees cleanup on Ctrl+C or any exit path"

requirements-completed: [PYSTT-01, PYSTT-02, PYSTT-03]

# Metrics
duration: ~23min
completed: 2026-05-18
---

# Phase 74 Plan 02: STT Implementation — stt.py, PTT Integration, All Tests Green Summary

**stt.py singleton with faster-whisper + pynput PTT integrated into chat_loop; all 5 STT tests pass.**

## Performance

- **Duration:** ~23 min
- **Started:** 2026-05-18T18:31:58Z
- **Completed:** 2026-05-18T18:54:27Z
- **Tasks:** 2 completed
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- Created `stt.py` with `init_stt`, `record_until_silence`, `transcribe`, `_parse_ptt_hotkey`
- Whisper model loads once at startup with threading.Lock guard (D-07/D-08 singleton)
- sounddevice (NumPy native) for audio capture per CLAUDE.md constraints (not PyAudio)
- faster-whisper (not openai/whisper) per CLAUDE.md stack requirements
- Removed xfail markers from test_stt.py — all 5 tests pass normally
- Integrated pynput GlobalHotKeys PTT listener into chat_loop with listener.stop() in finally
- Status feedback strings: "[STT] ouvindo...", "[STT] transcrevendo...", "> [transcrito: <text>]"
- Transcribed text flows through `_stream_response` — same path as typed text
- Wired `init_stt(config.whisper_model)` in `__main__.py` between health check and chat_loop
- All existing chat.py functions preserved unchanged (parse_sse_line, _stream_response, etc.)
- Full test suite: 14 passed + 4 xpassed — exit 0

## Task Commits

1. **Task 1: Implement stt.py + remove xfail markers** - `457cd26` (feat)
2. **Task 2: Integrate PTT into chat_loop + wire init_stt in __main__.py** - `84bcc05` (feat)

## Files Created/Modified

- `apps/desktop-py/src/jarvis_desktop/stt.py` — NEW: STT singleton module
- `apps/desktop-py/tests/test_stt.py` — xfail markers removed, test isolation fixed
- `apps/desktop-py/src/jarvis_desktop/chat.py` — PTT-aware chat_loop with GlobalHotKeys
- `apps/desktop-py/src/jarvis_desktop/__main__.py` — init_stt wired before chat_loop

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test isolation broken by module-level singleton state**
- **Found during:** Task 1 (test execution)
- **Issue:** `test_init_whisper_model_with_invalid_size` used `importlib.reload` to re-import stt module with a raising mock, but this dirtied the module state for subsequent tests — the reloaded module had no `WhisperModel` bound correctly
- **Fix:** Used `unittest.mock.patch.object(stt_module, "WhisperModel", side_effect=...)` to patch the already-imported name in the module namespace directly; added explicit `stt_module._model = None` resets in each test for isolation
- **Files modified:** `apps/desktop-py/tests/test_stt.py`
- **Commit:** `457cd26`

## Known Stubs

None — all data paths are wired. STT records real audio (via sounddevice), transcribes with real faster-whisper model, and sends to gateway via existing _stream_response.

## Self-Check: PASSED

- [x] `apps/desktop-py/src/jarvis_desktop/stt.py` exists with all 4 public functions
- [x] `apps/desktop-py/tests/test_stt.py` contains no xfail markers
- [x] `apps/desktop-py/src/jarvis_desktop/chat.py` contains GlobalHotKeys and listener.stop()
- [x] `apps/desktop-py/src/jarvis_desktop/__main__.py` contains init_stt call before chat_loop
- [x] Commits 457cd26 and 84bcc05 verified in git log
- [x] pytest tests/ exits 0 with 14 passed + 4 xpassed
