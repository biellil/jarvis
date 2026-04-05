---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Monorepo + API
status: ready
stopped_at: Roadmap created — ready to plan Phase 6
last_updated: "2026-04-05T00:00:00.000Z"
last_activity: 2026-04-05
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-05)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.
**Current focus:** Milestone v1.1 — Monorepo + API | Phase 6: FastAPI Core

## Current Position

Phase: Phase 6 — FastAPI Core (not started)
Plan: —
Status: Roadmap defined — ready for plan-phase 6
Last activity: 2026-04-05 — Roadmap v1.1 created (3 phases, 15 requirements mapped)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
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

Decisões de v1.1 (research):
- FastAPI 0.135.3 + uvicorn[standard] 0.43.0 — SSE nativo via EventSourceResponse, sem sse-starlette
- Express 5.1 + Node 22 LTS (Node 20 EOL em abril 2026)
- Zod v4 para validação no gateway — novo projeto começa em v4, nunca misturar com v3
- Single uvicorn worker obrigatório — in-memory session_store quebra com múltiplos workers
- Python service exposto apenas via `expose: "8000"` (não `ports:`) — apenas gateway é público
- Voice pipeline fica no host, não entra no Docker — hardware audio pass-through é frágil
- python:3.12-slim como base Docker — nunca Alpine (glibc incompatibility com onnxruntime/ctranslate2)
- `host.docker.internal` + `extra_hosts: host-gateway` para conectar LM Studio a partir dos containers no Linux

### Pending Todos

None yet.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-04-05
Stopped at: Roadmap v1.1 created — next step is `/gsd:plan-phase 6`
Resume file: None
