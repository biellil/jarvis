---
phase: 87-voice-cloning
plan: 02
subsystem: tts
tags: [chatterbox, voice-cloning, tts, soundfile, validation, config]

# Dependency graph
requires:
  - phase: 87-voice-cloning
    plan: 01
    provides: 8 RED tests for VCLONE-01/02/03 + voice cloning fixtures in conftest.py

provides:
  - chatterbox_audio_prompt_path field in JarvisConfig (VCLONE-01)
  - _validate_audio_prompt_path() helper in tts.py (VCLONE-03)
  - Startup validation in _warmup_worker() — invalid file falls back to Kokoro (VCLONE-03)
  - audio_prompt_path kwarg wired in _chatterbox_speak() generate() call (VCLONE-02)

affects: [87-voice-cloning, tts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - _validate_audio_prompt_path() returns (bool, str) — caller prints message and sets state
    - Empty path skips validation entirely (D-06 pattern)
    - _generate_kwargs dict pattern for conditional kwargs to generate()

key-files:
  created: []
  modified:
    - apps/desktop-py/src/jarvis_desktop/config.py
    - apps/desktop-py/src/jarvis_desktop/tts.py

key-decisions:
  - "Warmup generate('olá') intentionally NOT modified — warmup audio is discarded; passing audio_prompt_path during warmup would cause unnecessary extra read before device cascade succeeds"
  - "_validate_audio_prompt_path uses lazy soundfile import — already a transitive dep of kokoro, zero new dependency"
  - "_generate_kwargs dict pattern chosen over if/else for clean conditional kwarg passing to generate()"

# Metrics
duration: 8min
completed: 2026-05-29
---

# Phase 87 Plan 02: Voice Cloning Implementation Summary

**Turned all 8 RED tests GREEN by adding chatterbox_audio_prompt_path config field, startup reference file validation, and audio_prompt_path kwarg wiring into generate() for zero-shot voice cloning**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-29T13:45:49Z
- **Completed:** 2026-05-29T13:53:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `chatterbox_audio_prompt_path: str = Field(default="")` to JarvisConfig after `cloned_voice_path` — save_config()/load_config() round-trip works automatically via model_dump()
- Added `_validate_audio_prompt_path(path)` helper that checks: file exists, extension .wav/.mp3, duration >= 5.0s via soundfile.info()
- Wired validation into `_warmup_worker()` BEFORE device cascade — invalid/short/wrong-ext files set `_chatterbox_available=False` and return immediately
- Empty path skips validation entirely (D-06 — Chatterbox uses default voice without cloning)
- Wired `audio_prompt_path` kwarg in `_chatterbox_speak()` generate() call via `_generate_kwargs` dict pattern — kwarg present when path non-empty, absent when empty
- All 8 Phase 87 voice cloning tests GREEN, 31/31 total TTS tests passing, zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add chatterbox_audio_prompt_path field to JarvisConfig** - `892dcaf` (feat)
2. **Task 2: Add _validate_audio_prompt_path helper and wire into _warmup_worker + _chatterbox_speak** - `8444ce1` (feat)

## Files Created/Modified

- `apps/desktop-py/src/jarvis_desktop/config.py` — Added `chatterbox_audio_prompt_path: str = Field(default="")` after `cloned_voice_path` with Phase 87 comment and description covering VCLONE-01/02/03
- `apps/desktop-py/src/jarvis_desktop/tts.py` — Added `_validate_audio_prompt_path()` helper (36 lines), wired into `_warmup_worker()` before device cascade, replaced single `generate()` call with `_generate_kwargs` dict pattern in `_chatterbox_speak()`

## Decisions Made

- Warmup `generate("olá", language_id="pt")` call intentionally NOT modified — warmup audio is discarded anyway; passing audio_prompt_path during warmup would cause an unnecessary extra read of the reference file before the device cascade even succeeds (per RESEARCH Pitfall 1)
- `_validate_audio_prompt_path` uses lazy `soundfile` import — already a transitive dep of kokoro; zero new install required
- `_generate_kwargs` dict pattern chosen for clean conditional kwarg passing — avoids code duplication of the full generate() call in if/else branches

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all voice cloning paths are fully wired. `chatterbox_audio_prompt_path` field is live in JarvisConfig, validated at warmup, and passed to `generate()` on every `_chatterbox_speak()` call.

---
*Phase: 87-voice-cloning*
*Completed: 2026-05-29*
