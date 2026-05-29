---
phase: 88-emotion-tags-config-ux
plan: "02"
subsystem: config-ux
tags: [chatterbox, tts, config-menu, chat-py, cfgui]
dependency_graph:
  requires:
    - phase: 88-01
      provides: "chatterbox_audio_prompt_path, chatterbox_exaggeration, chatterbox_cfg_weight fields in JarvisConfig"
  provides:
    - "_menu_tts_provider() with 5 providers including chatterbox + inline audio prompt (CFGUI-01, CFGUI-02)"
    - "_show_config_menu() with conditional item 8 'Audio referência' when provider==chatterbox (D-12)"
    - "_menu_chatterbox_audio_ref() sub-menu for dedicated audio reference path editing"
  affects: [chat.py config menu UX, all future TTS provider selection flows]
tech-stack:
  added: []
  patterns:
    - "Conditional menu items checked every while-loop iteration (not cached) — prevents stale state"
    - "Dynamic range prompt f'(1-{len(providers)})' — avoids hardcoded provider count"
    - "markup=False on all console.print with user-controlled path data — prevents Rich markup injection"
key-files:
  created: []
  modified:
    - apps/desktop-py/src/jarvis_desktop/chat.py
    - apps/desktop-py/tests/test_config.py
key-decisions:
  - "Item 8 condition re-evaluated each while loop iteration — config.tts_provider checked live, not cached"
  - "Inline prompt for chatterbox_audio_prompt_path placed inside _menu_tts_provider after set_provider succeeds — single interaction flow"
  - "Empty input (Enter) on path prompt silently preserves existing value (D-11) — no UI feedback needed"
patterns-established:
  - "Conditional menu items: check config field per iteration, not boolean cached before loop"
  - "Dynamic input range: always use f-string with len(list) rather than hardcoded number"
requirements-completed: [CFGUI-01, CFGUI-02]
duration: ~8min
completed: "2026-05-29"
---

# Phase 88 Plan 02: Config UX — Chatterbox Provider Menu Summary

**Chatterbox added to `/config` TTS menu with 5 providers, inline audio reference path prompt, and conditional item 8 gated on provider selection.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-29T16:41:39Z
- **Completed:** 2026-05-29T16:49:15Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- `_menu_tts_provider()` now lists 5 providers: `["kokoro", "chatterbox", "elevenlabs", "murf", "none"]` (CFGUI-01)
- Selecting chatterbox triggers inline prompt for `chatterbox_audio_prompt_path` — Enter without input preserves existing value (CFGUI-02, D-11)
- `_show_config_menu()` shows `"8. Audio referência   [/path]"` conditionally when `tts_provider == "chatterbox"` (D-12)
- New `_menu_chatterbox_audio_ref()` function handles dedicated audio reference path editing from item 8
- 5 new tests GREEN (CFGUI-01/CFGUI-02 test_config.py), 0 regressions — 71 total passing

## Task Commits

1. **Task 1: Adicionar testes CFGUI-01 e CFGUI-02 a test_config.py** - `9f77a61` (test — RED phase)
2. **Task 2: Atualizar _menu_tts_provider e _show_config_menu em chat.py** - `40b14ec` (feat — GREEN)
3. **Task 3: Rodar suite completa e confirmar todos os testes verdes** — no separate commit needed (clean tree)

## Files Created/Modified

- `apps/desktop-py/src/jarvis_desktop/chat.py` — `_menu_tts_provider` updated (providers list, dynamic prompt, inline chatterbox path prompt); `_show_config_menu` updated (conditional item 8, choice "8" handler); `_menu_chatterbox_audio_ref` added (~line 888)
- `apps/desktop-py/tests/test_config.py` — 5 new tests for CFGUI-01, CFGUI-02, D-11, D-12 (lines 290–410)

## Decisions Made

- Item 8 condition checked each loop iteration via `config.tts_provider == "chatterbox"` — not cached in a variable before the loop. Prevents stale display if provider changes inside the loop.
- `markup=False` on all prints that show user-provided paths — prevents Rich treating `[/ref.wav]` as markup.
- Inline prompt placed inside `_menu_tts_provider` immediately after successful `set_provider()` — single interaction flow avoids requiring user to navigate to item 8 after switching provider.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed console.print mock lambda signature in tests**
- **Found during:** Task 1 (TDD RED phase)
- **Issue:** Test lambdas `lambda text, **kw:` failed — `console.print()` is called with positional args as `*args`, not named `text`
- **Fix:** Changed to `lambda *args, **kw: printed_lines.append(str(args[0]) if args else "")`
- **Files modified:** `apps/desktop-py/tests/test_config.py`
- **Committed in:** `9f77a61` (Task 1 commit)

**2. [Rule 1 - Bug] Removed invalid `patch("jarvis_desktop.chat.tts", mock_tts)` in test**
- **Found during:** Task 2 (GREEN run)
- **Issue:** `chat.py` uses local imports (`from jarvis_desktop import tts` inside function body) — `chat.tts` attribute doesn't exist at module level, patch raised `AttributeError`
- **Fix:** Removed the `patch("jarvis_desktop.chat.tts", mock_tts)` line; patching `jarvis_desktop.tts.set_provider` directly is sufficient
- **Files modified:** `apps/desktop-py/tests/test_config.py`
- **Committed in:** `40b14ec` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — test bugs)
**Impact on plan:** Both fixes in test code only. Implementation matched plan exactly.

## Issues Encountered

- A `git checkout 06fe712 -- apps/desktop-py/tests/` call during baseline verification caused the test file to revert to an older state; file was restored immediately. No functional impact.

## Known Stubs

None. Chatterbox provider is fully selectable in the menu; `chatterbox_audio_prompt_path` is wired to `config.chatterbox_audio_prompt_path` which feeds `_chatterbox_speak()` (Phase 87).

## Next Phase Readiness

- CFGUI-01 and CFGUI-02 both satisfied — chatterbox fully configurable via `/config`
- Phase 88 complete: emotion tags (Plan 01) + config UX (Plan 02) both shipped
- No blockers for next milestone planning

## Self-Check: PASSED

Files exist:
- `apps/desktop-py/src/jarvis_desktop/chat.py` — chatterbox in providers list confirmed
- `apps/desktop-py/tests/test_config.py` — 5 new CFGUI tests confirmed

Commits exist:
- `9f77a61` — test RED phase
- `40b14ec` — feat GREEN phase

---
*Phase: 88-emotion-tags-config-ux*
*Completed: 2026-05-29*
