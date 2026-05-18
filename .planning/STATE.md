---
gsd_state_version: 1.0
milestone: v3.2
milestone_name: Python Desktop Client
status: 🚧 IN PROGRESS — Roadmap defined, ready to plan Phase 72
last_updated: "2026-05-18T00:00:00Z"
last_activity: 2026-05-18 - Roadmap created — 6 phases (72-77), 19 requirements mapped
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-17 — v3.2 started)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.
**Current focus:** v3.2 Python Desktop Client — apps/desktop-py/ thin client Python

## Current Position

Milestone: v3.2 — Python Desktop Client
Phase: 72 — Python Infrastructure Setup (not started)
Plan: —
Status: Ready to plan Phase 72
Last activity: 2026-05-18 — Roadmap created (6 phases, 19/19 requirements mapped)

Progress: [__________] 0% (0/6 phases complete)

## Phase Map (v3.2)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 72 | Python Infrastructure Setup | PYSETUP-01..04 | Not started |
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
- Next step: `/gsd:plan-phase 72` to plan Python Infrastructure Setup
- Backlog 999.2/999.3/999.4 aguardam promoção via `/gsd-review-backlog`
