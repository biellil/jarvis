---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: verifying
stopped_at: Completed 05-02 — Vision pipeline integration into ChatSession
last_updated: "2026-04-05T21:23:13.110Z"
last_activity: 2026-04-05
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 21
  completed_plans: 20
  percent: 25
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-02)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.
**Current focus:** Phase 04 — PC Control

## Current Position

Phase: 04 (PC Control) — EXECUTING
Plan: 3 of 3
Status: Phase complete — ready for verification
Last activity: 2026-04-05

Progress: [███░░░░░░░] 25%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01-foundation P01 | 8 | 2 tasks | 16 files |
| Phase 01-foundation P02 | 25 | 2 tasks | 6 files |
| Phase 01-foundation P03 | 2 | 1 tasks | 6 files |
| Phase 01-foundation P04 | 15 | 2 tasks | 6 files |
| Phase 02-memory P05 | 255 | 1 tasks | 2 files |
| Phase 03-voice-pipeline P01 | 3 | 2 tasks | 4 files |
| Phase 03-voice-pipeline P02 | 4 | 2 tasks | 2 files |
| Phase 03-voice-pipeline P04 | 5 | 2 tasks | 6 files |
| Phase 03-voice-pipeline P03 | 6 | 2 tasks | 5 files |
| Phase 03-voice-pipeline P05 | 4 | 2 tasks | 5 files |
| Phase 03-voice-pipeline P06 | 5 | 2 tasks | 2 files |
| Phase 04-pc-control P02 | 3 | 2 tasks | 5 files |
| Phase 04-pc-control P03 | 7 | 3 tasks | 3 files |
| Phase 05-advanced-features P02 | 45 | 3 tasks | 7 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: ARCH-02 (async voice pipeline) assigned to Phase 3 — it is verifiable only when the voice pipeline is built, not at Foundation phase
- [Phase 01-foundation]: Used setuptools.build_meta (not setuptools.backends.legacy:build) — older setuptools on Debian system requires canonical backend
- [Phase 01-foundation]: Config singleton pattern: import 'from jarvis.config import settings' everywhere — never read os.environ directly
- [Phase 01-foundation]: create_llm() reads module-level settings singleton; tests patch 'jarvis.llm.factory.settings' for isolation — no env var manipulation in tests
- [Phase 01-foundation]: detect_capabilities() is plain function using name heuristics only — no LLM call at startup (D-16); VISION_KEYWORDS and TOOL_KEYWORDS are module-level constants
- [Phase 01-foundation]: sys.platform check isolated to platform/__init__.py only (ARCH-01/D-13)
- [Phase 01-foundation]: Minimal ABC interface (get_os_name only) — Phase 4 will extend with PC control methods
- [Phase 01-foundation]: Tests require PYTHONPATH=src to pick up worktree modules over editable install from /root/jarvis/src
- [Phase 01-foundation]: Token streaming uses plain print(token, end='', flush=True) — Rich is forbidden on output path (D-02) per ChatSession.send()
- [Phase 01-foundation]: validate_lm_studio_reachable catches httpx.ConnectError and httpx.TimeoutException specifically — not all exceptions
- [Phase 02-memory]: User explicitly overrode D-03: ChromaDB query_memories() now active in send() Step 2 (MEM-02 closed)
- [Phase 03-voice-pipeline]: WhisperTranscriber uses asyncio.to_thread() for ARCH-02 compliance — segments consumed inside thread to avoid cross-thread generator leak
- [Phase 03-voice-pipeline]: WhisperModel lazy loading: _model = None at init, loaded in _load_model() on first transcribe() call — avoids startup cost
- [Phase 03-voice-pipeline]: String prefix slicing over split() for path extraction in /voice command — handles spaces in paths correctly
- [Phase 03-voice-pipeline]: argparse only in main(), not at module level — avoids sys.argv side effects during import or testing
- [Phase 03-voice-pipeline]: CONV-03 (TTS) and CONV-05 (wake word) documented as client-deferred via negative module-existence tests
- [Phase 03-voice-pipeline]: KokoroTTS lazy loads 350MB model on first speak(); asyncio.to_thread() for synthesis+playback (ARCH-02); sentence streaming via .!? regex split (SC2)
- [Phase 03-voice-pipeline]: sounddevice callback API for non-blocking mic capture (ARCH-02); asyncio.to_thread for blocking input() offload; temp WAV bridge between MicCapture and WhisperTranscriber
- [Phase 03-voice-pipeline]: openwakeword installed with --no-deps to avoid tflite-runtime conflict on Python 3.12 Linux; onnxruntime already available
- [Phase 03-voice-pipeline]: wake_word_enabled defaults to False — opt-in for continuous background mic (CONV-05 closed)
- [Phase 03-voice-pipeline]: /ptt path captures session.send() return value and calls tts.speak() — matching wake word and /voice file patterns
- [Phase 04-pc-control]: confirm_callback injectable in ActionExecutor — tests use AsyncMock; production uses asyncio.to_thread(input) for ARCH-02 compliance
- [Phase 04-pc-control]: handle_open_app tries direct Popen first, falls back to xdg-open for broader app support
- [Phase 04-pc-control]: TYPE_CHECKING guard for ActionExecutor import in session.py avoids circular import at runtime
- [Phase 04-pc-control]: ChatSession fallback: executor=None returns payload as-is so session is testable without executor
- [Phase 05-advanced-features]: Settings and create_llm imported at module level in session.py for testability — patch targets work correctly
- [Phase 05-advanced-features]: Hot-reload uses Settings() re-instantiation — pydantic-settings reads .env on each new instance without manual polling
- [Phase 05-advanced-features]: Cloud LLM created temporarily only for vision cloud fallback — never replaces self.llm (LLM-03)

### Pending Todos

None yet.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260405-m78 | Add whisper_vad_filter and whisper_beam_size settings | 2026-04-05 | fa8a552 | [260405-m78-add-whisper-vad-filter-and-whisper-beam-](./quick/260405-m78-add-whisper-vad-filter-and-whisper-beam-/) |

### Blockers/Concerns

- Phase 3: Wake word integration (openwakeword + concurrent mic access) flagged as NEEDS RESEARCH — investigate before planning the wake word sub-scope
- Phase 4: Windows and macOS platform backends (pywin32, pyobjc) flagged as NEEDS RESEARCH — investigate OS-specific gotchas before implementing those backends
- Phase 5: Vision LLM capability matrix across local models (Llama/Mistral/Qwen) and openwakeword concurrent process model flagged as NEEDS RESEARCH

## Session Continuity

Last session: 2026-04-05T21:23:13.091Z
Stopped at: Completed 05-02 — Vision pipeline integration into ChatSession
Resume file: None
