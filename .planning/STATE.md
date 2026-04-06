---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Desktop UI
status: planning
stopped_at: Phase 9 context gathered
last_updated: "2026-04-06T16:26:48.031Z"
last_activity: 2026-04-06 — Roadmap v1.2 created (Phases 9-13)
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-06)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.
**Current focus:** Phase 9 — Electron Scaffold

## Current Position

Phase: 9 of 13 (Electron Scaffold)
Plan: — (not yet planned)
Status: Ready to plan
Last activity: 2026-04-06 — Roadmap v1.2 created (Phases 9-13)

Progress: [░░░░░░░░░░] 0% (v1.2)

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (v1.2)
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

### Pending Todos

None yet.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|

## Session Continuity

Last session: 2026-04-06T16:26:48.022Z
Stopped at: Phase 9 context gathered
Resume file: .planning/phases/09-electron-scaffold/09-CONTEXT.md
