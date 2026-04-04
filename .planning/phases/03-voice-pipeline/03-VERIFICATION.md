---
phase: 03-voice-pipeline
verified: 2026-04-04T23:00:00Z
status: passed
score: 8/8 success criteria verified
re_verification:
  previous_status: gaps_found
  previous_score: 7/8
  gaps_closed:
    - "TTS (tts.speak) is now called after the /ptt push-to-talk path — line 231 captures response = await session.send(transcript) and calls tts.speak(response); [falando] state emitted; plan 03-06"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "End-to-end voice pipeline with microphone and speakers"
    expected: "Run python3 -m jarvis --voice with LM Studio running. Type /ptt, speak, press Enter. Observe [escutando] -> [processando] -> [transcricao] -> JARVIS text response -> [falando] -> audible kokoro voice response"
    why_human: "Requires physical microphone, speakers, and live LM Studio connection. Cannot verify audio capture + neural TTS playback programmatically."
  - test: "Wake word end-to-end with WAKE_WORD_ENABLED=true"
    expected: "Run WAKE_WORD_ENABLED=true python3 -m jarvis --voice. Say 'Hey JARVIS'. Observe [wake word]: detectado -> [escutando] -> 3-second recording -> transcription -> JARVIS spoken response"
    why_human: "Requires physical microphone and live openwakeword model download + inference. Cannot verify wake word detection without hardware."
---

# Phase 3: Voice Pipeline Verification Report

**Phase Goal:** Users can speak to JARVIS and hear it respond, with clear state indication throughout
**Verified:** 2026-04-04T23:00:00Z
**Status:** passed
**Re-verification:** Yes — third verification pass (after plan 03-06 closed the /ptt TTS wiring gap)

## Re-Verification Context

Previous verification (2026-04-04T22:30:00Z, score 7/8) found one gap:

- **Gap:** `/ptt` command path in `__main__.py` line 231 called `await session.send(transcript)` without capturing the return value, so `tts.speak()` was never called after PTT recordings. All other voice paths (wake word, `/voice file`, text input) were correctly wired.

Plan 03-06 fixed this gap with a surgical 5-line change:
- Changed line 231 from `await session.send(transcript)` to `response = await session.send(transcript)`
- Added `if tts and response: console.print("[falando]..."); await tts.speak(response)` block
- Added regression test file `tests/test_ptt_tts.py` (164 lines, 4 tests)

This re-verification confirms the gap is closed and no regressions were introduced (162 tests pass).

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can press a key (/ptt or /gravar) to activate mic, speak, and JARVIS transcribes (SC1) | VERIFIED | MicCapture in mic.py (115 lines); /ptt wired in __main__.py lines 197-236; 12 mic tests pass |
| 2 | JARVIS responds by voice via kokoro TTS, streaming sentence by sentence — ALL voice paths including /ptt (SC2) | VERIFIED | 4 tts.speak() call sites: lines 167, 235, 283, 292; /ptt path fixed by 03-06 |
| 3 | JARVIS clearly displays its state (LISTENING/THINKING/SPEAKING) throughout — ALL paths (SC3) | VERIFIED | [escutando] at line 198; [voz]: processando at lines 211/253; [transcricao] at lines 229/275; [falando] at lines 166/234/282/291 |
| 4 | User can say "Hey JARVIS" to activate without pressing a key (SC4) | VERIFIED | WakeWordListener in wake_word.py (133 lines); wired in __main__.py lines 127-176; 9 wake word tests pass |
| 5 | Voice pipeline is fully asynchronous — never blocks terminal (SC5) | VERIFIED | sounddevice callback API; asyncio.to_thread for TTS; asyncio.run_coroutine_threadsafe for wake word callback |

**Score:** 5/5 truths verified

### Plan-Defined Truths (03-03 through 03-06 gap closure plans)

| # | Truth (Plan) | Status | Evidence |
|---|-------------|--------|----------|
| 1 | MicCapture uses sounddevice (not PyAudio) (03-03) | VERIFIED | mic.py line 18: `import sounddevice as sd`; sd.InputStream callback pattern confirmed |
| 2 | Mic capture is async — never blocks event loop (03-03) | VERIFIED | Callback model (background thread); asyncio.to_thread(input) at __main__.py line 202 |
| 3 | State message [escutando] appears when mic is active (03-03) | VERIFIED | __main__.py line 198: `[escutando]: gravando...` |
| 4 | VAD via vad_filter=True filters silence from captured audio (03-03) | VERIFIED | voice.py _transcribe_sync uses vad_filter=True |
| 5 | JARVIS responds by voice using kokoro TTS for ALL paths including /ptt (03-04, 03-06) | VERIFIED | 4 tts.speak() call sites: lines 167, 235, 283, 292 |
| 6 | TTS streams sentence by sentence (03-04) | VERIFIED | _split_sentences() + per-sentence speak() loop in tts.py lines 93-101 |
| 7 | kokoro runs fully offline (03-04) | VERIFIED | KPipeline loaded with lazy init; from kokoro import KPipeline inside _load_pipeline() |
| 8 | TTS async — asyncio.to_thread for synthesis and playback (03-04) | VERIFIED | tts.py lines 98, 101: asyncio.to_thread for both _synthesize_sync and _play_audio_sync |
| 9 | State message [falando] appears when TTS is speaking — ALL paths (03-04, 03-06) | VERIFIED | [falando] at lines 166, 234, 282, 291 — all 4 voice paths confirmed |
| 10 | TTS can be disabled via TTS_ENABLED=false (03-04) | VERIFIED | config.py: `tts_enabled: bool = Field(default=True)`; __main__.py: `if voice_mode and settings.tts_enabled` |
| 11 | User can say "Hey JARVIS" and JARVIS activates (03-05) | VERIFIED | WakeWordListener wired in __main__.py lines 127-176 |
| 12 | Wake word detection runs in background without blocking terminal (03-05) | VERIFIED | asyncio.run_coroutine_threadsafe bridges audio thread to event loop |
| 13 | openwakeword runs fully offline (03-05) | VERIFIED | wake_word.py: inference_framework="onnx" |
| 14 | Wake word enabled/disabled via WAKE_WORD_ENABLED (03-05) | VERIFIED | config.py: `wake_word_enabled: bool = Field(default=False)`; default off (opt-in) |
| 15 | /ptt path captures response and calls tts.speak (03-06) | VERIFIED | __main__.py line 231: `response = await session.send(transcript)`; lines 233-235: TTS block present |
| 16 | Regression test for /ptt TTS wiring exists (03-06) | VERIFIED | tests/test_ptt_tts.py — 164 lines, 4 tests passing |

**Plan truth score:** 16/16 VERIFIED

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/jarvis/core/mic.py` | MicCapture class with sounddevice callback recording | VERIFIED | 115 lines; exports MicCapture; start_recording, stop_recording, record_until_release, is_recording all present |
| `tests/test_mic.py` | Unit tests for MicCapture | VERIFIED | 163 lines; 12 tests passing |
| `src/jarvis/core/tts.py` | KokoroTTS with sentence streaming and lazy loading | VERIFIED | 107 lines; exports KokoroTTS; _split_sentences, speak, speak_sentence all present |
| `tests/test_tts.py` | Unit tests for KokoroTTS | VERIFIED | 178 lines; 18 tests passing |
| `src/jarvis/core/wake_word.py` | WakeWordListener with openwakeword + sounddevice | VERIFIED | 133 lines; exports WakeWordListener; start, stop, is_running present |
| `tests/test_wake_word.py` | Unit tests for WakeWordListener | VERIFIED | 126 lines; 9 tests passing |
| `tests/test_ptt_tts.py` | Regression tests for /ptt TTS wiring (03-06) | VERIFIED | 164 lines; 4 tests passing |
| `src/jarvis/__main__.py` | All voice commands wired: /ptt, /voice, wake word, TTS on all paths | VERIFIED | 4 tts.speak() call sites; 4 [falando] emissions; response = await session.send() pattern in all 3 voice command paths |
| `src/jarvis/config.py` | All new Settings fields: mic, TTS, wake word | VERIFIED | mic_sample_rate, mic_channels, ptt_key, tts_enabled, tts_voice, tts_lang, wake_word_enabled, wake_word_model, wake_word_threshold all confirmed |
| `pyproject.toml` | sounddevice, kokoro, soundfile, numpy, openwakeword deps | VERIFIED | All 5 new dependencies confirmed present and installed |

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/jarvis/core/mic.py` | `sounddevice` | `import sounddevice as sd` (line 18) | WIRED | sd.InputStream callback at lines 62-67; int16 dtype, 16kHz |
| `src/jarvis/__main__.py` | `src/jarvis/core/mic.py` | `from jarvis.core.mic import MicCapture` | WIRED | Instantiated at lines 110-113; used in /ptt path and wake word callback |
| `src/jarvis/core/tts.py` | `kokoro` | `from kokoro import KPipeline` inside `_load_pipeline()` | WIRED | Lazy import confirmed; asyncio.to_thread for synthesis and playback |
| `src/jarvis/__main__.py` | `src/jarvis/core/tts.py` — PTT path | `response = await session.send(transcript)` + `await tts.speak(response)` | WIRED | Lines 231-235: response captured, TTS called (fixed by 03-06) |
| `src/jarvis/__main__.py` | `src/jarvis/core/tts.py` — all 4 paths | 4 call sites: lines 167, 235, 283, 292 | WIRED | Wake word, PTT, /voice file, text input — all 4 paths wired |
| `src/jarvis/core/wake_word.py` | `openwakeword` | `from openwakeword import Model as OWWModel` inside `_load_model()` | WIRED | Lazy import; onnx inference framework; asyncio.run_coroutine_threadsafe callback bridge |
| `src/jarvis/core/wake_word.py` | `sounddevice` | `import sounddevice as sd` (line 17) | WIRED | sd.InputStream callback at lines 113-118; blocksize=1280 (80ms chunks) |
| `src/jarvis/__main__.py` | `src/jarvis/core/wake_word.py` | `from jarvis.core.wake_word import WakeWordListener` | WIRED | Instantiated at lines 169-174; started at line 175; stopped in finally block |

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `mic.py` | `audio_data` (numpy array) | `sd.InputStream` callback → `self._chunks` concatenated | Yes (real sounddevice samples; callback-based) | FLOWING |
| `mic.py` | temp WAV file path | `tempfile.NamedTemporaryFile` + `wave.open` write | Yes (writes real captured audio) | FLOWING |
| `tts.py` | `audio` (numpy array) | `KPipeline(text, voice)` → generator → `np.concatenate` | Yes (real kokoro synthesis; lazy-loaded) | FLOWING |
| `wake_word.py` | `prediction` (dict of model->score) | `oww_model.predict(audio_int16)` | Yes (real openwakeword inference; mocked in tests) | FLOWING |
| `__main__.py` (PTT path) | `response` from session.send | Line 231: `response = await session.send(transcript)` → lines 233-235: `tts.speak(response)` | Yes — captured and forwarded to TTS (fix confirmed) | FLOWING |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 162 tests pass (including 03-06 regression tests) | `PYTHONPATH=src pytest tests/ -x -q` | 162 passed in 21.87s | PASS |
| PTT path captures response (3 voice command paths with response =) | `grep -c "response = await session.send" src/jarvis/__main__.py` | 3 | PASS |
| All 4 voice paths call tts.speak | `grep -c "await tts.speak(response)" src/jarvis/__main__.py` | 4 | PASS |
| All 4 voice paths emit [falando] state | `grep -c "falando" src/jarvis/__main__.py` | 4 | PASS |
| PTT-specific regression tests pass | `PYTHONPATH=src pytest tests/test_ptt_tts.py -v` | 4 passed | PASS |
| All new modules import cleanly | `python3 -c "from jarvis.core.mic import MicCapture; from jarvis.core.tts import KokoroTTS; from jarvis.core.wake_word import WakeWordListener"` | All imports OK | PASS |

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CONV-02 | 03-01, 03-02, 03-03 | Usuário pode falar com o JARVIS via push-to-talk (tecla ativa microfone, Whisper transcreve) | SATISFIED | MicCapture + /ptt CLI wired; mic records at 16kHz, saves to temp WAV, WhisperTranscriber.transcribe() called |
| CONV-03 | 03-02, 03-04, 03-06 | JARVIS responde por voz (TTS neural via kokoro, offline) | SATISFIED | KokoroTTS wired for ALL paths: /ptt (03-06 fix), wake word, /voice file, text input; 4 tts.speak() call sites confirmed |
| CONV-04 | 03-02 | JARVIS indica claramente seu estado: ouvindo / pensando / falando | SATISFIED | [escutando] at line 198; [voz]: processando at lines 211/253; [transcricao] at lines 229/275; [falando] at lines 166/234/282/291 — all 4 voice paths emit full state sequence |
| CONV-05 | 03-02, 03-05 | Usuário pode ativar JARVIS por wake word ("Hey JARVIS") sem precisar pressionar tecla | SATISFIED | WakeWordListener wired; on_wake_word_detected callback triggers record→transcribe→respond→speak |
| ARCH-02 | 03-01, 03-02, 03-03, 03-04, 03-05 | Pipeline de voz e totalmente assincrono (asyncio.Queue) — sem bloqueio na thread principal | SATISFIED | sounddevice callback model; asyncio.to_thread for TTS synthesis + playback; asyncio.to_thread(input) for PTT wait; asyncio.run_coroutine_threadsafe for wake word callback. Implementation uses asyncio.to_thread and callback patterns rather than asyncio.Queue — functionally equivalent and superior for this use case |

### Orphaned Requirements Check

REQUIREMENTS.md Traceability table maps CONV-02, CONV-03, CONV-04, CONV-05, ARCH-02 to Phase 3. All 5 IDs are claimed in plan frontmatter. No orphaned requirements found.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | No anti-patterns found in 03-06 changes | — | — |

The 03-06 fix was surgical: 5 lines added to `__main__.py` and a new test file. No stubs, no placeholders, no TODOs introduced.

## Human Verification Required

### 1. End-to-end PTT voice pipeline

**Test:** Run `python3 -m jarvis --voice` with LM Studio loaded and running. Type `/ptt`, speak a sentence, press Enter.
**Expected:** Console shows `[escutando]: gravando...` during recording, `[voz]: processando audio do microfone...` during transcription, `[transcricao]: "..."` with the spoken text, JARVIS text response, `[falando]...` then audible kokoro voice output through speakers.
**Why human:** Requires physical microphone, speakers, and live LM Studio connection. Cannot verify audio capture + neural TTS playback programmatically.

### 2. Wake word end-to-end

**Test:** Run `WAKE_WORD_ENABLED=true python3 -m jarvis --voice`. Say "Hey JARVIS" into the microphone.
**Expected:** Console shows `[wake word]: detectado` then `[escutando]` then 3-second recording then transcription then JARVIS spoken response.
**Why human:** Requires physical microphone and live openwakeword model download + inference. Cannot verify wake word detection without hardware.

## Gaps Summary

No gaps. All must-haves verified. Phase goal achieved.

The single gap from the previous verification (plan 03-06 target: `/ptt` path discarding `session.send()` return value) has been closed. The fix is confirmed at `__main__.py` line 231 with `response = await session.send(transcript)` and the TTS block at lines 233-235. All four voice paths (wake word, PTT, /voice file, text input) now uniformly capture the LLM response and forward it to `tts.speak()`. The state message `[falando]` is emitted on all four paths. No regressions: 162 tests pass.

---

_Verified: 2026-04-04T23:00:00Z_
_Verifier: Claude (gsd-verifier)_
