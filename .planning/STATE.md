---
gsd_state_version: 1.0
milestone: v3.2
milestone_name: Python Desktop Client
status: executing
last_updated: "2026-05-18T14:45:00Z"
last_activity: 2026-05-18 -- Phase 72 Plan 02 completed
progress:
  total_phases: 9
  completed_phases: 0
  total_plans: 3
  completed_plans: 2
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-17 — v3.2 started)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.
**Current focus:** Phase 72 — python-infrastructure-setup

## Current Position

Milestone: v3.2 — Python Desktop Client
Phase: 72 (python-infrastructure-setup) — EXECUTING
Plan: 3 of 3 (Plan 02 complete)
Status: Executing Phase 72 — Plans 01 and 02 complete, Plan 03 remaining
Last activity: 2026-05-18 -- Plan 72-02 completed (monorepo wiring: dev:desktop-py + venv/ gitignore + GATEWAY_URL)

Progress: [__________] 0% (0/6 phases complete)

## Phase Map (v3.2)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 72 | Python Infrastructure Setup | PYSETUP-01..04 | Executing (2/3 plans) |
| 73 | Terminal Chat | PYCHAT-01..03 | Not started |
| 74 | Speech-to-Text (STT) | PYSTT-01..03 | Not started |
| 75 | Text-to-Speech (TTS) | PYTTS-01..04 | Not started |
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
- Phase 72 Plan 02 complete — root monorepo wiring done (dev:desktop-py, venv/, GATEWAY_URL)
- Next: Plan 72-03 (remaining Phase 72 tasks)
