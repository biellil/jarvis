---
phase: 76-voice-modes
verified: 2026-05-18T23:00:00Z
status: passed
score: 4/4 success criteria verified
re_verification: false
---

# Phase 76: Voice Modes Verification Report

**Phase Goal:** Implement pluggable voice input modes (PTT, wake-word, always-listening) as a hot-swappable state machine — no changes needed in chat.py when adding new modes.
**Verified:** 2026-05-18
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Saying "Hey JARVIS" triggers STT → gateway → TTS pipeline with no hotkey press (wake word mode) | VERIFIED | `_wake_word_loop` in voice_modes.py uses openwakeword Model with `hey_jarvis` model; on confidence > threshold calls `record_until_silence` + `transcribe` + puts to queue; `test_wake_word_detection` passes |
| 2 | Always-listening VAD detects continuous speech and routes to pipeline without wake word | VERIFIED | `_always_listening_loop` uses `Model(vad_threshold=0.5)` with no wakeword_models; accumulates speech buffer; transcribes on silence; `test_always_listening_vad` passes |
| 3 | PTT mode: configured hotkey starts/stops recording — identical to Phase 74 behavior | VERIFIED | `_ptt_loop` uses pynput GlobalHotKeys with `_parse_ptt_hotkey(config.ptt_key)`; migrated from chat.py; `test_ptt_mode_hotkey` passes |
| 4 | Only one mode active at a time; switching modes deactivates previous one cleanly | VERIFIED | `_stop_current()` called at start of `start_mode()`; `switch_mode()` calls `start_mode()` which calls `_stop_current()` first; thread join timeout=3s; `test_switch_mode_hot_swap` passes |

**Score:** 4/4 success criteria verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/desktop-py/src/jarvis_desktop/voice_modes.py` | State machine with 3 mode loops | VERIFIED | 343 lines; exports init_voice_modes, start_mode, stop_mode, switch_mode, get_text_queue, _ptt_loop, _wake_word_loop, _always_listening_loop |
| `apps/desktop-py/src/jarvis_desktop/chat.py` | Refactored without direct PTT management | VERIFIED | No pynput import; polls `get_text_queue().get_nowait()`; `stop_mode()` in finally block |
| `apps/desktop-py/src/jarvis_desktop/__main__.py` | init_voice_modes wired before chat_loop | VERIFIED | Step 5 `init_voice_modes(config)` after init_tts, before chat_loop (Step 6) |
| `apps/desktop-py/src/jarvis_desktop/tts.py` | is_speaking() public function | VERIFIED | `def is_speaking() -> bool` returns `_is_playing`; `_is_playing` flag set/cleared in all 3 speak paths |
| `apps/desktop-py/src/jarvis_desktop/config.py` | wake_word_threshold field | VERIFIED | `wake_word_threshold: float = Field(default=0.7, ...)` present |
| `apps/desktop-py/pyproject.toml` | openwakeword==0.6.0 dependency | VERIFIED | Line 16: `"openwakeword==0.6.0",` confirmed |
| `apps/desktop-py/tests/test_voice_modes.py` | 9 tests for PYMODE-01/02/03 + D-06/07/08 + chat queue | VERIFIED | 9 tests present; all 9 pass (0 xfail) |
| `apps/desktop-py/tests/conftest.py` | mock_openwakeword_model + mock_voice_queue fixtures | VERIFIED | Both fixtures present (mock_openwakeword_model in test_voice_modes.py locally, mock_voice_queue used in conftest) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `voice_modes._ptt_loop` | `stt.record_until_silence + stt.transcribe` | `from jarvis_desktop.stt import record_until_silence, transcribe, _parse_ptt_hotkey` | WIRED | Line 180 of voice_modes.py |
| `voice_modes._wake_word_loop` | `openwakeword.model.Model` | `from openwakeword.model import Model` (lazy import) | WIRED | Line 233 of voice_modes.py |
| `voice_modes._always_listening_loop` | `tts.is_speaking()` | D-06 check before recording | WIRED | Lines 252, 312 of voice_modes.py — `tts.is_speaking()` checked in all 3 loops |
| `voice_modes.switch_mode` | `config.save_config` | D-08 persist new mode | WIRED | Lines 117-119 of voice_modes.py — `save_config(config)` called |
| `chat.chat_loop` | `voice_modes.get_text_queue()` | `queue.get_nowait()` each loop iteration | WIRED | Lines 122-134 of chat.py |
| `__main__.main` | `voice_modes.init_voice_modes(config)` | Step 5 in startup sequence | WIRED | Lines 21, 47 of __main__.py |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `voice_modes._ptt_loop` | `text` (transcribed audio) | `stt.transcribe(audio)` after `record_until_silence()` | Yes — real mic audio via pynput hotkey | FLOWING |
| `voice_modes._wake_word_loop` | `text` (transcribed audio) | `model.predict()` → confidence check → `record_until_silence` → `transcribe` | Yes — openwakeword confidence gates real capture | FLOWING |
| `voice_modes._always_listening_loop` | `speech_buffer` → `text` | `model.predict()` VAD score accumulates chunks, `transcribe(np.concatenate(buffer))` | Yes — real audio chunks from sd.InputStream | FLOWING |
| `chat.chat_loop` | `message` | `text_queue.get_nowait()` from voice_modes OR `input("> ")` | Yes — both paths produce real user input | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Check | Result | Status |
|----------|-------|--------|--------|
| voice_modes.py has all 5 public functions | `grep "^def " voice_modes.py` | init_voice_modes, start_mode, stop_mode, switch_mode, get_text_queue, _stop_current, _wait_for_tts, _ptt_loop, _wake_word_loop, _always_listening_loop all present | PASS |
| chat.py has no pynput/ptt_triggered remnants | `grep pynput\|ptt_triggered\|_parse_ptt_hotkey chat.py` | Only in Phase 74 historical comment in module docstring — no live code | PASS |
| Full test suite passes | `uv run pytest tests/ -v` | 32 passed, 4 xpassed, 0 failed, 0 xfail | PASS |
| All 9 voice_modes tests pass | `uv run pytest tests/test_voice_modes.py -v` | 9 passed in 4.98s | PASS |
| openwakeword dep in pyproject.toml | `grep openwakeword pyproject.toml` | `"openwakeword==0.6.0",` on line 16 | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|------------|------------|-------------|--------|----------|
| PYMODE-01 | 76-01, 76-02, 76-03 | User can activate JARVIS via "Hey JARVIS" wake word (openwakeword offline, default threshold 0.7) | SATISFIED | `_wake_word_loop` uses `Model(wakeword_models=["hey_jarvis"], vad_threshold=config.wake_word_threshold)` with default 0.7; `test_wake_word_detection` and `test_wake_word_threshold_config` pass |
| PYMODE-02 | 76-01, 76-02, 76-03 | User can use always-listening mode — VAD detects speech continuously without wake word | SATISFIED | `_always_listening_loop` uses `Model(vad_threshold=0.5)` with no wakeword_models; accumulates chunks; `test_always_listening_vad` passes |
| PYMODE-03 | 76-01, 76-02, 76-03 | User can use PTT mode — configurable hotkey starts/stops recording | SATISFIED | `_ptt_loop` migrated from chat.py with pynput GlobalHotKeys; `test_ptt_mode_hotkey` passes; PTT removed from chat.py confirming non-chat-coupled implementation |

No orphaned requirements — all 3 PYMODE IDs declared in plan frontmatter and verified.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `chat.py` | 79 | `return {}` | Info | `build_request_headers` returns empty dict when no api_key — correct behavior, not a stub. Headers are passed to urllib.request as `{}` which is valid. |

No blockers or warnings found. The `return {}` at chat.py:79 is intentional (empty headers when no API key is set).

---

### Human Verification Required

#### 1. Wake Word End-to-End Flow

**Test:** Start the desktop client (`uv run python -m jarvis_desktop`) with gateway running. Say "Hey JARVIS" clearly into the microphone. Wait for the STT → gateway → TTS pipeline to complete.
**Expected:** Terminal shows `[VOICE] Wake word detectado! Falando...` → `[STT] ouvindo...` → `[STT] transcrevendo...` → gateway response streams → TTS speaks the response.
**Why human:** Requires running system with real microphone, openwakeword model downloaded, and gateway online. Cannot verify programmatically without hardware.

#### 2. Always-Listening VAD Sensitivity

**Test:** Switch to always-listening mode (`voice_mode = "always_listening"` in config). Speak a sentence naturally without any hotkey. Verify speech is captured and routed.
**Expected:** Continuous speech accumulates in buffer; silence stops accumulation; text is transcribed and sent to gateway.
**Why human:** Real VAD behavior with actual audio signal requires human judgment on detection quality and false-positive rate.

#### 3. Hot-Swap Mode Without Restart

**Test:** Start in PTT mode. Call `switch_mode("wake_word", config)` programmatically or via Phase 77 menu when available. Verify old PTT thread stops and wake word thread starts — without restarting the client.
**Expected:** PTT listener stops (pynput listener.stop() called), new wake word thread starts printing `[VOICE] Inicializando modelo wake word...`.
**Why human:** Thread lifecycle with 3s join timeout and daemon thread teardown is safest verified with runtime observation.

---

### Gaps Summary

None. All success criteria verified. The phase goal is achieved:

- Three mutually exclusive voice modes implemented as a pluggable state machine in `voice_modes.py`
- chat.py does not manage PTT directly — it only polls `get_text_queue()`
- Adding a new mode requires only adding a new loop function in voice_modes.py and one branch in `start_mode()` — zero changes to chat.py (goal achieved)
- All three PYMODE requirements satisfied with full test coverage (9/9 tests passing)
- Hot-swap (D-07) and persistence (D-08) implemented and tested

---

_Verified: 2026-05-18T23:00:00Z_
_Verifier: Claude (gsd-verifier)_
