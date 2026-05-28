---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 84-01-PLAN.md
last_updated: "2026-05-28T14:45:59.483Z"
last_activity: 2026-05-28
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 9
  completed_plans: 7
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-17 — v3.2 started)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.
**Current focus:** Phase 84 — fix-pc-control-python-native-fallback

## Current Position

Milestone: v3.2 — Python Desktop Client
Phase: 84 (fix-pc-control-python-native-fallback) — EXECUTING
Plan: 2 of 3
Status: Ready to execute
Last activity: 2026-05-28
Stopped at: Completed 84-01-PLAN.md

Progress: [██████████] 100%

## Phase Map (v3.2)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 72 | Python Infrastructure Setup | PYSETUP-01..04 | Complete (3/3 plans) |
| 73 | Terminal Chat | PYCHAT-01..03 | Complete (1/1 plans) |
| 74 | Speech-to-Text (STT) | PYSTT-01..03 | Complete (2/2 plans) |
| 75 | Text-to-Speech (TTS) | PYTTS-01..04 | Complete (3/3 plans) |
| 76 | Voice Modes | PYMODE-01..03 | Complete (3/3 plans) |
| 77 | Minimal Terminal UI | PYUI-01..02 | Complete (2/2 plans) |

## Backlog (carry-over de v3.1)

- **999.2** — Testes do app desktop pendentes (cobertura para features entregues sem testes automatizados)
- **999.3** — Linux smoke test (DIST-04 UAT, retoma plan 71-04)
- **999.4** — Windows cross-build + UAT em PC físico (DIST-01/02 UAT, retoma plan 71-05)

## Accumulated Context

### Key Decisions (v3.2)

- Python client is thin HTTP wrapper — LLM/memory stays in backend-ts, no LangChain in Python
- uv for dependency management (not pip/poetry) — faster, lockfile-first
- faster-whisper singleton (not per-request) — model loaded once at startup to avoid cold-start latency
- Kokoro primary TTS → ElevenLabs fallback → Murf fallback (mirrors Electron client behavior)
- Voice modes are mutually exclusive (mirrors VoiceModeManager pattern from v1.9)
- rich for terminal UI — status line + config menu, no GUI window
- venv/ added alongside .venv/ for uv compatibility (uv default is .venv/ but venv/ may also appear)
- GATEWAY_URL documented in .env.example Gateway section matching GATEWAY_PORT=3000
- hatchling as build backend for apps/desktop-py — modern, PEP 517 native, minimal config vs setuptools
- Wave 0 xfail stubs preferred over skip — stubs appear in pytest output and CI counts them
- uv.lock committed (not gitignored) — lockfile-first ensures reproducible installs across machines
- JarvisConfig schema locked at phase 72 — D-07/D-08 compliance; downstream phases add fields never redefine
- load_config() ignores unknown keys in config.json for forward-compatibility with future phases
- check_health() uses stdlib urllib only — no third-party deps
- xfail(strict=False) for Wave 0 chat stubs — appear in CI output without blocking; become passing in Plan 02
- api_key field in JarvisConfig with JARVIS_API_KEY env load; config.json override works via existing model_fields merge
- patch.object(stt_module, 'WhisperModel') preferred over sys.modules patching — faster_whisper already imported at module load time
- threading.Event ptt_triggered used for PTT detection in main loop — avoids blocking input() while listening for hotkey
- listener.stop() in finally block guarantees pynput cleanup on Ctrl+C or any exit path
- murf PyPI package name is 'murf' not 'murf-python-sdk' — auto-fixed during Plan 75-01
- Wave 0 xfail(strict=False) stubs: 7 TTS tests cover PYTTS-01..04 behaviors; become passing in Plan 75-02/03
- uv sync --extra dev required to install pytest in .venv (dev optional deps not synced by default)
- espeak-ng missing caught via RuntimeError string match (D-04) — avoids crashing on Windows without espeak install
- _create_kokoro_engine separated from init_tts for monkeypatching in tests (D-04 test mock point)
- stop_tts() uses threading.Event + sd.stop() for thread-safe interrupt from Phase 76 PTT hotkey (D-11)

### Build Order (strictly serial)

1. Phase 72: Infrastructure (unblocks everything)
2. Phase 73: Terminal Chat (validates gateway integration before adding voice)
3. Phase 74: STT (mic → transcription, before full voice loop)
4. Phase 75: TTS (gateway → speech, completes voice loop with STT)
5. Phase 76: Voice Modes (refactors STT+TTS under state machine)
6. Phase 77: Minimal UI (wraps everything with status + config)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260518-ssb | criar script de diagnóstico SSE que simula envio de mensagem como desktop-py faz, para debugar resposta não aparecendo no terminal | 2026-05-18 | 7b5b22a | [260518-ssb-criar-script-de-diagn-stico-sse-que-simu](.planning/quick/260518-ssb-criar-script-de-diagn-stico-sse-que-simu/) |
| 260524-gqn | fix erro App not found vazio ao abrir pasta | 2026-05-24 | 0ecee74 | [260524-gqn-fix-erro-app-not-found-vazio-ao-abrir-pa](.planning/quick/260524-gqn-fix-erro-app-not-found-vazio-ao-abrir-pa/) |
| 260524-h98 | add whisper.cpp Vulkan backend for AMD GPU (Windows) — subprocess + config dispatch + graceful fallback | 2026-05-24 | 29ffded | [260524-h98-add-whisper-cpp-vulkan-backend-for-amd-g](.planning/quick/260524-h98-add-whisper-cpp-vulkan-backend-for-amd-g/) |
| 260524-l62 | fix open Downloads folder wrong path and message not showing in terminal | 2026-05-24 | c196fab | [260524-l62-fix-open-downloads-folder-wrong-path-and](.planning/quick/260524-l62-fix-open-downloads-folder-wrong-path-and/) |
| 260524-mg6 | fix list_files not implemented, open_file missing, jarvis label on continuation lines | 2026-05-24 | 707965d | [260524-mg6-fix-list-files-not-implemented-open-file](.planning/quick/260524-mg6-fix-list-files-not-implemented-open-file/) |
| 260527-pa8 | corrigir truncamento da resposta JARVIS — sys.stdout.write() com ANSI codes em _read_sse_stream | 2026-05-27 | 7d41198 | [260527-pa8-corrigir-truncamento-da-resposta-jarvis-](.planning/quick/260527-pa8-corrigir-truncamento-da-resposta-jarvis-/) |
| 260527-qmb | fix UnicodeEncodeError when writing emoji characters to stdout on Windows | 2026-05-27 | ebab40a | [260527-qmb-fix-unicodeencodeerror-when-writing-emoj](.planning/quick/260527-qmb-fix-unicodeencodeerror-when-writing-emoj/) |
| 260527-r8z | adicionar LM_OPENAI_MODEL e variáveis do Gemini ao .env e config | 2026-05-27 | f4d17fc | [260527-r8z-adicionar-lm-openai-model-e-vari-veis-do](.planning/quick/260527-r8z-adicionar-lm-openai-model-e-vari-veis-do/) |
| 260527-rgm | desktop-py load_config ler ELEVENLABS_API_KEY e TTS_PROVIDER do env como fallback | 2026-05-27 | fb4f5b7 | [260527-rgm-desktop-py-load-config-ler-elevenlabs-ap](.planning/quick/260527-rgm-desktop-py-load-config-ler-elevenlabs-ap/) |
| 260528-eis | fix ERR_HTTP_HEADERS_SENT in backend-ts errorHandler | 2026-05-28 | 13b8f8d | [260528-eis-fix-err-http-headers-sent-in-backend-ts-](.planning/quick/260528-eis-fix-err-http-headers-sent-in-backend-ts-/) |

### Roadmap Evolution

- Phase 83 added: Quero coloca o langfuse
- Phase 84 added: Fix PC control tools - implement Python-native fallback (open folder, app launch)
- Phase 85 added: Clonagem de voz para o modelo kokoro
- Phase 86 added: Identificação de voz — speaker recognition para contextualizar o LLM

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
- agentic_step_progress=False silences step events by default; task:auto-approved always silent; errors/cancelled always shown regardless of flag (Phase 82 plan 02)
- Confirmation routing block in chat.ts positioned before SSE headers — mutually exclusive with normal LLM stream via early return (Phase 82 plan 03)
- Unrecognized confirmation keyword defaults to cancel — safe default prevents hanging task (Phase 82 plan 03)
- ChatSession._awaitingConfirmation: transient per-task state stored as private field, same pattern as _signalRef/_taskMetaRef (Phase 82 plan 03)
- Dynamic import of @langfuse/langchain inside createLangfuseHandler — zero module load cost when LANGFUSE_ENABLED=false (Phase 83 plan 01)
- npm install @langfuse packages requires --legacy-peer-deps due to zod conflict with @n8n/json-schema-to-zod (Phase 83 plan 01)
- Vitest CallbackHandler mock: vi.fn(function(this,opts){}) constructor function pattern — arrow functions cannot be used with new keyword (Phase 83 plan 01)
- langfuse npm package (not @langfuse/core) for manual spans — @langfuse/core 5.x is REST API client; langfuse has Langfuse class with span() API (Phase 83 plan 03)
- span.end({ level: "ERROR", statusMessage }) is correct LangfuseSpanClient API — docs showed { status: "error" } which doesn't exist in actual SDK (Phase 83 plan 03)
- Separate test files (vectors-langfuse.test.ts, tool-adapter-langfuse.test.ts) for vi.resetModules() pattern — avoids interference with static imports in existing test files (Phase 83 plan 03)
