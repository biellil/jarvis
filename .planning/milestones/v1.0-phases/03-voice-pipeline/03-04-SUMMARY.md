---
phase: 03-voice-pipeline
plan: "04"
subsystem: voice-tts
tags: [tts, kokoro, voice, gap-closure, CONV-03, CONV-04]
dependency_graph:
  requires: ["03-02"]
  provides: ["KokoroTTS", "tts-settings", "voice-tts-wiring"]
  affects: ["src/jarvis/core/tts.py", "src/jarvis/__main__.py", "src/jarvis/config.py"]
tech_stack:
  added: ["kokoro>=0.9.4", "soundfile"]
  patterns: ["lazy-model-loading", "sentence-streaming-tts", "asyncio-to-thread", "tts-config-toggle"]
key_files:
  created:
    - src/jarvis/core/tts.py
    - tests/test_tts.py
  modified:
    - pyproject.toml
    - src/jarvis/config.py
    - src/jarvis/__main__.py
    - tests/test_voice.py
decisions:
  - "KokoroTTS lazy loads 350MB model only on first speak() call — fast startup"
  - "Sentence-level streaming via regex split on .!? — SC2 compliance"
  - "asyncio.to_thread() for both synthesis and playback — event loop never blocked (ARCH-02)"
  - "TTS wired to both /voice path and regular text-input path in voice mode"
  - "test_conv03_tts_not_implemented removed — TTS now exists; class renamed TestConv05WakeWordDeferred"
metrics:
  duration_minutes: 5
  completed_date: "2026-04-04"
  tasks_completed: 2
  files_changed: 6
---

# Phase 03 Plan 04: KokoroTTS Neural Text-to-Speech Summary

**One-liner:** Neural TTS via kokoro with sentence-level streaming and asyncio.to_thread playback, closing Gap 2 (CONV-03/SC2).

## What Was Built

Added offline neural text-to-speech to JARVIS voice mode using kokoro 0.9.4.

**src/jarvis/core/tts.py** — KokoroTTS class (100 lines):
- Lazy pipeline loading: 350MB kokoro model loads only on first `speak()` call
- `_split_sentences()`: regex split on `.!?` boundaries for streaming effect (SC2)
- `_synthesize_sync()`: kokoro KPipeline call returning concatenated numpy audio
- `_play_audio_sync()`: sounddevice playback, blocks in thread until complete
- `speak()`: async method, runs synth+play in `asyncio.to_thread()` per sentence (ARCH-02)
- `speak_sentence()`: single-sentence variant for incremental streaming callers

**src/jarvis/config.py** — Three new TTS settings:
- `tts_enabled: bool = True` — TTS_ENABLED env var disables TTS for text-only mode
- `tts_voice: str = "af_heart"` — kokoro voice ID, configurable via TTS_VOICE
- `tts_lang: str = "a"` — American English as default; configurable via TTS_LANG

**src/jarvis/__main__.py** — TTS wired into voice mode:
- KokoroTTS instantiated after transcriber init, only when voice_mode=True and tts_enabled=True
- `[falando]...` state message printed before TTS playback (CONV-04)
- Both /voice file path and text-input path capture response and call `tts.speak(response)`

**pyproject.toml** — Added `kokoro>=0.9.4` and `soundfile` to dependencies.

**tests/test_tts.py** — 18 tests covering:
- Init defaults and custom config
- Sentence splitting (6 cases including empty, no-punctuation, Portuguese)
- Synchronous synthesis (pipeline calls, empty output, concatenation, exception handling)
- Async speak() (to_thread calls, empty text, synthesis None skip, multi-sentence, speak_sentence)

**tests/test_voice.py** — Updated:
- Removed `test_conv03_tts_not_implemented` (TTS now implemented)
- Renamed `TestConv03Conv05Deferred` → `TestConv05WakeWordDeferred`

## Gaps Closed

- **Gap 2 / CONV-03 / SC2**: JARVIS responds by voice using kokoro TTS, streaming sentence by sentence — CLOSED
- **CONV-04**: `[falando]` state message displayed before TTS playback — CLOSED

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

```
PYTHONPATH=src pytest tests/test_tts.py -x -v     → 18 passed
PYTHONPATH=src pytest tests/test_voice.py -x -v   → 21 passed
PYTHONPATH=src pytest tests/ -x                   → 132 passed (full suite, no regressions)
PYTHONPATH=src python -c "from jarvis.core.tts import KokoroTTS; print('OK')"  → OK
PYTHONPATH=src python -c "from jarvis.config import settings; assert settings.tts_enabled == True"  → OK
pip show kokoro  → 0.9.4 installed
```

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | d9938ac | ✨ feat(03-04): add KokoroTTS module and TTS settings |
| Task 2 | 8b0cf0a | ✨ feat(03-04): wire KokoroTTS into voice mode, add TTS tests |

## Known Stubs

None — TTS is fully implemented and wired. The kokoro model downloads on first `speak()` call (~350MB); this is expected behavior documented in the lazy-load log message.

## Self-Check: PASSED
