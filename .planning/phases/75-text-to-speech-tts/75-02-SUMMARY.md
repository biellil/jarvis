---
phase: 75-text-to-speech-tts
plan: "02"
subsystem: tts
tags: [tts, kokoro, sounddevice, singleton, thread-safe]
dependency_graph:
  requires: [75-01]
  provides: [tts.py singleton, Kokoro offline TTS, stop_tts thread-safe]
  affects: [75-03, 76]
tech_stack:
  added: []
  patterns: [singleton-module, double-checked-locking, lazy-import, xfail-to-passing]
key_files:
  created:
    - apps/desktop-py/src/jarvis_desktop/tts.py
  modified:
    - apps/desktop-py/tests/test_tts.py
decisions:
  - "espeak-ng missing caught via RuntimeError string match (D-04) — avoids crashing on Windows without espeak install"
  - "_create_kokoro_engine separated from init_tts for monkeypatching in tests"
  - "stop_tts uses threading.Event + sd.stop() for thread-safe interrupt (D-11)"
  - "Cloud stubs (_elevenlabs_speak, _murf_speak) return False — full impl deferred to Plan 03"
metrics:
  duration: "107s"
  completed_date: "2026-05-18"
  tasks_completed: 2
  files_changed: 2
---

# Phase 75 Plan 02: TTS Singleton Implementation Summary

**One-liner:** Kokoro offline TTS singleton with thread-safe stop_tts and graceful espeak-ng missing handling via threading.Event + sd.stop().

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Implement tts.py singleton (Kokoro + stop_tts) | baa5e56 | apps/desktop-py/src/jarvis_desktop/tts.py (created, 215 lines) |
| 2 | Make Kokoro xfail stubs pass in test_tts.py | 831ee76 | apps/desktop-py/tests/test_tts.py (updated) |

## What Was Built

### tts.py (215 lines)

Full TTS singleton module mirroring the stt.py singleton pattern:

- `init_tts(config)` — loads Kokoro engine with `_lock` guard; repeated calls no-op; D-04 espeak-ng handling
- `speak(text, config)` — provider routing (elevenlabs → murf → kokoro offline), local_only bypass
- `stop_tts()` — thread-safe via `threading.Event + sd.stop()`
- `_create_kokoro_engine(config)` — lazy-import kokoro; exposed for test monkeypatching
- `_kokoro_speak(text, config)` — lazy-init engine, clears stop_event, prints "[TTS] falando...", calls `sd.play + sd.wait`
- `_elevenlabs_speak(text, api_key)` — returns False (stub, Plan 03)
- `_murf_speak(text, api_key)` — returns False (stub, Plan 03)

### test_tts.py Updates

Removed `@pytest.mark.xfail` from 4 tests (now passing):
- `test_init_tts` — asserts `_engine is not None` after init
- `test_kokoro_speak` — asserts `mock_sounddevice_play.play.assert_called_once()`
- `test_stop_tts` — calls `stop_tts()` without error
- `test_espeak_ng_missing_handling` — patches `_create_kokoro_engine` with RuntimeError("espeak-ng not found"), asserts warning printed and `_engine is None`

Kept `xfail(strict=False)` on: `test_elevenlabs_fallback`, `test_murf_fallback`, `test_local_only_mode` (Plan 03)

## Test Results

```
4 passed, 2 xfailed, 1 xpassed
```

Note: `test_local_only_mode` is xpassed (not xfailed) because the current implementation already handles `local_only=True` correctly in `speak()`. `strict=False` means this is not a failure — the behavior is correct, Plan 03 just adds more coverage.

Full suite: `19 passed, 2 xfailed, 5 xpassed` — exit 0.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

- `_elevenlabs_speak(text, api_key)` → always returns `False` (Plan 03 wires elevenlabs SDK)
- `_murf_speak(text, api_key)` → always returns `False` (Plan 03 wires murf SDK)

These stubs are intentional per plan design — they allow the provider routing logic to be tested while deferring cloud API integration to Plan 03.

## Self-Check: PASSED

- `apps/desktop-py/src/jarvis_desktop/tts.py` exists: FOUND
- Commit baa5e56: FOUND
- Commit 831ee76: FOUND
- `pytest tests/test_tts.py` exits 0: CONFIRMED (4 passed, 2 xfailed, 1 xpassed)
- `pytest tests/ -x` exits 0: CONFIRMED (19 passed, 2 xfailed, 5 xpassed)
