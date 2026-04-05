---
phase: 06-fastapi-core
plan: "01"
subsystem: api
tags: [fastapi, uvicorn, pydantic, health-check, lifespan, asynccontextmanager]

# Dependency graph
requires:
  - phase: 05-vision
    provides: ChatSession, MemoryStore, MemoryVectors, ActionExecutor, create_llm, ALL_TOOLS

provides:
  - FastAPI app at jarvis.api:app with global ChatSession via lifespan
  - GET /health liveness probe (API-03) always returning 200
  - GET /health/ready readiness probe (API-04) returning 200/503 based on SQLite+ChromaDB state
  - python -m jarvis.api entrypoint with uvicorn single-worker enforcement
  - Test fixture pattern (conftest.py) with mocked app.state for Plan 02 reuse
  - Settings.api_host and Settings.api_port fields (override via API_HOST/API_PORT in .env)

affects:
  - 06-fastapi-core/06-02 (chat endpoint — reuses conftest fixtures and app)

# Tech tracking
tech-stack:
  added:
    - fastapi==0.135.3
    - uvicorn[standard]==0.43.0
  patterns:
    - FastAPI lifespan pattern for resource lifecycle (asynccontextmanager)
    - Test isolation via lightweight FastAPI test_app without lifespan (no real LLM/DB in tests)
    - app.state for sharing session/db/vectors across request handlers
    - anyio marker for async tests with pytest-asyncio

key-files:
  created:
    - src/jarvis/api/__init__.py
    - src/jarvis/api/__main__.py
    - src/jarvis/api/lifespan.py
    - src/jarvis/api/models.py
    - src/jarvis/api/routes/__init__.py
    - src/jarvis/api/routes/health.py
    - tests/api/__init__.py
    - tests/api/conftest.py
    - tests/api/test_health.py
  modified:
    - pyproject.toml
    - src/jarvis/config.py

key-decisions:
  - "Test isolation via lightweight test_app without lifespan — avoids needing real LLM/DB in unit tests"
  - "ToolLogger created in lifespan alongside MemoryStore for TOOL-05 audit compliance"
  - "workers=1 enforced in __main__.py — in-memory ChatSession breaks with multiple workers"
  - "Readiness check uses existing app.state.vectors._client (never creates new PersistentClient per request)"

patterns-established:
  - "Health route pattern: /health liveness (200), /health/ready readiness (200/503)"
  - "Test fixture pattern: mock_session, mock_db, mock_vectors injected into lightweight test_app"
  - "Lifespan pattern: startup allocates all resources, yield, shutdown saves and closes"

requirements-completed:
  - API-03
  - API-04

# Metrics
duration: 4min
completed: "2026-04-05"
---

# Phase 6 Plan 01: FastAPI Foundation Summary

**FastAPI app with lifespan-managed global ChatSession, health probes (liveness/readiness), uvicorn entrypoint, and isolated test fixtures — 238 tests passing**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-05T00:16:22Z
- **Completed:** 2026-04-05T00:20:07Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- FastAPI app scaffolded at `jarvis.api:app` with asynccontextmanager lifespan initializing ChatSession, MemoryStore, MemoryVectors, and ToolLogger from existing v1.0 subsystems
- Health endpoints implemented: GET /health (API-03, always 200) and GET /health/ready (API-04, 200 when SQLite file exists and ChromaDB heartbeat succeeds, 503 otherwise)
- Test infrastructure established: conftest.py with mock_session/mock_db/mock_vectors fixtures and lightweight test_app pattern that bypasses lifespan — reusable by Plan 02
- Full regression: all 238 tests pass (234 pre-existing + 4 new health tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Instalar dependencias e adicionar Settings de API** - `b3e4efe` (build)
2. **Task 2: Criar modulo API com app, lifespan, health endpoints e testes** - `722b4ab` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `pyproject.toml` — Added fastapi==0.135.3 and uvicorn[standard]==0.43.0 dependencies
- `src/jarvis/config.py` — Added api_host and api_port fields to Settings
- `src/jarvis/api/__init__.py` — FastAPI app with lifespan and health router
- `src/jarvis/api/__main__.py` — python -m jarvis.api entrypoint (workers=1 enforced)
- `src/jarvis/api/lifespan.py` — asynccontextmanager managing ChatSession lifecycle
- `src/jarvis/api/models.py` — ChatRequest and ChatResponse Pydantic models
- `src/jarvis/api/routes/__init__.py` — Empty routes package marker
- `src/jarvis/api/routes/health.py` — GET /health and GET /health/ready endpoints
- `tests/api/__init__.py` — Empty test package marker
- `tests/api/conftest.py` — Shared fixtures (mock_session, mock_db, mock_vectors, client)
- `tests/api/test_health.py` — 4 tests for API-03 and API-04

## Decisions Made

- **Test isolation pattern:** Created a lightweight `test_app` without lifespan instead of patching lifespan — cleaner, no risk of real DB/LLM initialization during tests
- **ToolLogger in lifespan:** ActionExecutor requires ToolLogger (not optional), so lifespan creates and closes it alongside MemoryStore
- **workers=1 enforced:** Documented in `__main__.py` as CRITICAL per D-01 — in-memory ChatSession breaks with multiple workers

## Deviations from Plan

None — plan executed exactly as written.

The plan noted to "verify if ActionExecutor() accepts no-arg constructor or needs ToolLogger" — checked and ActionExecutor requires ToolLogger, so it was created in lifespan as described in the plan's note.

## Issues Encountered

- `pip install -e ".[dev]"` failed due to `tflite-runtime` not available for Python 3.12 on Linux (pre-existing issue with openwakeword). Workaround: installed fastapi and uvicorn directly with `pip install fastapi==0.135.3 "uvicorn[standard]==0.43.0" --break-system-packages`.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 02 (chat endpoint) can reuse conftest fixtures directly — `mock_session`, `mock_db`, `mock_vectors`, and `client` fixture patterns are established
- `app.state.session` is wired and ready for the chat router to use
- FastAPI app structure supports adding new routers via `app.include_router()`

---
*Phase: 06-fastapi-core*
*Completed: 2026-04-05*
