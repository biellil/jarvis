---
gsd_state_version: 1.0
milestone: v3.2
milestone_name: Python Desktop Client
status: verifying
last_updated: "2026-05-18T20:01:58.930Z"
last_activity: 2026-05-18
progress:
  total_phases: 9
  completed_phases: 4
  total_plans: 10
  completed_plans: 10
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-17 — v3.2 started)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.
**Current focus:** Phase 76 — voice-modes

## Current Position

Milestone: v3.2 — Python Desktop Client
Phase: 75 (text-to-speech-tts) — COMPLETE
Plan: 3 of 3 (all complete)
Status: Phase 75 complete — next: Phase 76 Voice Modes
Last activity: 2026-05-18

Progress: [██████████] 100%

## Phase Map (v3.2)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 72 | Python Infrastructure Setup | PYSETUP-01..04 | Complete (3/3 plans) |
| 73 | Terminal Chat | PYCHAT-01..03 | Complete (1/1 plans) |
| 74 | Speech-to-Text (STT) | PYSTT-01..03 | Complete (2/2 plans) |
| 75 | Text-to-Speech (TTS) | PYTTS-01..04 | Complete (3/3 plans) |
| 76 | Voice Modes | PYMODE-01..03 | Not started |
| 77 | Minimal Terminal UI | PYUI-01..02 | Not started |

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
