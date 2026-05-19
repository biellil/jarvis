---
phase: 77-minimal-terminal-ui
plan: 01
subsystem: ui
tags: [rich, live, console, status-line, tts, voice-modes, terminal]

# Dependency graph
requires:
  - phase: 76-voice-modes
    provides: voice_modes.py (start_mode, stop_mode, get_text_queue) and tts.py (is_speaking, speak)
provides:
  - ui.py singleton: Console, Live display, set_state(), set_config(), get_console(), _build_status_text(), cleanup_ui()
  - Persistent status line showing [ MODE | MODEL | STATE ] at terminal bottom
  - All print() calls in tts.py, voice_modes.py, chat.py replaced with console.print()
  - Wave 0 xfail stubs for PYUI-01 (test_ui.py) and PYUI-02 (test_config_menu.py)
affects: [77-02-config-menu, any future phase touching tts.py/voice_modes.py/chat.py output]

# Tech tracking
tech-stack:
  added: ["rich>=13.0 (Console, Live, Layout, Panel, Text)"]
  patterns:
    - "Lazy _console() accessor pattern: def _console(): from jarvis_desktop import ui; return ui.get_console() — avoids circular import at module level"
    - "Flat module singleton pattern (matches stt.py, tts.py) — module-level globals, threading.Lock, idempotent init"
    - "Double-checked locking in init_ui() for thread-safe singleton initialization"
    - "set_state() thread-safe via _lock — callable from daemon threads (tts, voice_modes)"

key-files:
  created:
    - apps/desktop-py/src/jarvis_desktop/ui.py
    - apps/desktop-py/tests/test_ui.py
    - apps/desktop-py/tests/test_config_menu.py
  modified:
    - apps/desktop-py/src/jarvis_desktop/tts.py
    - apps/desktop-py/src/jarvis_desktop/voice_modes.py
    - apps/desktop-py/src/jarvis_desktop/chat.py
    - apps/desktop-py/src/jarvis_desktop/__main__.py
    - apps/desktop-py/pyproject.toml

key-decisions:
  - "Lazy _console() helper function instead of module-level import — avoids circular import (ui.py imports nothing from jarvis_desktop; tts.py/voice_modes.py import ui lazily)"
  - "_build_status_text() exposed at module level for test accessibility — tests can verify status format without a real terminal"
  - "set_state() inside each provider's try/finally — ensures idle state is always restored even on exceptions"
  - "chat.py adds set_state('thinking') before gateway request and set_state('idle') after stream — covers the 4th transition point"
  - "cleanup_ui() called in __main__.py finally block — guarantees Live display stops cleanly on Ctrl+C or any exit path"

patterns-established:
  - "Pattern: modules call 'from jarvis_desktop import ui; ui.set_state(state)' inside functions — never at module level"
  - "Pattern: modules call '_console().print(...)' via lazy accessor — replaces all print() calls project-wide"

requirements-completed: [PYUI-01]

# Metrics
duration: 7min
completed: 2026-05-18
---

# Phase 77 Plan 01: Minimal Terminal UI — ui.py Singleton Summary

**rich.Live status line singleton with [ MODE | MODEL | STATE ] at terminal bottom, wired into all 6 TTS/voice transition points and all print() calls migrated to Console.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-18T22:36:11Z
- **Completed:** 2026-05-18T22:42:48Z
- **Tasks:** 3/3
- **Files modified:** 7 (1 created, 4 modified, 2 test files created)

## Accomplishments

### Task 1: Wave 0 test stubs (commit 1449633)
- Created `tests/test_ui.py` with 6 xfail stubs covering init_ui, set_state, set_config, _build_status_text
- Created `tests/test_config_menu.py` with 5 xfail stubs for Plan 77-02 config menu behaviors
- All 11 stubs: xfail(strict=False) with descriptive reason strings
- Verified: 11 xfailed, 0 errors, 0 failures

### Task 2: ui.py singleton (commit 70855e7)
- Created `src/jarvis_desktop/ui.py` (160 lines) with flat module pattern matching stt.py/tts.py
- Public API: init_ui(), get_console(), set_state(), set_config(), cleanup_ui()
- Internal: _build_status_text() (exposed for tests), _build_status_panel()
- rich.Live with Layout (chat + status:2) — status line fixed at terminal bottom
- Thread-safe set_state() via _lock — callable from daemon threads
- Added `rich>=13.0` to pyproject.toml and ran uv sync
- Verified: module importable, Live starts/stops cleanly, all 6 test_ui.py stubs xpassed

### Task 3: Wire + migrate (commit f0fd30c)
- **tts.py:** 8 set_state() calls (speaking before playback, idle in finally for all 3 providers); all print() → _console().print()
- **voice_modes.py:** 11 set_state() calls (listening at capture start, idle after transcription, idle on error for all 3 modes); all print() → _console().print()
- **chat.py:** set_state("thinking") before gateway request, set_state("idle") after stream completes; all print() → _console().print(); _console() lazy accessor added
- **__main__.py:** init_ui() as Step 0 (before any output); set_config(config) after load_config(); all print() → c.print(); cleanup_ui() in finally block
- Verified: 32 passed, 5 xfailed (test_config_menu.py — correct, Plan 77-02), 10 xpassed (6 test_ui.py + 4 Phase 76)

## Deviations from Plan

**1. [Rule 2 - Missing functionality] chat.py set_state("thinking") added**
- **Found during:** Task 3
- **Issue:** Plan specified set_state() in tts.py and voice_modes.py only; chat.py was missing the "thinking" transition while waiting for gateway response
- **Fix:** Added set_state("thinking") before urlopen() in _stream_response() and set_state("idle") after — covers the D-04 requirement fully
- **Files modified:** chat.py

**2. [Rule 2 - Missing functionality] cleanup_ui() in __main__.py finally block**
- **Found during:** Task 3
- **Issue:** Plan mentioned cleanup_ui() but didn't specify where; added in try/finally wrapping chat_loop() for guaranteed cleanup
- **Fix:** Added `try: chat_loop(config) finally: ui.cleanup_ui()` in main()
- **Files modified:** __main__.py

## Test Results

```
32 passed, 5 xfailed, 10 xpassed in 5.61s
```

- 32 passing tests (all Phase 72-76 existing tests — zero regressions)
- 5 xfailed: test_config_menu.py stubs (correct — Plan 77-02 will implement)
- 10 xpassed: 6 test_ui.py stubs (now passing), 4 Phase 76 stubs (from previous phase)

## Lessons for Plan 77-02

- `_handle_command()` and `_show_config_menu()` need to be added to chat.py
- `stt.reload_model()` function needed in stt.py (currently has init_stt but not reload)
- `tts.set_provider()` function needed in tts.py
- voice_modes.stop_mode/start_mode already exist — config menu can call them directly
- Use `from jarvis_desktop import ui; ui.get_console().print()` pattern (not module-level import)

## Known Stubs

None — all wiring is complete for PYUI-01. test_config_menu.py stubs are intentional Wave 0 stubs for Plan 77-02 (PYUI-02), documented in the stub reason strings.

## Self-Check: PASSED

Files exist:
- apps/desktop-py/src/jarvis_desktop/ui.py ✓
- apps/desktop-py/tests/test_ui.py ✓
- apps/desktop-py/tests/test_config_menu.py ✓

Commits exist:
- 1449633 (test stubs) ✓
- 70855e7 (ui.py singleton) ✓
- f0fd30c (wire + migrate) ✓
