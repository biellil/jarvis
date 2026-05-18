---
phase: 75-text-to-speech-tts
verified: 2026-05-18T20:30:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 75: Text-to-Speech (TTS) Verification Report

**Phase Goal:** Implement TTS (text-to-speech) capability for JARVIS desktop — Kokoro offline engine with ElevenLabs and Murf cloud fallback, wired into the chat loop.
**Verified:** 2026-05-18T20:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | JARVIS speaks responses aloud via Kokoro offline TTS (no API key) | VERIFIED | `tts.py` init_tts/speak/_kokoro_speak present; test_init_tts + test_kokoro_speak pass |
| 2 | Client falls back to ElevenLabs cloud TTS when Kokoro unavailable or provider=elevenlabs | VERIFIED | `_elevenlabs_speak` fully implemented with SDK call + pcm_24000 decode; test_elevenlabs_fallback passes |
| 3 | Client falls back to Murf.ai as second cloud fallback | VERIFIED | `_murf_speak` fully implemented with Murf SDK + soundfile WAV decode; test_murf_fallback passes |
| 4 | User can enable local_only=True to disable all cloud TTS providers | VERIFIED | `speak()` checks `config.local_only` before any cloud call; test_local_only_mode passes |
| 5 | TTS is wired into chat loop — speak() called after full SSE stream completes | VERIFIED | `chat.py` imports speak at module level; `_stream_response` accumulates `full_response` list and calls `speak(full_text, config)` after loop |
| 6 | init_tts() wired in __main__.py before chat_loop() | VERIFIED | `__main__.py` Step 4 calls `init_tts(config)` between `init_stt()` and `chat_loop()` |
| 7 | Full pytest suite passes (all 7 TTS tests green, 0 xfailed) | VERIFIED | `pytest tests/test_tts.py`: 7 passed; `pytest tests/`: 23 passed, 4 xpassed, 0 failed |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/desktop-py/pyproject.toml` | TTS dependencies listed | VERIFIED | Contains `kokoro>=0.9.4`, `soundfile`, `elevenlabs`, `murf` |
| `apps/desktop-py/src/jarvis_desktop/config.py` | JarvisConfig TTS fields | VERIFIED | `kokoro_voice="pf_dora"`, `local_only=False`, `elevenlabs_api_key=""`, `murf_api_key=""` present |
| `apps/desktop-py/src/jarvis_desktop/tts.py` | TTS singleton module (min 80 lines) | VERIFIED | 286 lines; exports `init_tts`, `speak`, `stop_tts`, `_create_kokoro_engine`, `_kokoro_speak`, `_elevenlabs_speak`, `_murf_speak` |
| `apps/desktop-py/src/jarvis_desktop/chat.py` | SSE stream with speak() after completion | VERIFIED | Module-level `from jarvis_desktop.tts import speak`; `full_response` list accumulation; `speak(full_text, config)` call post-stream |
| `apps/desktop-py/src/jarvis_desktop/__main__.py` | Entry point with init_tts wired | VERIFIED | `from jarvis_desktop.tts import init_tts`; Step 4 calls `init_tts(config)` |
| `apps/desktop-py/tests/test_tts.py` | 7 TTS unit tests (all passing) | VERIFIED | 7 tests, 0 xfail decorators remaining, all pass |
| `apps/desktop-py/tests/test_chat.py` | test_stream_response_triggers_tts | VERIFIED | Present at line 82; asserts speak() called with accumulated SSE tokens |
| `apps/desktop-py/tests/test_config.py` | test_tts_config_fields() | VERIFIED | Present at line 88; asserts all 4 Phase 75 config fields and defaults |
| `apps/desktop-py/tests/conftest.py` | 4 TTS fixtures | VERIFIED | `mock_kokoro_engine`, `mock_sounddevice_play`, `mock_elevenlabs_api`, `mock_murf_api` all present |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `chat.py` | `tts.py` | Module-level `from jarvis_desktop.tts import speak`; `speak(full_text, config)` in `_stream_response` | WIRED | Import at line 26; call at line 203 |
| `__main__.py` | `tts.py` | `from jarvis_desktop.tts import init_tts` inside `main()`; called as Step 4 | WIRED | Import at line 19; call at line 41 |
| `tts.py` | `kokoro.Kokoro` | `_create_kokoro_engine()` calls `kokoro.Kokoro(lang="p", voice=config.kokoro_voice)` | WIRED | Line 156 |
| `tts.py` | `sounddevice.play` | `_kokoro_speak()` calls `sd.play(audio_data, samplerate=_KOKORO_SAMPLE_RATE)` | WIRED | Line 187 |
| `tts.py` | `elevenlabs.client.ElevenLabs` | `_elevenlabs_speak()` lazy-imports and calls `ElevenLabs(api_key=...).text_to_speech.convert()` | WIRED | Lines 216-225 |
| `tts.py` | `murf.Murf` | `_murf_speak()` lazy-imports and calls `Murf(api_key=...).text_to_speech.generate()` | WIRED | Lines 258-265 |
| `config.py` | TTS fields | `JarvisConfig` has `kokoro_voice`, `local_only`, `elevenlabs_api_key`, `murf_api_key` | WIRED | Lines 28-31 |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `chat.py:_stream_response` | `full_response` list | SSE token stream from gateway, appended per token | Yes — real SSE tokens accumulated then joined | FLOWING |
| `tts.py:_kokoro_speak` | `audio_data` | `_engine.create(text)` — Kokoro NumPy float32 array | Yes — real synthesis (mocked in tests) | FLOWING |
| `tts.py:_elevenlabs_speak` | `audio_array` | `ElevenLabs().text_to_speech.convert()` → PCM int16 → float32 | Yes — real API bytes decoded to NumPy | FLOWING |
| `tts.py:_murf_speak` | `audio_f32` | `Murf().text_to_speech.generate()` → WAV URL/bytes → soundfile decode | Yes — real API bytes decoded via soundfile | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 7 TTS unit tests pass | `pytest tests/test_tts.py -v` | 7 passed, 0 failed | PASS |
| Full suite clean (all phases) | `pytest tests/ -q` | 23 passed, 4 xpassed, 0 failed | PASS |
| tts.py imports without error | Python import check via pytest | Passes in test_init_tts | PASS |
| chat.py speak() integration test | `test_stream_response_triggers_tts` | PASSED | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PYTTS-01 | 75-01, 75-02 | Kokoro offline TTS, no API key, model downloaded on first run | SATISFIED | `tts.py` Kokoro singleton; `init_tts` loads engine; 4 tests in Plans 01-02 cover this |
| PYTTS-02 | 75-01, 75-03 | ElevenLabs cloud fallback when Kokoro unavailable or fails | SATISFIED | `_elevenlabs_speak` fully implemented; `test_elevenlabs_fallback` passes |
| PYTTS-03 | 75-01, 75-03 | Murf.ai second cloud fallback | SATISFIED | `_murf_speak` fully implemented; `test_murf_fallback` passes |
| PYTTS-04 | 75-01, 75-03 | User can enable local-only mode disabling all cloud providers | SATISFIED | `JarvisConfig.local_only=False` default; `speak()` bypasses cloud when `local_only=True`; `test_local_only_mode` passes |

All 4 requirement IDs assigned to Phase 75 in REQUIREMENTS.md are satisfied. No orphaned requirements.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None | — | — | — |

No stub patterns, placeholder returns, or hardcoded empty values found in any Phase 75 implementation file. The cloud functions (`_elevenlabs_speak`, `_murf_speak`) were stubs in Plan 02 but Plan 03 replaced them with real implementations confirmed present in the final codebase.

One note: `_murf_speak` uses `np` imported but not used in the final function body — `audio_f32 = audio_array.astype(np.float32)` uses it. Not an issue.

---

### Human Verification Required

#### 1. Kokoro Voice Quality on Windows

**Test:** Run `uv run python -m jarvis_desktop`, send a text message, listen to the spoken response.
**Expected:** JARVIS speaks the response in Portuguese (pf_dora voice) with acceptable quality.
**Why human:** Requires audio hardware, Kokoro model download (~350MB on first run), and subjective quality assessment. Cannot verify programmatically.

#### 2. ElevenLabs Cloud Fallback with Real API Key

**Test:** Set `elevenlabs_api_key` in `~/.jarvis/config.json` and `tts_provider=elevenlabs`, then send a message.
**Expected:** JARVIS speaks via ElevenLabs (Rachel voice), prints `[TTS] falando (ElevenLabs)...`.
**Why human:** Requires a valid ElevenLabs API key and real network call. Tests mock the SDK call.

#### 3. Murf Cloud Fallback with Real API Key

**Test:** Set `murf_api_key` and `tts_provider=murf`, then send a message.
**Expected:** JARVIS speaks via Murf.ai (en-US-natalie), prints `[TTS] falando (Murf)...`.
**Why human:** Same reason — requires real API key and network.

#### 4. espeak-ng Missing Warning on Windows (if not installed)

**Test:** On a Windows machine without espeak-ng installed, run `python -m jarvis_desktop`.
**Expected:** Prints `[TTS] espeak-ng não encontrado — voz PT-BR indisponível. Texto exibido normalmente.` and continues without crashing.
**Why human:** espeak-ng may already be installed in the test environment. Cannot verify absence programmatically in isolation.

---

### Gaps Summary

No gaps. All phase must-haves are verified at all four levels (exists, substantive, wired, data flowing). The complete TTS pipeline is implemented and tested:

- Kokoro offline engine singleton (Plans 01-02)
- ElevenLabs and Murf cloud fallback with real SDK implementations (Plan 03)
- local_only=True enforcement (Plans 01, 03)
- chat.py wired to speak after SSE stream completes (Plan 03)
- __main__.py wired to init_tts before chat_loop (Plan 03)
- All 7 TTS unit tests green, plus integration test in test_chat.py
- Full test suite: 23 passed, 0 failed

Phase 75 goal is fully achieved.

---

_Verified: 2026-05-18T20:30:00Z_
_Verifier: Claude (gsd-verifier)_
