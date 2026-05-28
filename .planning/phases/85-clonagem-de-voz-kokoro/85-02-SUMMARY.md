---
phase: 85-clonagem-de-voz-kokoro
plan: 02
subsystem: voice
tags: [voice-cloning, tts, kokoro, speaker-embedding, torch]

# Dependency graph
requires:
  - phase: 85-01
    provides: voice_cloning.py with load_cloned_voice(), cloned_voice_path in JarvisConfig, 7 xfail stubs
  - phase: 75-text-to-speech-tts
    provides: tts.py with _kokoro_speak() pattern and KPipeline singleton

provides:
  - _kokoro_speak_with_embedding() function in tts.py (torch.Tensor voice parameter)
  - cloned voice branch in speak() — checks cloned_voice_path before all other providers
  - Full provider selection order: cloned → ElevenLabs → Murf → Kokoro

affects: [85-03, tts.py]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Lazy import of load_cloned_voice inside speak() to avoid circular dependency at module level
    - Exception swallowing in cloned voice load path — always falls back to kokoro_voice

key-files:
  created: []
  modified:
    - apps/desktop-py/src/jarvis_desktop/tts.py (speak() updated + _kokoro_speak_with_embedding() added)

key-decisions:
  - "Task 1 (cloned_voice_path field) was already complete from Plan 01 deviation — no changes needed to config.py"
  - "load_cloned_voice lazily imported inside speak() — not at module level — to avoid circular import between tts and voice_cloning"
  - "_kokoro_speak_with_embedding() mirrors _kokoro_speak() exactly but accepts Any embedding tensor instead of string voice name"

patterns-established:
  - "Exception guard in speak() around load_cloned_voice: try/except catches all exceptions, logs warning, falls back to None — speak() never crashes on cloned voice error"

requirements-completed: [VOICECLONE-02, VOICECLONE-03]

# Metrics
duration: 8min
completed: 2026-05-28
---

# Phase 85 Plan 02: Wire Voice Cloning into tts.speak()

**Cloned voice now takes priority in speak(): _kokoro_speak_with_embedding() synthesizes with torch.Tensor, 7 xfail stubs flip to xpass.**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-05-28
- **Tasks:** 2 (Task 1 already complete from Plan 01 deviation; Task 2 executed)
- **Files modified:** 1

## Accomplishments

- `speak()` now checks `cloned_voice_path` first (D-04, Phase 85) — cloned voice overrides all other providers
- `_kokoro_speak_with_embedding()` added after `_kokoro_speak()` — same structure but accepts `torch.Tensor` as `voice=` parameter to KPipeline
- All 7 voice cloning xfail stubs from Plan 01 now `xpass` — `test_kokoro_speak_with_cloned_embedding` and `test_config_cloned_voice_path_persistence` confirmed passing
- Exception handling in cloned voice load path ensures speak() never crashes — silently falls back to standard kokoro voice

## Task Commits

1. **Task 1: cloned_voice_path in JarvisConfig** — already committed in Plan 01 (`9a5d518`) as deviation Rule 2
2. **Task 2: _kokoro_speak_with_embedding + speak() update** — `b83032e` (feat)

**Plan metadata:** (pending — created in this step)

## Files Created/Modified

- `apps/desktop-py/src/jarvis_desktop/tts.py` — speak() updated with cloned voice branch; _kokoro_speak_with_embedding() added (86 net insertions)

## Verification Results

```
7 passed, 7 xpassed in test_tts.py + test_voice_cloning.py
All 7 voice cloning stubs: xpass (implementation works)
Pre-existing test failures in test_config.py, test_stt.py: unrelated to this plan (whisper_model_locked, agentic_step_progress fields missing)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Plan 01 Deviation Carry-over] Task 1 already complete**
- **Found during:** Task 1 verification
- **Issue:** Plan 01 added `cloned_voice_path` to JarvisConfig as a Rule 2 deviation (field was required by voice_cloning.py). Plan 02 listed Task 1 as adding this field.
- **Fix:** Verified field exists with correct default (""), ran verification command (returns "OK"), skipped re-implementation. Task 1 done criteria fully met.
- **Commit:** 9a5d518 (from Plan 01)

### Out-of-Scope Deferred Items

Pre-existing test failures in full suite (unrelated to Plan 02):
- `test_config.py`: 8 failures — `whisper_model_locked`, `agentic_step_progress` fields not in current JarvisConfig schema (from other phase tests)
- `test_stt.py`: 3 failures — same `whisper_model_locked` AttributeError
- `test_voice_modes.py`: 1 failure — `test_ptt_mode_hotkey` queue timing issue (pre-existing)
- `test_pc_control.py`: 17 collection errors — module import issues (pre-existing)

These are not caused by Plan 02 changes and were present before this plan executed.

## Known Stubs

None — all voice cloning stubs from Plan 01 are now xpass. No data stubs introduced.

## Self-Check: PASSED
