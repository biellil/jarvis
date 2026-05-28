---
phase: 85-clonagem-de-voz-kokoro
plan: 01
subsystem: voice
tags: [voice-cloning, kokoclone, speaker-embedding, tts, torch, librosa]

# Dependency graph
requires:
  - phase: 75-text-to-speech-tts
    provides: tts.py with KPipeline and JarvisConfig TTS fields pattern
  - phase: 72-python-infrastructure-setup
    provides: JarvisConfig BaseModel pattern and uv/pyproject.toml structure

provides:
  - voice_cloning.py module with 4 public functions (validate_reference_audio, extract_speaker_embedding, save_cloned_voice, load_cloned_voice)
  - cloned_voice_path field in JarvisConfig (default "")
  - 7 Wave 0 xfail test stubs in test_voice_cloning.py
  - mock_reference_audio and mock_kokoclone_encoder fixtures in conftest.py

affects: [85-02, 85-03, tts.py, config.py]

# Tech tracking
tech-stack:
  added: [kokoclone (lazy dep), librosa (lazy dep), torch (already present via kokoro)]
  patterns:
    - Lazy import of heavy deps inside functions to avoid startup cost
    - TYPE_CHECKING guard for JarvisConfig import to avoid circular imports
    - VOICES_DIR = Path.home() / ".jarvis" / "voices" for voice profile storage

key-files:
  created:
    - apps/desktop-py/src/jarvis_desktop/voice_cloning.py
    - apps/desktop-py/tests/test_voice_cloning.py
  modified:
    - apps/desktop-py/src/jarvis_desktop/config.py (added cloned_voice_path field)
    - apps/desktop-py/tests/conftest.py (appended 2 Phase 85 fixtures)

key-decisions:
  - "cloned_voice_path added in Plan 01 (not Plan 02 as originally noted in interfaces) because voice_cloning.py uses it directly via load_cloned_voice(config)"
  - "VOICES_DIR uses Path.home() at module level — tests must redirect HOME/USERPROFILE to avoid writing to real ~/.jarvis"
  - "torch.load() uses weights_only=False for ECAPA-TDNN embeddings (custom pickle ops per RESEARCH Pitfall 5)"
  - "mock_kokoclone_encoder patches sys.modules directly rather than monkeypatching attribute — kokoclone not installed in test env"

patterns-established:
  - "Phase 85 test fixtures: mock_reference_audio generates 1s 16kHz WAV via soundfile; mock_kokoclone_encoder patches sys.modules with ModuleType stubs"

requirements-completed: [VOICECLONE-01]

# Metrics
duration: 6min
completed: 2026-05-28
---

# Phase 85 Plan 01: Voice Cloning Module Scaffold

**Speaker embedding API established: voice_cloning.py with ECAPA-TDNN extract/save/load functions and 7 Wave 0 xfail stubs ready for Plan 02 implementation.**

## What Was Built

- `voice_cloning.py`: 4 public functions forming the voice cloning API:
  - `validate_reference_audio()` — checks duration >= 3s minimum via librosa
  - `extract_speaker_embedding()` — KokoClone ECAPA-TDNN encoder, 512-dim float32 tensor, 16kHz resample
  - `save_cloned_voice()` — persists tensor to `~/.jarvis/voices/*.pt` via torch.save
  - `load_cloned_voice()` — silent fallback (returns None) if path empty/missing/load error (D-04)

- `config.py`: Added `cloned_voice_path: str = Field(default="")` field

- `test_voice_cloning.py`: 7 xfail stubs covering full test map from RESEARCH.md

- `conftest.py`: 2 new fixtures — `mock_reference_audio` (dummy WAV) and `mock_kokoclone_encoder` (sys.modules patch)

## Verification Results

```
7 xfailed in test_voice_cloning.py — Wave 0 stubs confirmed
25 passed, 14 xpassed — existing suite unaffected
7 pre-existing failures confirmed as environment issues (not caused by this plan)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added cloned_voice_path to JarvisConfig in Plan 01**
- **Found during:** Task 1 implementation
- **Issue:** Plan interfaces noted cloned_voice_path as "Added in Plan 02", but load_cloned_voice(config) in voice_cloning.py uses config.cloned_voice_path directly. Plan 01 module would fail at runtime without it.
- **Fix:** Added cloned_voice_path field to JarvisConfig in config.py in Plan 01 commit
- **Files modified:** apps/desktop-py/src/jarvis_desktop/config.py
- **Commit:** 9a5d518

## Known Stubs

All stubs are intentional Wave 0 xfail markers — not data stubs. The 7 tests in test_voice_cloning.py are marked `xfail(strict=False)` and will be implemented in Plans 02 and 03.

## Self-Check: PASSED
