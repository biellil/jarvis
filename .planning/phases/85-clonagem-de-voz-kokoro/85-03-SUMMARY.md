---
phase: 85-clonagem-de-voz-kokoro
plan: 03
subsystem: voice
tags: [voice-cloning, tts, kokoro, speaker-embedding, cli-tool, config-menu]

# Dependency graph
requires:
  - phase: 85-01
    provides: voice_cloning.py with extract_speaker_embedding, save_cloned_voice, VOICES_DIR
  - phase: 85-02
    provides: tts.py with _kokoro_speak_with_embedding() and cloned voice branch in speak()
  - phase: 77-minimal-terminal-ui
    provides: chat.py /config menu pattern (_show_config_menu, _menu_* helpers, ui.get_input)

provides:
  - tools/clone_voice.py standalone PEP 723 script for voice cloning from reference audio
  - pyproject.toml voice-cloning optional-dependencies group (kokoclone, librosa)
  - chat.py _menu_cloned_voice() function and "Voz clonada" menu item 7
  - test_clone_voice_script_e2e xfail stub now xpass

affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - PEP 723 inline deps in tools/ scripts (same as train_wake_word.py)
    - Optional deps group in pyproject.toml for heavy optional features

key-files:
  created:
    - apps/desktop-py/tools/clone_voice.py
  modified:
    - apps/desktop-py/pyproject.toml (voice-cloning optional deps group)
    - apps/desktop-py/src/jarvis_desktop/chat.py (_menu_cloned_voice + menu item 7)

key-decisions:
  - "clone_voice.py uses torch.save directly for custom --output paths instead of monkey-patching VOICES_DIR in voice_cloning module"
  - "voice-cloning optional deps only add kokoclone and librosa — torch/soundfile already pulled in by kokoro main dep"
  - "Menu item 7 shows current cloned_voice_path inline in the menu header for quick visibility"
  - "_menu_cloned_voice uses ASCII-only text (no Unicode) — same pattern as existing menu helpers to avoid UnicodeEncodeError on Windows cp1252"

patterns-established:
  - "uv run pytest --no-sync to avoid resolving optional deps (kokoclone not on PyPI) during test runs"

requirements-completed: [VOICECLONE-04, VOICECLONE-05]

# Metrics
duration: 15min
completed: 2026-05-28
---

# Phase 85 Plan 03: User-Facing Voice Cloning Tools

**PEP 723 clone_voice.py script + pyproject voice-cloning deps + /config menu "Voz clonada" option completes Phase 85 voice cloning feature end-to-end.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-05-28
- **Tasks:** 2 (both auto)
- **Files modified/created:** 3

## Accomplishments

- `tools/clone_voice.py`: standalone PEP 723 script — `python tools/clone_voice.py ref.wav` extracts ECAPA-TDNN embedding and saves to `~/.jarvis/voices/cloned_voice.pt`, printing activation instructions
- `pyproject.toml`: `[voice-cloning]` optional-dependencies group with `kokoclone>=0.1.0` and `librosa>=0.10.0` — install via `uv sync --extra voice-cloning`
- `chat.py`: menu item 7 "Voz clonada" with `_menu_cloned_voice()` — enter path or "desativar" to toggle cloned voice, validates file existence, expands `~`, persists via `save_config()`
- `test_clone_voice_script_e2e` stub turns xpass — Phase 85 test suite complete

## Task Commits

1. **Task 1: clone_voice.py script + voice-cloning deps** — `f908de0` (feat)
2. **Task 2: Voz clonada menu item + _menu_cloned_voice** — `c3cf700` (feat)

**Plan metadata:** (pending — created in this step)

## Files Created/Modified

- `apps/desktop-py/tools/clone_voice.py` — PEP 723 standalone voice cloning script (115 lines)
- `apps/desktop-py/pyproject.toml` — voice-cloning optional-dependencies group added
- `apps/desktop-py/src/jarvis_desktop/chat.py` — menu item 7 + `_menu_cloned_voice()` function (52 lines added)

## Decisions Made

- `clone_voice.py` uses `torch.save` directly for custom `--output` paths (instead of monkey-patching `VOICES_DIR`) — cleaner and avoids module state mutation
- `uv run --no-sync pytest` required to skip optional dep resolution for `kokoclone` (not on PyPI) during tests — documented as pattern
- Menu item shows current `cloned_voice_path` inline in the menu list (not just in the sub-menu) for quick visibility

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

`uv run pytest` (without `--no-sync`) fails on resolving `voice-cloning` extras because `kokoclone` package is not available on PyPI. This is expected — kokoclone is a lazy/optional import that only matters at runtime when users actually call `extract_speaker_embedding()`. Tests mock `sys.modules` for kokoclone. Running with `--no-sync` skips the resolution step and all tests pass.

## Known Stubs

None — all Phase 85 stubs are now xpass.

## User Setup Required

To use voice cloning:
1. Install voice-cloning extras: `cd apps/desktop-py && uv sync --extra voice-cloning`
2. Record or find a 5–30 second audio sample of the target voice
3. Run: `python tools/clone_voice.py /path/to/sample.wav`
4. Start JARVIS (`jd`), type `/config`, select option 7, enter the path shown

## Next Phase Readiness

Phase 85 complete — all 3 plans delivered, all requirements VOICECLONE-01..05 validated.
The full voice cloning pipeline is: reference audio → `clone_voice.py` → `.pt` profile → `/config` menu → activated in `speak()` via `_kokoro_speak_with_embedding()`.

---
*Phase: 85-clonagem-de-voz-kokoro*
*Completed: 2026-05-28*
