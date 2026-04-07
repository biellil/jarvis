---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Desktop UI
status: executing
stopped_at: Completed 12-03-PLAN.md
last_updated: "2026-04-07T12:19:04Z"
last_activity: 2026-04-07
progress:
  total_phases: 8
  completed_phases: 4
  total_plans: 10
  completed_plans: 10
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-06)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.
**Current focus:** Phase 12 — hotkey-text-chat

## Current Position

Phase: 12 (hotkey-text-chat) — EXECUTING
Plan: 3 of 4
Status: Ready to execute
Last activity: 2026-04-07

Progress: [░░░░░░░░░░] 0% (v1.2)

## Performance Metrics

**Velocity:**

- Total plans completed: 2 (v1.2)
- Average duration: -
- Total execution time: 0 hours

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

Contexto herdado do v1.0:

- Config singleton: `from jarvis.config import settings` — nunca ler os.environ diretamente
- asyncio.to_thread() para chamadas bloqueantes (ARCH-02)
- Comunicação Python ↔ Node via HTTP interno (FastAPI)
- Sem auth por enquanto — uso local em rede local

Contexto herdado do v1.1:

- FastAPI 0.135.3 + uvicorn[standard] 0.43.0 — SSE nativo via EventSourceResponse, sem sse-starlette
- Express 5.1 + Node 22 LTS (Node 20 EOL em abril 2026)
- Zod v4 para validação no gateway — nunca misturar com v3
- Single uvicorn worker obrigatório — in-memory session_store quebra com múltiplos workers
- python:3.12-slim como base Docker — nunca Alpine (glibc incompatibility com onnxruntime/ctranslate2)
- `host.docker.internal` + `extra_hosts: host-gateway` para LM Studio a partir dos containers no Linux
- Voice pipeline fica no host, não entra no Docker

Decisões v1.2:

- Electron renderer nunca chama gateway diretamente — tudo via window.jarvis.* → IPC → main → fetch()
- contextIsolation: true + nodeIntegration: false são inegociáveis — estabelecidos no Phase 9 antes de qualquer feature
- MediaRecorder → PCM via AudioContext.decodeAudioData() no renderer antes de enviar (evita C-1 audio format mismatch)
- Windows-only em v1.2 — Mac/Linux ficam para v1.3 (posicionamento e tray têm quirks de plataforma)
- FastAPI port 8000 fica interno — Electron só fala com gateway na porta 3000
- [Phase 11]: Use @vitest-environment directive for React tests instead of environmentMatchGlobs
- [Phase 12]: Default hotkey CmdOrCtrl+Shift+J chosen for low conflict probability
- [Phase 12]: Boolean return from registerHotkey() enables graceful fallback to tray
- [Phase 12]: Use happy-dom instead of jsdom for tests (already installed)
- [Phase 12]: Orb state transitions merged into Task 1 (integral to submit handler)
- [Phase 12]: Fixed 300px window height for speech bubble instead of dynamic resizing via IPC
- [Phase 12]: CSS clip-path for bubble tail (single element, cleaner than pseudo-elements)
- [Phase 12]: Use port 3001 for integration test mock server to avoid conflict with real gateway
- [Phase 12]: 10-second timeout on gateway requests prevents indefinite hang

### Pending Todos

None yet.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260407-cvd | Fix window config test to expect height 300 | 2026-04-07 | 1de325c | .planning/quick/260407-cvd-fix-window-config-test-to-expect-height- |

## Session Continuity

Last session: 2026-04-07T12:19:04Z
Stopped at: Completed quick task 260407-cvd
Resume file: None
| Phase 11 P01 | 387 | 3 tasks | 7 files |
| Phase 11 P02 | 242 | 3 tasks | 4 files |
| Phase 12 P01 | 559 | 3 tasks | 7 files |
| Phase 12 P02 | 15 | 3 tasks | 5 files |
| Phase 12 P04 | 35 | 3 tasks | 6 files |
| Phase 12 P03 | 2418 | 3 tasks | 2 files |
