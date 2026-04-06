---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Monorepo + API
status: executing
stopped_at: Completed 07-monorepo-express-gateway/07-02-PLAN.md Task 1 — awaiting human verification checkpoint
last_updated: "2026-04-06T00:19:58.243Z"
last_activity: 2026-04-06 -- Phase 07 execution started
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 4
  completed_plans: 4
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-05)

**Core value:** Conversar naturalmente com o JARVIS e ter ele lembrando de tudo — toda interação anterior, preferências, contexto — como um parceiro que nunca esquece.
**Current focus:** Phase 07 — monorepo-express-gateway

## Current Position

Phase: 07 (monorepo-express-gateway) — EXECUTING
Plan: 1 of 2
Status: Executing Phase 07
Last activity: 2026-04-06 -- Phase 07 execution started

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
- [Phase 06-01]: Test isolation via lightweight test_app without lifespan avoids needing real LLM/DB in unit tests
- [Phase 06-01]: workers=1 enforced in uvicorn entrypoint — in-memory ChatSession breaks with multiple workers
- [Phase 06-01]: Readiness check reuses app.state.vectors._client — never creates new PersistentClient per request
- [Phase 06-fastapi-core]: send_stream() uses asyncio.Queue not send() internally — avoids stdout pollution (D-02)
- [Phase 06-fastapi-core]: asyncio.Lock for session concurrency returns 429 immediately — correct for personal use
- [Phase 07-monorepo-express-gateway]: encodeURIComponent(message) on stream query param prevents injection via special chars
- [Phase 07-monorepo-express-gateway]: AbortSignal.timeout(3000) on health probe prevents hanging when Python unreachable
- [Phase 07-monorepo-express-gateway]: res.flushHeaders() before SSE reader loop ensures headers reach client immediately without buffering

### Pending Todos

None yet.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|

| Phase 06-fastapi-core P01 | 4 | 2 tasks | 11 files |
| Phase 06-fastapi-core P02 | 5 | 2 tasks | 6 files |

## Session Continuity

Last session: 2026-04-06T00:19:53.316Z
Stopped at: Completed 07-monorepo-express-gateway/07-02-PLAN.md Task 1 — awaiting human verification checkpoint
Resume file: None
