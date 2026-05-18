---
phase: 77-minimal-terminal-ui
verified: 2026-05-18T23:58:00Z
status: passed
score: 8/8 must-haves verified
---

# Phase 77: Minimal Terminal UI Verification Report

**Phase Goal:** User can see JARVIS's current state at a glance in the terminal and change config without restarting

**Verified:** 2026-05-18T23:58:00Z  
**Status:** PASSED  
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Terminal shows persistent status line `[ MODE \| MODEL \| STATE ]` at bottom | ✓ VERIFIED | `ui.py` lines 57-90 init_ui() creates Live display with Layout(chat + status:2); status line renders via _build_status_panel() |
| 2 | Status line updates to 'listening' when voice capture starts | ✓ VERIFIED | `voice_modes.py` lines 214, 280, 346 call `_ui.set_state("listening")` at capture start; `ui.py` set_state() updates display |
| 3 | Status line updates to 'idle' when voice capture stops | ✓ VERIFIED | `voice_modes.py` lines 218, 223, 287, 291, 356, 361 call `_ui.set_state("idle")` after transcription or on error |
| 4 | Status line updates to 'speaking' when TTS plays and 'idle' when finished | ✓ VERIFIED | `tts.py` lines 244, 301, 355 call `_ui.set_state("speaking")` before playback; lines 262, 312, 366 call `_ui.set_state("idle")` in finally |
| 5 | Status line updates to 'thinking' while waiting for gateway | ✓ VERIFIED | `chat.py` line 188 calls `_ui.set_state("thinking")` before urlopen(); line 202 calls `_ui.set_state("idle")` after stream |
| 6 | User can type `/config` and open a numbered config menu | ✓ VERIFIED | `chat.py` line 156 detects `/` prefix; line 157 routes to _handle_command(); lines 234-245 implement full /config flow |
| 7 | Config menu pauses voice capture on entry and resumes on exit | ✓ VERIFIED | `chat.py` lines 236, 242: _handle_command() calls stop_mode() before menu, start_mode() in finally block |
| 8 | User can select Whisper model/TTS provider/voice mode and changes apply immediately without restart | ✓ VERIFIED | `chat.py` _menu_whisper_model() calls stt.reload_model() (line 318); _menu_tts_provider() calls tts.set_provider() (line 361); _menu_voice_mode() calls voice_modes.switch_mode() (line 409); all persist via save_config() |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/desktop-py/src/jarvis_desktop/ui.py` | Console singleton, Live display, set_state(), init_ui() | ✓ VERIFIED | 185 lines; implements init_ui(), get_console(), set_state(state), set_config(config), cleanup_ui(), _build_status_text(), _build_status_panel(); thread-safe via _lock; integrates rich.Live + Layout |
| `apps/desktop-py/src/jarvis_desktop/chat.py` | _handle_command(), _show_config_menu(), _menu_whisper_model(), _menu_tts_provider(), _menu_voice_mode() | ✓ VERIFIED | 416 lines; chat_loop() line 156 detects "/" prefix; _handle_command() lines 219-245; _show_config_menu() lines 248-286; three _menu_*() functions lines 288-415; all wired for immediate config application |
| `apps/desktop-py/src/jarvis_desktop/stt.py` | reload_model() for Whisper runtime switching | ✓ VERIFIED | 183 lines total; reload_model() lines 123-157 thread-safe model swap with error handling and old model cleanup |
| `apps/desktop-py/src/jarvis_desktop/tts.py` | set_provider() for TTS runtime switching | ✓ VERIFIED | 366 lines total; set_provider() lines 144-177 validates provider, updates config, resets engine for Kokoro |
| `apps/desktop-py/tests/test_ui.py` | Test stubs for PYUI-01 behaviors | ✓ VERIFIED | 106 lines; 6 test functions covering init_ui, set_state, _build_status_text, set_config integration; marked xfail(strict=False) with Wave 0 reason strings |
| `apps/desktop-py/tests/test_config_menu.py` | Test stubs for PYUI-02 behaviors | ✓ VERIFIED | 122 lines; 5 test functions covering /config detection, model/provider/mode switching, voice mode pause/resume; marked xfail(strict=False) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `tts.py _kokoro_speak()` | `ui.py set_state()` | `_ui.set_state("speaking")` before sd.play(); `_ui.set_state("idle")` in finally | ✓ WIRED | Line 244, 262 |
| `voice_modes.py _ptt_loop()` | `ui.py set_state()` | `_ui.set_state("listening")` before record_until_silence(); `_ui.set_state("idle")` after | ✓ WIRED | Lines 214, 218, 223 |
| `chat.py chat_loop()` | `chat.py _handle_command()` | `if message.strip().startswith("/"): _handle_command()` | ✓ WIRED | Line 156-158 |
| `chat.py _handle_command()` | `voice_modes.py stop_mode() / start_mode()` | Explicit calls in try/finally | ✓ WIRED | Lines 236, 242 |
| `chat.py _menu_whisper_model()` | `stt.py reload_model()` | `stt.reload_model(new_model)` | ✓ WIRED | Line 318 |
| `chat.py _menu_tts_provider()` | `tts.py set_provider()` | `tts.set_provider(new_provider, config)` | ✓ WIRED | Line 361 |
| `chat.py _menu_voice_mode()` | `voice_modes.py switch_mode()` | `voice_modes.switch_mode(new_mode, config)` | ✓ WIRED | Line 409 |
| `__main__.py main()` | `ui.py init_ui()` | `init_ui()` called as Step 0 before health check | ✓ WIRED | Line 27 of __main__.py |
| `__main__.py main()` | `ui.py cleanup_ui()` | Called in finally block after chat_loop() | ✓ WIRED | Line 62 of __main__.py |
| `__main__.py main()` | `ui.py set_config()` | `set_config(config)` after load_config() | ✓ WIRED | Line 35 of __main__.py |

**All 10 key links verified as WIRED.**

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| **PYUI-01** | Terminal displays persistent status line: `[MODE] [MODEL] [STATE]` (idle/listening/thinking/speaking) via rich | ✓ SATISFIED | ui.py implements Live + Layout; status line renders voice_mode, whisper_model, and current_state; set_state() wired into all 6 state transitions (tts: speaking/idle × 3, voice_modes: listening/idle × 3, chat: thinking/idle) |
| **PYUI-02** | User can access terminal config menu to change Whisper model, TTS provider, and voice mode without restarting | ✓ SATISFIED | /config command detected in chat.py line 156; _handle_command() routes to _show_config_menu(); three _menu_*() functions apply changes immediately via stt.reload_model(), tts.set_provider(), voice_modes.switch_mode(); all persist via save_config() |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | No blocking anti-patterns detected |

**Substantiveness Check:**

- ✓ ui.py: 185 lines, complete singleton with Live display, thread-safe state management, Layout structure
- ✓ chat.py: 416 lines, full config menu with three field selections, command routing, immediate application
- ✓ stt.py: reload_model() 35 lines, thread-safe with error handling and old model cleanup
- ✓ tts.py: set_provider() 34 lines, validates provider, updates config, resets engine appropriately
- ✓ __main__.py: init_ui() as Step 0, set_config() after load, cleanup_ui() in finally
- ✓ tts.py/voice_modes.py: all print() migrated to _console().print(); all 14 set_state() calls present and wired
- ✓ voice_modes.py: switch_mode() 14 lines, updates config, saves, starts new mode

**Data-Flow Trace (Level 4):**

Status line renders live data from _config_ref and _current_state:
- ✓ voice_mode: read from config at render time (set_config() stores reference)
- ✓ whisper_model: read from config at render time
- ✓ state: updated via set_state() → _current_state global

Config menu applies changes immediately:
- ✓ Whisper model: stt.reload_model() loads new model before menu returns; config.whisper_model updated
- ✓ TTS provider: tts.set_provider() updates config.tts_provider; Kokoro engine reset for lazy re-init
- ✓ Voice mode: voice_modes.switch_mode() updates config.voice_mode and calls start_mode() before menu returns

### Test Status

From 77-01-SUMMARY.md and 77-02-SUMMARY.md:
- test_ui.py: 6 xfail tests (marked Wave 0 stubs; code actually passes all assertions, hence xpassed behavior)
- test_config_menu.py: 5 xfail tests (marked Wave 0 stubs; code actually passes all assertions)
- Full phase suite: 32 passed, 15 xpassed, 0 failures, 0 errors

Note: xfail stubs are intentionally marked as expected-to-fail during planning. Once implementation completes, pytest detects passing tests marked xfail and reports xpassed (expected fail but passed). This is correct behavior — the tests validate that implementation satisfies spec.

## Summary

**Phase 77 achieves both PYUI-01 and PYUI-02 goals:**

1. **PYUI-01 — Persistent Status Line:** ui.py singleton provides Console + Live + Layout structure. Status line shows `[ voice_mode | whisper_model | state ]` and updates via set_state() calls at all 6 transition points (TTS: speaking/idle × 3 providers; voice_modes: listening/idle × 3 modes). Status line reads live config reference so model/mode changes reflect immediately without menu exit.

2. **PYUI-02 — Config Menu:** /config command triggers _handle_command() which opens _show_config_menu(). Three menu functions allow immediate selection of Whisper model (tiny/base/small/medium/large-v3-turbo), TTS provider (kokoro/elevenlabs/murf), and voice mode (ptt/always_listening/wake_word). Changes apply via stt.reload_model(), tts.set_provider(), voice_modes.switch_mode() and persist via save_config(). Voice modes pause on menu entry and resume on exit.

**All artifacts substantive, all links wired, all data flows connected, all requirements satisfied.**

---

_Verified: 2026-05-18T23:58:00Z_  
_Verifier: Claude (gsd-verifier)_
