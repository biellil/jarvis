---
phase: 03-voice-pipeline
plan: "05"
subsystem: voice-pipeline
tags: [wake-word, openwakeword, voice, CONV-05, ARCH-02]
dependency_graph:
  requires: ["03-03", "03-04"]
  provides: ["wake-word-detection", "hey-jarvis-activation"]
  affects: ["__main__.py", "config", "core/wake_word"]
tech_stack:
  added: ["openwakeword==0.6.0"]
  patterns: ["asyncio.run_coroutine_threadsafe thread-to-async bridge", "lazy model loading", "sounddevice InputStream callback"]
key_files:
  created:
    - src/jarvis/core/wake_word.py
    - tests/test_wake_word.py
  modified:
    - pyproject.toml
    - src/jarvis/config.py
    - src/jarvis/__main__.py
    - tests/test_voice.py
decisions:
  - "openwakeword installed with --no-deps to avoid tflite-runtime requirement on Linux (onnxruntime already available)"
  - "wake_word_enabled defaults to False — opt-in because continuous background mic access is intrusive"
  - "3-second fixed recording window after wake word trigger (simpler than VAD endpoint for MVP)"
  - "asyncio.run_coroutine_threadsafe() bridges sounddevice audio thread to event loop"
metrics:
  duration: "4 minutes"
  completed_date: "2026-04-04"
  tasks_completed: 2
  files_changed: 5
requirements: [CONV-05, ARCH-02]
---

# Phase 03 Plan 05: Wake Word Detection Summary

**One-liner:** Hey JARVIS wake word detection via openwakeword + sounddevice background async listener with 3-second recording window after trigger.

## What Was Built

WakeWordListener module using openwakeword 0.6.0 for offline wake word detection. A sounddevice InputStream continuously feeds int16 audio chunks to openwakeword's predict() method in its callback thread. When the "hey_jarvis" model score exceeds the configured threshold (default 0.5), `asyncio.run_coroutine_threadsafe()` bridges the detection from the audio thread to the event loop to trigger recording and transcription.

The listener is wired as a background task in `__main__.py` when both `--voice` flag and `WAKE_WORD_ENABLED=true` are set. On detection, a 3-second recording window opens using MicCapture, the audio is transcribed via WhisperTranscriber, and the result is forwarded to session.send() — same pipeline as PTT and file-based voice commands.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add openwakeword dependency, wake word Settings, WakeWordListener | 0514e93 | pyproject.toml, config.py, core/wake_word.py |
| 2 | Wire wake word into CLI, add tests, remove negative test | 48c4076 | __main__.py, test_wake_word.py, test_voice.py |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] openwakeword tflite-runtime installation conflict**
- **Found during:** Task 1
- **Issue:** openwakeword 0.6.0 requires `tflite-runtime<3,>=2.8.0` on Linux, but no compatible version exists for Python 3.12. The package itself uses onnxruntime for inference when inference_framework="onnx" is specified.
- **Fix:** Installed openwakeword with `--no-deps` flag. onnxruntime was already available as a system dependency. This matches CLAUDE.md spec: "openwakeword requires onnxruntime (not tflite-runtime)".
- **Files modified:** N/A (install-time fix only)
- **Commit:** Task 1

**2. [Rule 1 - Bug] Test assertion for run_coroutine_threadsafe**
- **Found during:** Task 2 RED phase
- **Issue:** Test asserted `call_soon_threadsafe.assert_not_called()` but `asyncio.run_coroutine_threadsafe()` internally uses `call_soon_threadsafe`. Test intent was wrong.
- **Fix:** Replaced assertion with `mock_model.reset.assert_called_once()` — verifies detection occurred without asserting implementation internals.
- **Files modified:** tests/test_wake_word.py
- **Commit:** Inline fix before RED commit

## Verification Results

- `PYTHONPATH=src pytest tests/test_wake_word.py -x -v` — 9 tests passed
- `PYTHONPATH=src pytest tests/test_voice.py -x -v` — 26 tests passed (negative test removed)
- `PYTHONPATH=src pytest tests/ -x` — 158 tests passed (no regressions)
- `PYTHONPATH=src python -c "from jarvis.core.wake_word import WakeWordListener; print('OK')"` — OK
- `PYTHONPATH=src python -c "from jarvis.config import settings; assert settings.wake_word_enabled == False"` — OK
- `pip show openwakeword` — openwakeword 0.6.0 installed

## Known Stubs

None — wake word detection is fully wired. The listener starts when `voice_mode=True` and `WAKE_WORD_ENABLED=true`, records 3 seconds after detection, transcribes, and responds.

## Self-Check: PASSED
