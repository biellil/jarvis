---
phase: 06-fastapi-core
verified: 2026-04-05T00:00:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Start server and hit endpoints with curl"
    expected: "`python3 -m jarvis.api` starts on port 8000; `curl http://localhost:8000/health` returns {\"status\":\"ok\"}; `curl http://localhost:8000/chat/stream?message=oi` delivers tokens incrementally in a terminal SSE client"
    why_human: "Cannot start a live uvicorn server in verification; incremental SSE delivery requires real HTTP streaming and cannot be confirmed by inspecting static response bodies in test suite"
---

# Phase 06: FastAPI Core Verification Report

**Phase Goal:** O core Python do JARVIS está acessível via HTTP com suporte a respostas completas, streaming SSE token-a-token e health probes para orquestradores externos
**Verified:** 2026-04-05
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | `GET /health` retorna `{"status": "ok"}` com HTTP 200 | VERIFIED | `health.py` line 20-22; `test_health_liveness` passes |
| 2  | `GET /health/ready` retorna 200 quando SQLite e ChromaDB estao operacionais | VERIFIED | `health.py` line 25-52; `test_health_ready_ok` passes |
| 3  | `GET /health/ready` retorna 503 quando backing store nao disponivel | VERIFIED | `health.py` `HTTPException(status_code=503)`; `test_health_ready_sqlite_missing` and `test_health_ready_chromadb_down` pass |
| 4  | `python -m jarvis.api` inicia uvicorn na porta 8000 | VERIFIED | `__main__.py` calls `uvicorn.run("jarvis.api:app", host=settings.api_host, port=settings.api_port, workers=1)`; `settings.api_port == 8000` confirmed |
| 5  | FastAPI app existe com lifespan gerenciando ChatSession global | VERIFIED | `__init__.py` `app = FastAPI(title="JARVIS API", lifespan=lifespan)`; `lifespan.py` sets `app.state.session`, `app.state.db`, `app.state.vectors` |
| 6  | `POST /chat` com `{"message":"oi"}` retorna JSON com response text do JARVIS | VERIFIED | `chat.py` `@router.post("/chat", response_model=ChatResponse)`; `test_chat_post` passes |
| 7  | `POST /chat` com body vazio ou sem campo message retorna 422 | VERIFIED | Pydantic `ChatRequest(message: str)` enforces required field; `test_chat_post_empty_body` and `test_chat_post_missing_message` pass |
| 8  | `GET /chat/stream?message=oi` retorna `text/event-stream` com tokens incrementais | VERIFIED | `chat.py` `@router.get("/chat/stream", response_class=EventSourceResponse)`; `test_chat_stream_content_type` and `test_chat_stream_tokens` pass |
| 9  | `send_stream()` no ChatSession yield tokens como async generator sem print() | VERIFIED | `session.py` line 347; `asyncio.Queue` bridge pattern; `test_send_stream_yields_tokens`, `test_send_stream_no_print`, `test_send_stream_concatenation`, `test_send_stream_error_propagation` pass |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/jarvis/api/__init__.py` | FastAPI app with lifespan and routers | VERIFIED | Exports `app`; includes `health_router` and `chat_router`; wired to `lifespan` |
| `src/jarvis/api/lifespan.py` | Lifespan context manager creating global ChatSession | VERIFIED | `@asynccontextmanager async def lifespan`; sets `app.state.session/db/vectors`; yield present; shutdown closes db and tool_logger |
| `src/jarvis/api/routes/health.py` | Health check endpoints | VERIFIED | `router = APIRouter()`; `@router.get("/health")` and `@router.get("/health/ready")`; `HTTPException(status_code=503)` on failure |
| `src/jarvis/api/models.py` | Pydantic request/response models | VERIFIED | `class ChatRequest(BaseModel): message: str` and `class ChatResponse(BaseModel): message: str` |
| `src/jarvis/api/__main__.py` | `python -m jarvis.api` entrypoint | VERIFIED | `uvicorn.run("jarvis.api:app", ...)` with `workers=1` and settings-sourced host/port |
| `src/jarvis/api/routes/chat.py` | POST /chat and GET /chat/stream endpoints | VERIFIED | `EventSourceResponse`, `ServerSentEvent`, `asyncio.Lock`, `HTTPException(status_code=429)`, calls `session.send()` and `session.send_stream()` |
| `src/jarvis/core/session.py` | `send_stream()` async generator method | VERIFIED | `async def send_stream(self, user_input: str) -> AsyncGenerator[str, None]`; `asyncio.Queue` bridge; sentinel `None` in `finally`; no `print()` call |
| `tests/api/conftest.py` | Shared fixtures for API tests | VERIFIED | `mock_session`, `mock_db`, `mock_vectors`, `client` fixtures; lightweight `test_app` without lifespan; includes both routers |
| `tests/api/test_health.py` | Unit tests for health endpoints | VERIFIED | `test_health_liveness`, `test_health_ready_ok`, `test_health_ready_sqlite_missing`, `test_health_ready_chromadb_down` — all pass |
| `tests/api/test_chat.py` | Endpoint tests for API-01 and API-02 | VERIFIED | `test_chat_post`, `test_chat_post_empty_body`, `test_chat_post_missing_message`, `test_chat_stream_content_type`, `test_chat_stream_tokens`, `test_chat_stream_missing_message` — all pass |
| `tests/api/test_stream.py` | Unit tests for `send_stream()` | VERIFIED | `test_send_stream_yields_tokens`, `test_send_stream_concatenation`, `test_send_stream_no_print`, `test_send_stream_error_propagation`, `test_send_stream_empty_tokens_skipped` — all pass |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/jarvis/api/__init__.py` | `src/jarvis/api/lifespan.py` | `lifespan` arg in `FastAPI()` | WIRED | `from jarvis.api.lifespan import lifespan` then `app = FastAPI(title="JARVIS API", lifespan=lifespan)` |
| `src/jarvis/api/routes/health.py` | `app.state` | `request.app.state.vectors` | WIRED | `vectors = request.app.state.vectors` then `vectors._client.heartbeat()` |
| `src/jarvis/api/routes/chat.py` | `src/jarvis/core/session.py` | `request.app.state.session.send()` and `.send_stream()` | WIRED | `session = request.app.state.session`; `await session.send(body.message)`; `async for token in session.send_stream(message)` |
| `src/jarvis/api/routes/chat.py` | `fastapi.sse` | `EventSourceResponse` for SSE | WIRED | `from fastapi.sse import EventSourceResponse, ServerSentEvent`; used as `response_class` and `yield ServerSentEvent(data=token)` |
| `src/jarvis/api/__init__.py` | `src/jarvis/api/routes/chat.py` | `app.include_router(chat_router)` | WIRED | `from jarvis.api.routes.chat import router as chat_router`; `app.include_router(chat_router)` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `chat.py` POST /chat | `response_text` | `session.send(body.message)` — real `ChatSession` method wired via lifespan | Yes — delegates to LangChain LLM pipeline | FLOWING |
| `chat.py` GET /chat/stream | `token` (yielded) | `session.send_stream(message)` — real `AsyncGenerator` via `asyncio.Queue` + LLM `astream()` | Yes — yields actual LLM chunks | FLOWING |
| `health.py` GET /health/ready | `errors` list | `request.app.state.vectors._client.heartbeat()` and `Path(settings.sqlite_path).exists()` | Yes — real I/O against ChromaDB client and filesystem | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All API tests pass | `python3 -m pytest tests/api/ -q` | 17 passed in 9.59s | PASS |
| Full regression — 251 tests pass | `python3 -m pytest tests/ -q` | 251 passed in 21.29s | PASS |
| App routes include all 4 HTTP routes | `python3 -c "from jarvis.api import app; print([r.path for r in app.routes])"` | `['/health', '/health/ready', '/chat', '/chat/stream', ...]` | PASS |
| Settings has api_host and api_port with correct defaults | `python3 -c "from jarvis.config import settings; print(settings.api_host, settings.api_port)"` | `0.0.0.0 8000` | PASS |
| `send_stream` exists on ChatSession | `grep "async def send_stream" src/jarvis/core/session.py` | line 347 found | PASS |
| `workers=1` enforced in entrypoint | `grep "workers=1" src/jarvis/api/__main__.py` | confirmed present | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| API-01 | 06-02-PLAN.md | Usuário pode enviar mensagem e receber resposta completa via `POST /chat` | SATISFIED | `chat.py` `@router.post("/chat", response_model=ChatResponse)`; delegates to `session.send()`; 3 tests cover happy path + 422 validation |
| API-02 | 06-02-PLAN.md | Usuário pode receber tokens em streaming via `GET /chat/stream` com SSE token-by-token | SATISFIED | `chat.py` `@router.get("/chat/stream", response_class=EventSourceResponse)`; yields `ServerSentEvent(data=token)` from `session.send_stream()`; `send_stream()` uses `asyncio.Queue` + `llm.astream()`; tests confirm `text/event-stream` content-type and token presence |
| API-03 | 06-01-PLAN.md | Sistema externo pode verificar se serviço está vivo via `GET /health` | SATISFIED | `health.py` liveness endpoint always returns `{"status": "ok"}` with 200; `test_health_liveness` passes |
| API-04 | 06-01-PLAN.md | Sistema externo pode verificar se serviço está pronto via `GET /health/ready` | SATISFIED | `health.py` readiness endpoint returns 200 when SQLite exists and ChromaDB heartbeat succeeds, 503 otherwise; all 3 readiness tests pass |

All four requirements confirmed `[x]` in `.planning/REQUIREMENTS.md`. No orphaned requirements for Phase 6.

---

### Anti-Patterns Found

No anti-pattern markers (TODO, FIXME, HACK, PLACEHOLDER, return null, hardcoded empty data) were found in any of the phase files. The `send()` method in `session.py` retains its `print()` calls for stdout streaming — this is intentional behavior for CLI mode and explicitly documented in the codebase (D-02 per RESEARCH). `send_stream()` contains no `print()` calls, as required.

---

### Human Verification Required

#### 1. Live server startup and HTTP round-trip

**Test:** Run `python3 -m jarvis.api` and in a second terminal: `curl http://localhost:8000/health`
**Expected:** `{"status":"ok"}` with HTTP 200
**Why human:** Cannot start a live uvicorn server in static verification

#### 2. SSE incremental token delivery

**Test:** With server running, open an SSE client: `curl -N "http://localhost:8000/chat/stream?message=oi"`
**Expected:** Tokens arrive one-by-one (incrementally), not as a single bulk response. Content-Type header is `text/event-stream`
**Why human:** Test suite uses httpx which collects the full response body after stream completion. Incremental delivery requires observing real HTTP chunked transfer in a terminal

---

### Gaps Summary

No gaps. All 9 observable truths are verified, all artifacts are substantive and wired, all key data flows connect to real implementations (not stubs or empty returns), and all 4 requirements (API-01 through API-04) are satisfied with passing tests.

The 251-test full regression suite confirms no regressions were introduced into pre-existing functionality. The only items deferred to human verification are live server startup and real-time SSE delivery — both expected limitations of static analysis.

---

_Verified: 2026-04-05_
_Verifier: Claude (gsd-verifier)_
