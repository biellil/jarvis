---
phase: 03-voice-pipeline
plan: "03"
subsystem: voice-pipeline
tags: [mic-capture, push-to-talk, sounddevice, CONV-02, ARCH-02]
dependency_graph:
  requires: ["03-02"]
  provides: ["MicCapture", "push-to-talk-cli"]
  affects: ["src/jarvis/core/mic.py", "src/jarvis/__main__.py"]
tech_stack:
  added: ["sounddevice>=0.5.0", "numpy>=1.24"]
  patterns: ["sounddevice callback API for non-blocking audio capture", "asyncio.to_thread for blocking input() offload"]
key_files:
  created:
    - src/jarvis/core/mic.py
    - tests/test_mic.py
  modified:
    - pyproject.toml
    - src/jarvis/config.py
    - src/jarvis/__main__.py
    - tests/test_voice.py
decisions:
  - "sounddevice callback API used (not blocking read) — audio arrives in background thread per ARCH-02"
  - "Temp WAV file as bridge between MicCapture and WhisperTranscriber — avoids modifying tested transcribe() interface"
  - "asyncio.to_thread(input) offloads blocking Enter wait while mic callback keeps recording independently"
  - "int16 at 16kHz mono — optimal for faster-whisper (Whisper expects 16kHz)"
  - "Removed test_conv03_tts_not_implemented negative test (TTS coming in 03-04, no longer deferred)"
metrics:
  duration: "6 minutes"
  completed_date: "2026-04-04"
  tasks_completed: 2
  files_modified: 5
---

# Phase 03 Plan 03: Push-to-Talk Mic Capture — Summary

**One-liner:** Push-to-talk mic capture via sounddevice callback API with /ptt and /gravar CLI commands wired to WhisperTranscriber.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add sounddevice dependency, mic Settings, MicCapture module | 119903e | pyproject.toml, config.py, core/mic.py |
| 2 (RED) | Failing tests for MicCapture PTT and test_voice.py updates | 3eae9bb | tests/test_mic.py, tests/test_voice.py |
| 2 (GREEN) | Wire /ptt and /gravar commands into CLI voice mode | fa4e53b | src/jarvis/__main__.py |

## What Was Built

### MicCapture (src/jarvis/core/mic.py)

New module providing push-to-talk microphone capture using sounddevice callback API:

- `MicCapture.start_recording()` — opens `sd.InputStream` with callback; audio arrives in background thread, collected in `self._chunks`. Does NOT block the event loop (ARCH-02 compliant).
- `MicCapture.stop_recording()` — sets `_recording = False`, drains stream, concatenates numpy chunks into a temp WAV file at 16kHz/int16/mono. Returns path or None if no audio.
- `MicCapture.record_until_release(stop_event)` — async helper using `asyncio.Event`; event loop waits non-blocking while recording continues in background thread.
- `MicCapture.is_recording()` — boolean check for recording state.

### Settings Extensions (src/jarvis/config.py)

Three new fields added:
- `mic_sample_rate: int = Field(default=16000)` — 16kHz optimal for Whisper
- `mic_channels: int = Field(default=1)` — mono per Whisper requirement
- `ptt_key: str = Field(default="space")` — configurable PTT key (future use)

### CLI Wiring (src/jarvis/__main__.py)

Push-to-talk commands added to the conversation loop in voice mode:

- `/ptt` or `/gravar` triggers recording start
- State message: `[escutando]: gravando... pressione Enter para parar`
- `asyncio.to_thread(input)` offloads blocking Enter wait — mic callback runs independently
- `[voz]: processando audio do microfone...` shown before transcription
- `[transcricao]: "..."` shows result before JARVIS response
- Temp WAV cleaned up via `os.unlink()` in `finally` block
- Existing `/voice <path>` file-based command still works unchanged

### Tests

- `tests/test_mic.py`: 12 tests covering init, recording, callback behavior, async record_until_release
- `tests/test_voice.py`: Updated — removed `test_conv03_tts_not_implemented` (TTS built in 03-04), renamed class to `TestConv05WakeWordDeferred`, added `TestPushToTalkCommand` with 6 tests

## Verification Results

```
PYTHONPATH=src pytest tests/test_mic.py     — 12/12 PASSED
PYTHONPATH=src pytest tests/test_voice.py   — 27/27 PASSED
PYTHONPATH=src pytest tests/                — 132/132 PASSED (no regressions)
pip show sounddevice                         — Version: 0.5.5
```

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Notes

- The plan specified TDD for Task 2; followed RED/GREEN phases as required.
- libportaudio2 system package was required on Linux for sounddevice to import (documented in CLAUDE.md Cross-Platform Audio Notes). Already installed via another agent running concurrently.
- Removed `test_conv03_tts_not_implemented` as planned — TTS module will be created in 03-04.

## Known Stubs

None — all PTT functionality is fully wired. The `/ptt` command records real audio from the mic, saves to temp WAV, passes to WhisperTranscriber, and forwards transcript to ChatSession.

## Self-Check: PASSED

- src/jarvis/core/mic.py — FOUND
- tests/test_mic.py — FOUND
- 03-03-SUMMARY.md — FOUND
- Commit 119903e (Task 1) — FOUND
- Commit 3eae9bb (Task 2 RED) — FOUND
- Commit fa4e53b (Task 2 GREEN) — FOUND
