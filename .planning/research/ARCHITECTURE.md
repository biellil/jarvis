# Architecture Patterns: FastAPI + Express Gateway + Docker Compose

**Domain:** Monorepo Python/Node.js hybrid — adding HTTP API layer to existing LangChain assistant
**Researched:** 2026-04-05 (v1.1 milestone update)
**Overall confidence:** HIGH (FastAPI SSE, Docker networking, session store) / MEDIUM (Express SSE proxy, monorepo pnpm+Python)

---

## Executive Summary

v1.1 adds three integration layers on top of the working v1.0 Python core. The key architectural insight is that **zero existing Python modules need to change their public interface** — the new `src/jarvis/api/` module wraps existing classes as-is. The only required change to existing code is one additive method on `ChatSession` (a `stream()` async generator) and two new config fields in `Settings`.

All 234 existing tests must continue passing. The CLI entry point (`python -m jarvis`) is untouched.

---

## System Topology

```
                        EXTERNAL CLIENTS
                    (browser, mobile, curl)
                              |
                    ┌─────────────────────┐
                    │  packages/gateway/  │  Node 20 + Express TS
                    │  PORT 3000 (public) │  public-facing API
                    │  - rate limiting    │
                    │  - auth (future)    │
                    │  - REST → FastAPI   │
                    │  - SSE passthrough  │
                    └─────────────────────┘
                              |
                    internal Docker network (jarvis-net)
                    service name: python-service:8000
                              |
                    ┌─────────────────────┐
                    │  src/jarvis/api/    │  Python + FastAPI
                    │  PORT 8000          │  internal only (no host binding)
                    │  - POST /chat       │
                    │  - GET /chat/stream │
                    │  - DELETE /sessions │
                    │  - GET /health      │
                    └─────────────────────┘
                              |
                    ┌─────────────────────┐
                    │  src/jarvis/core/   │  EXISTING — UNCHANGED
                    │  ChatSession        │  (send() untouched)
                    │  MemoryStore        │
                    │  MemoryVectors      │
                    │  ActionExecutor     │
                    └─────────────────────┘
                              |
                    ┌─────────────────────┐
                    │  data/              │  Docker volume mount
                    │  jarvis.db          │  SQLite (shared)
                    │  chroma/            │  ChromaDB (shared)
                    └─────────────────────┘
```

---

## Monorepo Structure

```
jarvis/                               ← git root (EXISTING)
├── pnpm-workspace.yaml               ← NEW: pnpm workspace definition
├── package.json                      ← NEW: root scripts only, no runtime deps
├── pyproject.toml                    ← UNCHANGED: Python build config
├── src/
│   └── jarvis/
│       ├── api/                      ← NEW MODULE: FastAPI HTTP layer
│       │   ├── __init__.py
│       │   ├── app.py                ← FastAPI app + lifespan
│       │   ├── session_store.py      ← In-memory session registry
│       │   └── routes/
│       │       ├── chat.py           ← POST /chat, GET /chat/stream
│       │       └── health.py         ← GET /health, GET /ready
│       ├── config.py                 ← MODIFIED: +api_host, +api_port fields only
│       ├── core/
│       │   └── session.py            ← MODIFIED: +stream() async generator only
│       └── [all other modules]       ← UNCHANGED
├── packages/
│   └── gateway/                      ← NEW: Express TS gateway package
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts              ← Express app entry point
│       │   ├── config.ts             ← env-driven config (PYTHON_SERVICE_URL)
│       │   ├── routes/
│       │   │   └── chat.ts           ← proxy routes to FastAPI
│       │   └── middleware/
│       │       └── sse.ts            ← SSE header setup + raw pipe
│       └── dist/                     ← compiled TS output (gitignored)
├── docker/
│   ├── python.Dockerfile             ← NEW: FastAPI service image
│   └── node.Dockerfile               ← NEW: Gateway service image
├── docker-compose.yml                ← NEW: Production compose
├── docker-compose.override.yml       ← NEW: Dev overrides (volume mounts)
└── data/                             ← UNCHANGED: SQLite + ChromaDB
```

**pnpm-workspace.yaml:**
```yaml
packages:
  - "packages/*"
```

Python remains at repo root. pnpm manages only `packages/` Node packages. Root `package.json` contains convenience scripts (`dev:gateway`, `build:gateway`, `docker:up`) with no runtime dependencies.

---

## Component Boundaries

| Component | Responsibility | Communicates With | Status |
|-----------|---------------|-------------------|--------|
| `src/jarvis/api/app.py` | FastAPI app, lifespan startup, shared singletons | ChatSession, MemoryStore | NEW |
| `src/jarvis/api/session_store.py` | Dict `session_id → ChatSession`, create/get/delete | app.py lifespan | NEW |
| `src/jarvis/api/routes/chat.py` | POST /chat (non-streaming), GET /chat/stream (SSE) | session_store | NEW |
| `src/jarvis/api/routes/health.py` | GET /health returns `{"status": "ok"}` | none | NEW |
| `packages/gateway/src/routes/chat.ts` | Proxy /chat to FastAPI; raw-pipe /chat/stream | python-service:8000 | NEW |
| `packages/gateway/src/middleware/sse.ts` | Set SSE headers, call flushHeaders(), pipe stream | res, upstream HTTP | NEW |
| `src/jarvis/core/session.py` | NEW `stream()` async generator yielding tokens | llm.astream() | MODIFIED (additive) |
| `src/jarvis/config.py` | +`api_host`, +`api_port` fields | Settings singleton | MODIFIED (additive) |
| `src/jarvis/core/session.py` (existing) | send(), save(), _maybe_compress() | LLM, MemoryStore | UNCHANGED |
| `src/jarvis/__main__.py` | CLI entry point | ChatSession | UNCHANGED |
| All tools, memory, executor, platform | Unchanged | — | UNCHANGED |

---

## Integration Points: New vs Modified vs Unchanged

### New (net-new code, zero existing files touched)

| File | Description |
|------|-------------|
| `src/jarvis/api/__init__.py` | Package init |
| `src/jarvis/api/app.py` | FastAPI app with lifespan; mirrors `__main__.py` wiring |
| `src/jarvis/api/session_store.py` | Module-level `sessions: dict[str, ChatSession]` registry |
| `src/jarvis/api/routes/chat.py` | POST /chat + GET /chat/stream SSE |
| `src/jarvis/api/routes/health.py` | GET /health |
| `packages/gateway/` (entire package) | Express TS gateway |
| `docker/python.Dockerfile` | Python 3.12-slim + uvicorn entrypoint |
| `docker/node.Dockerfile` | Node 20-slim + pnpm gateway entrypoint |
| `docker-compose.yml` | Two services, `jarvis-net` bridge, data volume |
| `docker-compose.override.yml` | Dev: volume mounts, hot-reload |
| `pnpm-workspace.yaml` | pnpm workspace root |
| `package.json` (root) | Convenience scripts only |

### Modified (existing files — additive only, no behavior changes)

| File | Change | Risk |
|------|--------|------|
| `src/jarvis/config.py` | Add `api_host: str = "0.0.0.0"` and `api_port: int = 8000` fields | LOW — new fields with defaults, `Settings()` backward compatible |
| `src/jarvis/core/session.py` | Add `stream()` async generator method | LOW — pure addition, `send()` untouched |
| `pyproject.toml` | Add `fastapi`, `uvicorn[standard]` to dependencies | LOW — install-time only |

### Unchanged

Every other file in `src/jarvis/`. Every file in `tests/`. `__main__.py`. All tools, memory, executor, platform modules. CLI behavior identical.

---

## Data Flow

### Non-Streaming (POST /chat)

```
Client
  POST /chat  { session_id?, message }
  → Express gateway :3000
  → forward to FastAPI :8000/chat
  → FastAPI route handler
  → session_store.get_or_create(session_id) → ChatSession
  → await session.send(message)   [blocks until response complete]
  ← { session_id, response } JSON
  ← 200 JSON through gateway to client
```

### Streaming (GET /chat/stream with SSE)

```
Client
  GET /chat/stream?session_id=X&message=Y
  → Express gateway :3000
     sets: Content-Type: text/event-stream
     sets: Cache-Control: no-cache
     sets: X-Accel-Buffering: no
     calls: res.flushHeaders()        ← critical: headers before first data
     pipes: upstreamResponse → res    ← raw bytes, no JSON parsing
  → FastAPI SSE endpoint :8000/chat/stream
     session_store.get_or_create(session_id)
     async for token in session.stream(message):
         yield ServerSentEvent(data=token, event="token")
     yield ServerSentEvent(data="[DONE]", event="done")
  ← tokens flow: FastAPI → Express (zero buffering) → Client
```

### SSE Wire Format

```
event: session
data: {"session_id": "550e8400-e29b-41d4-a716-446655440000"}

event: token
data: Hello

event: token
data:  there

event: token
data: !

event: done
data: [DONE]
```

Client stores `session_id` from the first `session` event and sends it on subsequent requests to maintain conversation continuity.

### Session Lifecycle

```
CREATE:
  First request with missing or unknown session_id
  → session_store.get_or_create() calls factory_fn()
  → factory_fn() closes over shared llm/db/vectors/executor (initialized at lifespan)
  → new ChatSession(llm, db=db, vectors=vectors, tools=ALL_TOOLS, executor=executor)
  → sessions[new_uuid] = chat_session
  → session_id returned to client

REUSE:
  Subsequent requests with same session_id
  → session_store.get(session_id) returns existing ChatSession
  → ChatSession.history preserved in-memory (in-process dict)

CLEANUP (explicit):
  DELETE /sessions/{session_id}
  → await session.save()    (persist to SQLite + ChromaDB)
  → sessions.pop(session_id)
  → GC reclaims ChatSession resources

CLEANUP (shutdown):
  lifespan context manager `finally` block:
  → for session in sessions.values(): await session.save()
  → db.close()
  → tool_logger.close()
```

---

## New Module: `src/jarvis/api/`

### `session_store.py`

In-memory session registry. Single-user assistant: no auth, no user scoping required.

```python
import uuid
from typing import Optional, Callable
from jarvis.core.session import ChatSession

# Module-level — persists across requests in the same process
sessions: dict[str, ChatSession] = {}

def get_or_create(
    session_id: Optional[str],
    factory_fn: Callable[[], ChatSession],
) -> tuple[str, ChatSession]:
    if session_id and session_id in sessions:
        return session_id, sessions[session_id]
    new_id = session_id or str(uuid.uuid4())
    sessions[new_id] = factory_fn()
    return new_id, sessions[new_id]

def get(session_id: str) -> Optional[ChatSession]:
    return sessions.get(session_id)

def delete(session_id: str) -> Optional[ChatSession]:
    return sessions.pop(session_id, None)
```

`factory_fn` is a closure provided by `app.py` lifespan. It captures already-initialized shared singletons (`llm`, `db`, `vectors`, `executor`). All sessions share the same `MemoryStore` and `MemoryVectors` instances (SQLite WAL mode handles concurrent reads; writes are serialized). Each session has its own `ChatSession` instance with its own `history` list.

### `app.py`

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
import os

_shared: dict = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — mirrors __main__.py wiring exactly
    os.makedirs(os.path.dirname(settings.sqlite_path) or ".", exist_ok=True)
    os.makedirs(settings.chroma_path, exist_ok=True)
    llm = create_llm()
    model_id = settings.lm_studio_model or settings.llm_model
    caps = detect_capabilities(settings.lm_studio_url, model_id) if model_id else None
    db = MemoryStore(settings.sqlite_path)
    vectors = MemoryVectors(settings.chroma_path)
    tool_logger = ToolLogger(settings.sqlite_path)
    executor = ActionExecutor(tool_logger)
    _shared.update({"llm": llm, "caps": caps, "db": db,
                    "vectors": vectors, "executor": executor,
                    "tool_logger": tool_logger})
    yield
    # Shutdown — save all open sessions, close connections
    from jarvis.api import session_store
    for session in session_store.sessions.values():
        await session.save()
    db.close()
    tool_logger.close()

app = FastAPI(lifespan=lifespan, title="JARVIS API")
app.include_router(chat_router, prefix="/chat")
app.include_router(health_router)
```

### `routes/chat.py` (SSE endpoint)

```python
from fastapi.sse import EventSourceResponse, ServerSentEvent
from typing import AsyncIterable

@router.get("/stream", response_class=EventSourceResponse)
async def chat_stream(
    session_id: str | None = None,
    message: str = "",
) -> AsyncIterable[ServerSentEvent]:
    sid, session = session_store.get_or_create(session_id, _make_session)
    yield ServerSentEvent(
        data=json.dumps({"session_id": sid}),
        event="session"
    )
    async for token in session.stream(message):
        yield ServerSentEvent(data=token, event="token")
    yield ServerSentEvent(data="[DONE]", event="done")
```

FastAPI >= 0.135.0 has SSE built into `fastapi.sse` — no `sse-starlette` or other external library needed. `EventSourceResponse` automatically handles:
- Keep-alive pings every 15 seconds (prevents proxy timeouts)
- `Cache-Control: no-cache` header
- `X-Accel-Buffering: no` header

**Confidence:** HIGH — verified against official FastAPI docs (fastapi.tiangolo.com/tutorial/server-sent-events/)

### Addition to `ChatSession`: `stream()` method

The only change required to existing code. `send()` remains 100% unchanged.

```python
# Added to src/jarvis/core/session.py — after the existing send() method

async def stream(
    self,
    user_input: str,
    image: str | None = None,
) -> AsyncGenerator[str, None]:
    """Yield LLM response tokens for HTTP streaming callers.

    Does NOT print to stdout. History updates, memory injection,
    compression, and profile extraction are identical to send().
    Callers receive one string per LLM token chunk.

    Added in v1.1 for FastAPI SSE endpoint. CLI continues using send().
    """
    # [identical preprocessing to send(): hot-reload, compression,
    #  system prompt augmentation, memory injection, HumanMessage build]
    # ...
    async for chunk in llm_to_use.astream(messages_to_send):
        if chunk.content:
            yield chunk.content   # yield instead of print()
    # [identical postprocessing: save messages, profile extraction]
```

`send()` can optionally call `stream()` internally to avoid code duplication, or maintain its own loop — either approach is valid. The key constraint: `send()` signature and behavior are identical to v1.0 for all existing callers.

---

## Patterns to Follow

### Pattern 1: FastAPI Native SSE (no external library)

```python
from fastapi.sse import EventSourceResponse, ServerSentEvent
from typing import AsyncIterable

@router.get("/stream", response_class=EventSourceResponse)
async def stream_endpoint(message: str) -> AsyncIterable[ServerSentEvent]:
    async for token in session.stream(message):
        yield ServerSentEvent(data=token, event="token")
    yield ServerSentEvent(data="[DONE]", event="done")
```

FastAPI >= 0.135.0 required. No `sse-starlette`, no custom `StreamingResponse`. Built-in.

### Pattern 2: Express SSE Passthrough (raw pipe, no buffering)

The Express gateway does NOT reconstruct or parse SSE frames. It raw-pipes the HTTP stream from FastAPI to the client. Buffering would break streaming.

```typescript
// packages/gateway/src/middleware/sse.ts
import http from "http";
import { Request, Response } from "express";

export function ssePipe(req: Request, res: Response, targetUrl: string): void {
  // Set SSE headers before piping — headers must arrive before data
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();  // critical: flush headers before first chunk

  const upstream = http.get(targetUrl, (upstreamRes) => {
    upstreamRes.pipe(res);  // raw byte pipe — no JSON parsing
  });

  upstream.on("error", (err) => {
    if (!res.headersSent) res.status(502).end();
  });

  // Client disconnect cleanup
  req.on("close", () => upstream.destroy());
}
```

**Why raw pipe, not http-proxy-middleware:** `http-proxy-middleware` v4's `responseInterceptor` option disables streaming (buffers entire response). The raw `http.get` + pipe approach is simpler and guaranteed non-buffering for SSE. Use http-proxy-middleware for non-streaming routes only (POST /chat).

### Pattern 3: lifespan for Shared Singletons

Use FastAPI's `@asynccontextmanager` lifespan for all startup/shutdown logic. Module-level `_shared` dict distributes initialized singletons to route handlers. This is the official FastAPI pattern; `@app.on_event("startup")` is deprecated.

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    _shared["db"] = MemoryStore(settings.sqlite_path)
    yield
    _shared["db"].close()
```

**Confidence:** HIGH — verified against official FastAPI docs (fastapi.tiangolo.com/advanced/events/)

### Pattern 4: Docker Internal Network + LM Studio Host Access

```yaml
# docker-compose.yml
networks:
  jarvis-net:
    driver: bridge

services:
  python-service:
    expose:
      - "8000"             # internal only — NOT ports:
    extra_hosts:
      - "host.docker.internal:host-gateway"  # Linux: resolves to host IP
    networks:
      - jarvis-net
    environment:
      LM_STUDIO_URL: "http://host.docker.internal:1234/v1"

  gateway:
    ports:
      - "3000:3000"        # only gateway is public-facing
    networks:
      - jarvis-net
    environment:
      PYTHON_SERVICE_URL: "http://python-service:8000"
    depends_on:
      python-service:
        condition: service_healthy
```

`host.docker.internal` resolves to the host machine IP from inside a container. On Linux, `extra_hosts: ["host.docker.internal:host-gateway"]` is required (Docker Desktop handles this automatically on macOS/Windows).

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Modifying ChatSession.send() for HTTP Use

**What:** Changing `send()` to not print, or adding HTTP-specific parameters.
**Why bad:** `send()` is called by CLI (`__main__.py`), 234 existing tests, and the voice pipeline. Any behavior change risks regressions.
**Instead:** Add a new `stream()` method as a pure addition. The API layer calls `stream()`. CLI calls `send()`. Neither is changed.

### Anti-Pattern 2: New ChatSession Per HTTP Request

**What:** `session = ChatSession(llm, ...)` inside the request handler.
**Why bad:** Each ChatSession opens a new SQLite connection, creates a new ChromaDB handle, and starts a new conversation row. The in-memory `history` list is garbage-collected when the request ends — all conversation context is lost after one message.
**Instead:** `session_store.get_or_create(session_id)`. ChatSessions live for the full conversation lifetime, not request lifetime.

### Anti-Pattern 3: Exposing FastAPI Port on Host

**What:** `ports: - "8000:8000"` on python-service in docker-compose.yml.
**Why bad:** FastAPI has no auth, no rate limiting. Any process on the network can call it directly, bypassing the Express gateway and any future auth middleware.
**Instead:** `expose: - "8000"` (internal network only). Only the gateway gets a `ports:` binding.

### Anti-Pattern 4: Buffering SSE in Express

**What:** `res.json()`, `JSON.parse()`, or `responseInterceptor` on SSE responses from FastAPI.
**Why bad:** Buffers the entire stream. Client receives all tokens at once when the LLM finishes, not incrementally. Defeats streaming entirely.
**Instead:** `upstreamRes.pipe(res)` after SSE headers. No JSON parsing in the gateway for stream endpoints.

### Anti-Pattern 5: Hardcoding PYTHON_SERVICE_URL in TypeScript

**What:** `const PYTHON_URL = "http://python-service:8000"` in source code.
**Why bad:** Breaks local development (Docker DNS doesn't resolve outside compose), makes testing with mock servers impossible.
**Instead:** `process.env.PYTHON_SERVICE_URL ?? "http://localhost:8000"`. Falls back to localhost for non-Docker dev.

### Anti-Pattern 6: Synchronous FastAPI Endpoint for LLM Calls

**What:** `def chat_stream(...)` (sync) for LLM-touching routes.
**Why bad:** `ChatSession.stream()` is an async generator. Mixing sync path operations with async generators causes event loop conflicts. FastAPI runs sync routes in a threadpool, which breaks asyncio.
**Instead:** All LLM-touching routes must be `async def`. FastAPI's async support is first-class.

### Anti-Pattern 7: Skipping Health Check Start Period

**What:** Health check with no `start_period` on python-service.
**Why bad:** ChromaDB initialization, sentence-transformers model download (first run), and SQLite setup can take 10-20 seconds. Docker will mark the service unhealthy during this window and restart it, causing a restart loop.
**Instead:** `start_period: 30s`. Failures during start_period don't count toward retries.

---

## Docker Networking Strategy

### Service Discovery

Docker Compose user-defined bridge network provides DNS by service name. Express gateway uses `http://python-service:8000` as the upstream URL. This hostname resolves only inside `jarvis-net`.

### Health Checks

```yaml
services:
  python-service:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s   # critical: allows time for ChromaDB + model init

  gateway:
    depends_on:
      python-service:
        condition: service_healthy  # gateway only starts after Python is healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 10s
```

### Volume Strategy

```yaml
volumes:
  - ./data:/app/data   # SQLite + ChromaDB persist across container restarts
  - ./.env:/app/.env   # config — never bake secrets into image
```

Mount `.env` as a read-only volume. Do not `COPY .env` in the Dockerfile. `pydantic-settings` reads it from the working directory.

---

## Suggested Build Order

Dependencies flow downward: Python API must exist before Express can proxy to it. Docker Compose requires both images to be buildable. Build in three sequential phases.

### Phase 1: FastAPI Core (Python only, no Docker, no Node)

Goal: FastAPI starts and handles /chat and /chat/stream correctly. All 234 existing tests still pass.

1. Add `fastapi`, `uvicorn[standard]` to `pyproject.toml` dependencies
2. Add `api_host: str = "0.0.0.0"` and `api_port: int = 8000` to `Settings` in `config.py`
3. Add `stream()` async generator to `ChatSession` in `session.py`
4. Write pytest unit tests for `stream()` using existing pytest-asyncio setup
5. Implement `src/jarvis/api/session_store.py` — unit test get_or_create, delete, lifecycle
6. Implement `src/jarvis/api/app.py` — lifespan mirrors `__main__.py` wiring
7. Implement `src/jarvis/api/routes/health.py` — GET /health returns `{"status": "ok"}`
8. Implement `src/jarvis/api/routes/chat.py` — POST /chat (non-streaming) first
9. Integration test: `uvicorn src.jarvis.api.app:app` + `curl -X POST /chat` works
10. Add GET /chat/stream SSE endpoint using `session.stream()`
11. Integration test: `curl -N "http://localhost:8000/chat/stream?message=hello"` streams tokens

Gate: All 234 existing tests pass. FastAPI starts. SSE streams from curl.

### Phase 2: Monorepo + Express Gateway (Node layer)

Goal: Express proxies requests to FastAPI. SSE flows end-to-end without buffering.

1. Create `pnpm-workspace.yaml` at repo root
2. Create root `package.json` with convenience scripts, no runtime deps
3. `mkdir -p packages/gateway` — scaffold Express TS project
4. `packages/gateway/package.json`: express, typescript, tsx, @types/express, @types/node
5. `packages/gateway/tsconfig.json`: strict, target ES2022, module NodeNext
6. Implement `src/config.ts`: `PYTHON_SERVICE_URL` from env with localhost fallback
7. Implement `src/middleware/sse.ts`: SSE header setup + raw pipe helper
8. Implement `src/routes/chat.ts`: POST /chat proxy + GET /chat/stream pipe
9. Implement `src/index.ts`: Express app, route mounting, error handler
10. Integration test: start FastAPI locally, start gateway (`tsx src/index.ts`), curl port 3000

Gate: `curl http://localhost:3000/chat` routes through Express to FastAPI. `curl -N http://localhost:3000/chat/stream` streams tokens without buffering.

### Phase 3: Docker Compose

Goal: `docker compose up` starts everything. Full request chain works in containers. Data persists.

1. Write `docker/python.Dockerfile`: python:3.12-slim, install pyproject.toml, uvicorn entrypoint
2. Write `docker/node.Dockerfile`: node:20-slim, corepack enable, pnpm install, build, entrypoint
3. Write `docker-compose.yml`: python-service (expose 8000), gateway (ports 3000), jarvis-net
4. Add `extra_hosts: ["host.docker.internal:host-gateway"]` to python-service (Linux)
5. Add health checks with `start_period: 30s` on python-service
6. Add `depends_on: python-service: condition: service_healthy` to gateway
7. Write `docker-compose.override.yml`: volume mounts for hot-reload in dev
8. `docker compose up --build` — validate both services start
9. Test: `curl http://localhost:3000/health` → gateway up; `curl http://localhost:3000/chat` → full chain

Gate: `docker compose up` starts everything. `/chat` works end-to-end in containers. `data/` persists after `docker compose down && docker compose up`.

---

## SSE Data Flow: End-to-End

```
ChatSession.stream() [Python]
  async generator: yields "Hello", " there", "!"
          ↓
FastAPI route (routes/chat.py)
  wraps each token: ServerSentEvent(data="Hello", event="token")
  wire format:      "event: token\ndata: Hello\n\n"
  [FastAPI auto-sends keep-alive comment every 15s]
          ↓
HTTP response body: raw text/event-stream bytes
          ↓
Express gateway (packages/gateway)
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("X-Accel-Buffering", "no")
  res.flushHeaders()                   ← before first byte
  upstreamRes.pipe(res)                ← raw bytes, zero buffering
          ↓
Client (browser EventSource / curl -N)
  receives: "event: token\ndata: Hello\n\n"
  EventSource fires: event.type = "token", event.data = "Hello"
  [client renders token incrementally]
          ↓
Final event: ServerSentEvent(data="[DONE]", event="done")
Client receives "done" event, closes EventSource connection
```

---

## Scalability Notes

The in-memory session dict is correct and sufficient for v1.1 (single-user personal assistant). Do not over-engineer.

| Concern | v1.1 (single-user) | Future (multi-user) |
|---------|-------------------|---------------------|
| Session state | Module-level `dict` in single uvicorn process | Replace with Redis; serialize ChatSession history |
| Concurrency | asyncio event loop, 1 uvicorn worker | Multiple workers break in-memory dict — requires Redis |
| LM Studio | Single local model, `host.docker.internal:1234` | Cloud LLM per-user |
| ChromaDB | Embedded single writer | Chroma server mode or Qdrant |
| SQLite | Single writer, WAL concurrent reads | Acceptable for personal use; Postgres for multi-user |

---

## Sources

- FastAPI SSE official docs (fastapi.tiangolo.com/tutorial/server-sent-events/) — HIGH confidence, verified 2026-04-05
- FastAPI Lifespan Events (fastapi.tiangolo.com/advanced/events/) — HIGH confidence, official docs
- FastAPI Docker deployment (fastapi.tiangolo.com/deployment/docker/) — HIGH confidence, official docs
- http-proxy-middleware GitHub (chimurai/http-proxy-middleware v4.x) — MEDIUM confidence; SSE buffering behavior with responseInterceptor confirmed via community sources, raw pipe alternative is well-established
- pnpm workspaces docs (pnpm.io/workspaces) — HIGH confidence, official docs
- Docker Compose bridge networking, `extra_hosts: host-gateway` — HIGH confidence, official Docker docs
- FastAPI session state in-memory dict pattern (LangChain community, Latenode, 2025) — MEDIUM confidence (community sources, multiple agree)
- Existing codebase: `src/jarvis/core/session.py`, `src/jarvis/__main__.py`, `src/jarvis/config.py` — HIGH confidence (read directly)

---

*Architecture research for: JARVIS v1.1 — Monorepo + FastAPI + Express Gateway + Docker Compose*
*Researched: 2026-04-05*
*Previous version: 2026-04-04 (v1.0 — Express-Python boundary, LangGraph patterns)*
