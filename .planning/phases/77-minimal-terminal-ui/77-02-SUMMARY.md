---
phase: 77-minimal-terminal-ui
plan: "02"
subsystem: desktop-py
tags: [config-menu, chat, stt, tts, voice-modes, pyui-02]
dependency_graph:
  requires: [77-01]
  provides: [config-menu, reload_model, set_provider, command-router]
  affects: [chat.py, stt.py, tts.py]
tech_stack:
  added: []
  patterns: [command-router, lazy-import-in-handler, finally-block-resume, xfail-stub-upgrade]
key_files:
  created: []
  modified:
    - apps/desktop-py/src/jarvis_desktop/chat.py
    - apps/desktop-py/src/jarvis_desktop/stt.py
    - apps/desktop-py/src/jarvis_desktop/tts.py
decisions:
  - "config.tts_provider explicitly set in _menu_tts_provider() after set_provider() to handle mocked calls correctly"
  - "ASCII separator (-) used instead of Unicode box-drawing (─) for cross-platform Windows cp1252 compatibility"
  - "Lazy imports inside _handle_command, _show_config_menu, and menu helpers avoid circular imports at module level"
metrics:
  duration_seconds: 232
  completed_date: "2026-05-18"
  tasks_completed: 2
  files_modified: 3
---

# Phase 77 Plan 02: Config Menu (/config command) Summary

**One-liner:** Runtime Whisper/TTS/voice-mode hot-swap via `/config` terminal menu with voice pause/resume gate and immediate persistence.

## What Was Built

### Command Router in chat_loop()
Added `/`-prefix detection in `chat_loop()` before any gateway call (D-06). Typing `/config` routes to `_handle_command()` and `continue`s without sending to the gateway. Unknown commands print an error message.

### _handle_command()
Stops voice capture (`voice_modes.stop_mode()`), calls `_show_config_menu()`, and always resumes voice modes in a `finally` block (`voice_modes.start_mode(config.voice_mode, config)`) plus persists via `save_config(config)` — satisfying D-07 and D-11.

### _show_config_menu()
Numbered terminal menu showing current values in brackets:
```
----------------------------------------
Config JARVIS
----------------------------------------
1. Whisper model  [tiny]
2. TTS provider   [kokoro]
3. Voice mode     [ptt]
0. Sair
```
Loops until user selects `0` or presses Ctrl+C.

### _menu_whisper_model()
- Lists 5 Whisper models with `[x]` current marker
- Calls `stt.reload_model(new_model)` for immediate hot-swap (D-11)
- Updates `config.whisper_model` and calls `save_config()` on success
- Restores config and prints error on `RuntimeError`

### _menu_tts_provider()
- Lists 3 TTS providers with `[x]` current marker
- Calls `tts.set_provider(new_provider, config)` for immediate switch (D-11)
- Explicitly sets `config.tts_provider = new_provider` (ensures field is updated even in test mock scenarios)
- Calls `save_config()` after successful switch

### _menu_voice_mode()
- Lists 3 voice modes with `[x]` current marker
- Calls `voice_modes.switch_mode(new_mode, config)` which internally handles save + start
- `_handle_command`'s `finally` block calling `start_mode()` again is idempotent (safe double-call)

### stt.reload_model()
Thread-safe Whisper model hot-swap:
- Validates `new_size` against `valid_sizes` set (raises `RuntimeError` on unknown size)
- Acquires `_lock` before replacement
- Saves `old_model` reference, restores it if `WhisperModel()` constructor raises
- Releases old model reference via `del old_model` for GC

### tts.set_provider()
Runtime TTS provider switch:
- Validates `provider` against `valid_providers` set (raises `ValueError` on unknown)
- Acquires `_lock` before mutation
- Sets `config.tts_provider = provider` in-place
- For `kokoro`: resets `_engine = None` so next `speak()` lazy-initializes
- For cloud providers: no engine reset needed (stateless API calls)

## Key Implementation Details

**Lazy imports in _handle_command:** All module imports (`ui`, `voice_modes`, `stt`, `tts`, `save_config`) are done inside the function body to avoid circular import at module level. This mirrors the pattern established in Plan 77-01 for tts.py and voice_modes.py.

**switch_mode() idempotency:** `_handle_command`'s `finally` block calls `start_mode(config.voice_mode, config)`. After `voice_modes.switch_mode()` sets `config.voice_mode = new_mode` and starts the new mode, the `finally` block's `start_mode()` call triggers `_stop_current()` first (which is idempotent) and then restarts — effectively a safe no-op restart.

**finally block pattern:** Voice modes are always resumed even if the menu raises an exception. Config is always persisted on menu exit.

**ASCII separator fix:** The original `─` (U+2500) box-drawing character caused `UnicodeEncodeError` on Windows cp1252 terminals. Replaced with `-` ASCII for cross-platform compatibility.

**config.tts_provider dual-write:** `set_provider()` writes `config.tts_provider` internally. In `_menu_tts_provider()`, we also set it explicitly after the call — this ensures the value is correct even when `set_provider()` is mocked in tests (the mock doesn't execute the real mutation).

## Files Modified

| File | Changes |
|------|---------|
| `apps/desktop-py/src/jarvis_desktop/chat.py` | Added command detection in chat_loop(); added _handle_command(), _show_config_menu(), _menu_whisper_model(), _menu_tts_provider(), _menu_voice_mode(); updated module docstring |
| `apps/desktop-py/src/jarvis_desktop/stt.py` | Added reload_model() after init_stt() |
| `apps/desktop-py/src/jarvis_desktop/tts.py` | Added set_provider() after stop_tts() |

## Test Results

- `tests/test_config_menu.py`: 5 xpassed (xfail stubs became xpass)
- `tests/test_stt.py`: 5 passed (no regressions)
- `tests/test_tts.py`: 7 passed (no regressions)
- `tests/test_chat.py`: all passed (no regressions)
- Full suite: **32 passed, 15 xpassed, 0 failures, 0 errors**

## Phase 77 Completion Status

- PYUI-01: Status line with rich.Live — delivered in Plan 77-01
- PYUI-02: /config menu with Whisper/TTS/voice-mode hot-swap — delivered in Plan 77-02

**Phase 77 complete. PYUI-01 + PYUI-02 both satisfied.**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Unicode box-drawing character on Windows cp1252 terminals**
- **Found during:** Task 2 smoke test verification
- **Issue:** `─` (U+2500) caused `UnicodeEncodeError: 'charmap' codec can't encode characters` on Windows terminals using cp1252 encoding
- **Fix:** Replaced `─` with `-` (ASCII hyphen) in `_show_config_menu()` separator lines
- **Files modified:** `apps/desktop-py/src/jarvis_desktop/chat.py`
- **Commit:** included in `6204de0`

**2. [Rule 1 - Bug] Explicit config.tts_provider assignment in _menu_tts_provider()**
- **Found during:** Task 2 test run (test_tts_provider_switch xfailed initially)
- **Issue:** When `tts.set_provider()` is mocked in tests, `config.tts_provider` was never updated (the mock doesn't execute the real mutation), causing `assert config.tts_provider == "elevenlabs"` to fail
- **Fix:** Added `config.tts_provider = new_provider` explicitly after `tts.set_provider()` call
- **Files modified:** `apps/desktop-py/src/jarvis_desktop/chat.py`
- **Commit:** included in `6204de0`

## Known Stubs

None — all menu functions are fully wired with real implementations.

## Self-Check: PASSED
