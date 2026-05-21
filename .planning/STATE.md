---
gsd_state_version: 1.0
milestone: v3.3
milestone_name: Python PC Control & Voice Reliability
status: executing
stopped_at: Completed 80-02-PLAN.md
last_updated: "2026-05-21T18:58:49.553Z"
last_activity: 2026-05-21
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 9
  completed_plans: 8
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-20 — v3.3 started)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.
**Current focus:** Phase 80 — pc-control-system-controls

## Current Position

Milestone: v3.3 — Python PC Control & Voice Reliability
Phase: 80 (pc-control-system-controls) — EXECUTING
Plan: 3 of 3
Status: Ready to execute
Last activity: 2026-05-21
Stopped at: Completed 80-02-PLAN.md

Progress: [░░░░░░░░░░] 67%

## Phase Map (v3.3)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 78 | Voice Reliability & Config | VAD-01..02, CONF-01..03, WGPU-01..03 | Not started |
| 79 | PC Control — App & File | PCTRL-01..06 | Not started |
| 80 | PC Control — System Controls | PCTRL-07..08 | Not started |
| 81 | Custom Wake Word pt-BR | WAKE-01..05 | Not started |

## Backlog (carry-over de v3.1)

- **999.2** — Testes do app desktop pendentes
- **999.3** — Linux smoke test (DIST-04 UAT, retoma plan 71-04)
- **999.4** — Windows cross-build + UAT em PC físico (DIST-01/02 UAT, retoma plan 71-05)

## Accumulated Context

### Key Decisions (v3.3 — pre-execution)

- Zero new deps in main venv — PC Control uses psutil, pyautogui, pynput already installed
- VAD fix is single-line: `Model(wakeword_models=[])` in always_listening mode
- Config atomic write required: temp file + os.replace() + threading.Lock to prevent race on concurrent saves
- Whisper GPU detection order: CUDA → ROCm (detect /opt/rocm) → Metal (detect MPS) → CPU
- ROCm/Metal: no prebuilt ctranslate2 wheels — detect and log warning, fall back to CPU silently
- Wake word training: `uv run` isolated venv (NOT main .venv) to avoid PyTorch 1.13 / TF 2.8 conflicts with Python 3.12
- PC Control: lazy platform imports behind TYPE_CHECKING guard — pywin32/pyobjc never imported on wrong OS
- Audit log: `~/.jarvis/audit.json` append-only (not SQLite) — keeps PC Control self-contained

### Blockers/Concerns

- WAKE-01 specifies `uv run` without Docker; research found openwakeword training deps (PyTorch 1.13 + TF 2.8) incompatible with Python 3.12. Mitigation: isolated uv venv with Python 3.10 via `uv venv --python 3.10`. Verify during Phase 81 planning.

## Session Continuity

**If starting fresh:**

- v3.1 shipped 2026-05-14 — arquivada em `.planning/milestones/v3.1-ROADMAP.md`
- v3.2 roadmap created 2026-05-18 — 6 phases (72-77), 19 requirements
- Plan 72-01 complete 2026-05-18 — apps/desktop-py scaffold with uv.lock, Wave 0 pytest stubs
- Plan 72-02 complete 2026-05-18 — root monorepo wiring done (dev:desktop-py, venv/, GATEWAY_URL)
- Plan 72-03 complete 2026-05-18 — config.py (JarvisConfig + load_config/save_config), health.py, __main__.py; all 5 Wave 0 xfail stubs green
- Phase 72 complete — Next step: Phase 73 terminal chat
- Plan 73-01 complete 2026-05-18 — JarvisConfig api_key field (D-05/D-06), Wave 0 xfail stubs for chat module (test_chat.py); 7 passed + 4 xfailed
- Plan 74-01 complete 2026-05-18 — STT deps (faster-whisper==1.2.1, sounddevice==0.5.5, pynput>=1.7.0), JarvisConfig ptt_key+silence_threshold_ms, 5 xfail stubs
- Plan 74-02 complete 2026-05-18 — stt.py singleton (init_stt, record_until_silence, transcribe, _parse_ptt_hotkey), PTT GlobalHotKeys in chat_loop, init_stt wired in __main__.py; 14 passed + 4 xpassed
- Phase 74 complete — Next step: Phase 75 TTS
- Plan 75-01 complete 2026-05-18 — TTS deps (kokoro>=0.9.4, soundfile, elevenlabs, murf), JarvisConfig TTS fields (kokoro_voice, local_only, elevenlabs_api_key, murf_api_key), 7 xfail Wave 0 stubs, 4 TTS fixtures; 15 passed + 7 xfailed
- Plan 75-02 complete 2026-05-18 — tts.py singleton (init_tts, speak, stop_tts, _kokoro_speak, _create_kokoro_engine, cloud stubs), 4 Kokoro tests now passing (xfail removed); 19 passed + 2 xfailed + 5 xpassed
- Plan 75-03 complete 2026-05-18 — _elevenlabs_speak (ElevenLabs SDK, pcm_24000, Rachel voice) and _murf_speak (Murf SDK, WAV/24kHz, soundfile decode) implemented; chat.py accumulates SSE response and calls speak() after stream (D-01); __main__.py wires init_tts() before chat_loop(); all 7 TTS tests pass + test_stream_response_triggers_tts; 23 passed + 4 xpassed
- Phase 75 complete — Next step: Phase 76 Voice Modes
- Module-level import of speak in chat.py (not lazy) — required for monkeypatching in tests via jarvis_desktop.chat.speak
- Cloud TTS functions return bool (True=success, False=error) for clean fallback chain to Kokoro
- Backlog 999.2/999.3/999.4 aguardam promoção via `/gsd-review-backlog`
- Plan 76-02 complete 2026-05-18 — voice_modes.py (250+ lines) with init_voice_modes, start_mode, stop_mode, switch_mode, get_text_queue, _ptt_loop, _wake_word_loop, _always_listening_loop; 8 tests passing + 1 xfail; full suite 31 passed + 1 xfailed + 4 xpassed
- switch_mode() calls start_mode() which calls _stop_current() — no explicit stop_mode() call in hot-swap path
- Always-listening uses Model(vad_threshold=0.5) with no wakeword_models for pure VAD behavior
- speech_buffer.clear() on TTS block in always_listening_loop prevents TTS echo in buffer (D-06)
- uv override-dependencies for tflite-runtime: openwakeword 0.6.0 requires tflite on Linux but has no cp312 wheels; override restricts to python<3.12
- _is_playing bool flag in tts.py (not _stop_event inversion) — dedicated bool provides unambiguous active-playback signal; try/finally ensures always cleared
- Plan 76-01 complete 2026-05-18 — openwakeword dep + uv override, wake_word_threshold field, is_speaking() in tts.py, Phase 76 conftest fixtures added
- Plan 76-03 complete 2026-05-18 — chat_loop() refactored to poll voice_modes queue (get_nowait + Empty catch); pynput/threading/stt imports removed from chat.py; init_voice_modes(config) wired as Step 5 in __main__.py; xfail test converted to passing; 32 passed + 4 xpassed + 0 failed
- Phase 76 complete — PYMODE-01/02/03 validated. Next: Phase 77 Minimal Terminal UI
- Non-blocking queue poll (get_nowait) before input() is the correct Windows-compatible pattern for voice/keyboard coexistence (select() is Unix-only)
- stop_mode lazily imported inside chat_loop — must be patched at jarvis_desktop.voice_modes.stop_mode in tests, not jarvis_desktop.chat.stop_mode
- Plan 77-01 complete 2026-05-18 — ui.py singleton (init_ui, set_state, set_config, get_console, _build_status_text, cleanup_ui); rich.Live status line [ MODE | MODEL | STATE ]; all print() in tts.py/voice_modes.py/chat.py migrated to console.print(); 8 set_state calls in tts.py, 11 in voice_modes.py; init_ui() as Step 0 in __main__.py; 32 passed + 5 xfailed + 10 xpassed
- Lazy _console() helper pattern (def _console(): from jarvis_desktop import ui; return ui.get_console()) — avoids circular import at module level in tts.py, voice_modes.py, chat.py
- _build_status_text() exposed at module level for unit tests — tests verify status format without a real terminal
- set_state() called inside each provider's try/finally in tts.py — ensures idle state always restored on exceptions
- chat.py adds set_state("thinking") before gateway request — covers 4th state transition (D-04)
- Plan 77-02 complete 2026-05-18 — /config command detection in chat_loop(), _handle_command(), _show_config_menu(), 3 menu helpers; stt.reload_model() + tts.set_provider() for runtime hot-swap; 32 passed + 15 xpassed
- config.tts_provider explicitly set in _menu_tts_provider() after set_provider() — ensures field update even when set_provider is mocked in tests
- ASCII separator (-) used in config menu instead of Unicode box-drawing — avoids UnicodeEncodeError on Windows cp1252 terminals
- Phase 77 complete — PYUI-01 + PYUI-02 validated. Phase 77 delivered; v3.2 milestone complete
- Plan 78-01 complete 2026-05-21 — VAD-01: wakeword_models=["hey_jarvis"] fixes ONNXRuntimeError in always_listening; VAD-02: deque(maxlen=7) pre-roll captures ~560ms before speech onset; 11 voice_modes tests pass; 34 passed total
- wakeword_models=["hey_jarvis"] required even in always_listening mode — openwakeword loads ALL pre-trained models without at least one explicit model arg
- rich.Live.start() must NOT be called from daemon threads on Windows — hangs on terminal size detection; removed startup print from _always_listening_loop
- daemon thread import safety: pre-import modules in main thread via monkeypatch.setattr() before spawning daemon thread to avoid Python import lock deadlock
- Plan 78-02 complete 2026-05-21 — CONF-01: atomic save_config() with threading.Lock + NamedTemporaryFile + os.replace(); CONF-02/03: whisper_model_locked: bool = False field in JarvisConfig; 36 passed + 1 xfailed + 14 xpassed
- Plan 78-03 complete 2026-05-20 — WGPU-01/02/03: _detect_device() CUDA/CPU; _select_model_for_device() VRAM tiers (tiny/base/large-v3-turbo); init_stt(config) replaces init_stt(model_size); CPU fallback on device init failure; __main__.py passes full config; 44 passed + 1 xfailed + 14 xpassed
- init_stt(config) requires full JarvisConfig — torch imported lazily inside _detect_device/_query_vram_mb (no hard dep)
- _load_model_with_progress(model_size, device) accepts device param — CPU fallback retry goes through same download UI
