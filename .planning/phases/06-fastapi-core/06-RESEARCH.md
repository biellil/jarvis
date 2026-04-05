# Phase 6: FastAPI Core - Research

**Researched:** 2026-04-05
**Domain:** FastAPI HTTP layer over existing Python LangChain/LangGraph JARVIS core
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Sessão única global — um `ChatSession` compartilhado pelo processo inteiro. Todos os requests HTTP continuam a mesma conversa (igual ao CLI). Single-worker uvicorn garante que não há concorrência. Não implementar session pool por ID nesta fase.
- **D-02:** Adicionar `send_stream(user_input: str)` como método separado em `ChatSession` — usa `asyncio.Queue` internamente para capturar tokens e expô-los como async generator. O método `send()` original é preservado **100% intocado** — CLI não muda. O endpoint SSE do FastAPI consome o generator de `send_stream()`.
- **D-03:** Módulo dedicado `src/jarvis/api/` com entrypoint `jarvis.api:app`. Inicialização: `python -m jarvis.api` ou `uvicorn jarvis.api:app --host 0.0.0.0 --port 8000`. CLI (`python -m jarvis`) e API são entrypoints completamente separados. O `__main__.py` existente **não é modificado**.
- **D-04:** API HTTP usa os mesmos `data/jarvis.db` (SQLite) e `data/chroma/` (ChromaDB) que o CLI. Paths configurados via `.env` através de `Settings.sqlite_path` e `Settings.chroma_path` — sem vars adicionais.
- FastAPI 0.135.3 + uvicorn[standard] 0.43.0 — SSE via `EventSourceResponse` nativa (sem sse-starlette)
- Single uvicorn worker obrigatório — in-memory session_store quebra com múltiplos workers
- Config singleton: `from jarvis.config import settings` — nunca ler `os.environ` diretamente
- `asyncio.to_thread()` para chamadas bloqueantes (ARCH-02)

### Claude's Discretion

- Estrutura interna do módulo `jarvis/api/` (roteamento, organização de arquivos)
- Tratamento de erros HTTP (status codes, formato de erro)
- Configuração de porta via `Settings` (adicionar `api_host` e `api_port` com defaults sensatos)
- Validação de payload do `POST /chat` (Pydantic model)
- Lifecycle do `ChatSession` no startup do FastAPI (lifespan event)

### Deferred Ideas (OUT OF SCOPE)

- Session pool por ID (`session_id → ChatSession`) — API-06 nos deferred requirements
- `GET /config + POST /config` — API-05 nos deferred
- Autenticação / rate limiting — uso pessoal em rede local
- WebSockets — SSE é suficiente para output unidirecional
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| API-01 | Usuário pode enviar uma mensagem e receber resposta completa via `POST /chat` (wraps `ChatSession.send()`) | FastAPI POST endpoint + Pydantic request model + asyncio.to_thread for blocking send() + JSON response |
| API-02 | Usuário pode receber tokens em streaming via `GET /chat/stream` com SSE (Server-Sent Events) token-by-token | FastAPI 0.135.3 native EventSourceResponse + send_stream() async generator with asyncio.Queue |
| API-03 | Sistema externo pode verificar se o serviço está vivo via `GET /health` (liveness probe) | Simple FastAPI GET returning `{"status": "ok"}` — no external deps |
| API-04 | Sistema externo pode verificar se o serviço está pronto para receber requests via `GET /health/ready` (readiness probe — checa ChromaDB + SQLite) | sqlite3 path existence check + ChromaDB client heartbeat call |
</phase_requirements>

---

## Summary

This phase wraps the existing JARVIS `ChatSession` in a minimal FastAPI HTTP layer. The core challenge is not FastAPI itself (it's well-understood), but threading the async generator correctly: `send()` was built to `print()` tokens to stdout; `send_stream()` must capture those same tokens into an `asyncio.Queue` that the SSE endpoint drains as a generator — without changing `send()` at all.

FastAPI 0.135.3 introduced a native `EventSourceResponse` (via `from fastapi.sse import EventSourceResponse`) that replaces the previously common `sse-starlette` dependency. This is a clean, pydantic-native approach where an async generator function becomes the SSE endpoint body — exactly what D-02 targets.

The single-worker constraint (D-01) is critical: the global `ChatSession` is in-process state. Uvicorn must be started with `--workers 1` (or simply without `--workers`, which defaults to 1). Multiple workers would split session state across processes silently — a hard-to-detect bug.

**Primary recommendation:** Create `src/jarvis/api/` as a dedicated module with `__init__.py` exposing `app`, `__main__.py` for `python -m jarvis.api`, `routes/chat.py`, and `routes/health.py`. `ChatSession` lifecycle managed by FastAPI `lifespan` context manager.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastapi | 0.135.3 | HTTP framework, routing, Pydantic validation, native SSE | Latest stable; introduced native EventSourceResponse in 0.135.0 |
| uvicorn[standard] | 0.43.0 | ASGI server for FastAPI | Standard production server; `[standard]` includes uvloop + httptools for perf |
| httpx | 0.28.1 | Already installed; used for `AsyncClient` in tests | ASGITransport enables in-process testing without a running server |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| starlette | auto (FastAPI dep) | `ASGITransport` for testing, middleware primitives | FastAPI installs it automatically |
| pydantic | 2.12.5 (already installed) | Request/response model validation | `ChatRequest`, `ChatResponse` Pydantic models |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `EventSourceResponse` (fastapi.sse) | `sse-starlette` | sse-starlette is unnecessary extra dep since FastAPI 0.135.0 added native SSE |
| `EventSourceResponse` (fastapi.sse) | `StreamingResponse` with `text/event-stream` | StreamingResponse works but requires manual SSE formatting; EventSourceResponse handles headers and keep-alive automatically |
| `asyncio.Queue` in `send_stream()` | Forking `send()` to optionally accept a queue arg | Queue-based approach keeps `send()` completely untouched (ARCH requirement) |

**Installation:**
```bash
pip install "fastapi==0.135.3" "uvicorn[standard]==0.43.0"
```

**Version verification (confirmed 2026-04-05):**
```bash
pip index versions fastapi   # 0.135.3 is latest
pip index versions uvicorn   # 0.43.0 is latest
```

Both are confirmed current. uvicorn 0.42.0 is already installed on this machine — needs upgrade to 0.43.0.

---

## Architecture Patterns

### Recommended Project Structure
```
src/jarvis/api/
├── __init__.py          # exposes `app` for `jarvis.api:app`
├── __main__.py          # `python -m jarvis.api` entrypoint
├── lifespan.py          # asynccontextmanager — ChatSession lifecycle
├── routes/
│   ├── __init__.py
│   ├── chat.py          # POST /chat + GET /chat/stream
│   └── health.py        # GET /health + GET /health/ready
└── models.py            # Pydantic request/response models
```

### Pattern 1: FastAPI App with Lifespan

**What:** `asynccontextmanager` manages `ChatSession` creation at startup and `save()`/close at shutdown. The session is stored in app state (`app.state.session`) and accessed via `Request.app.state`.

**When to use:** Any shared resource that must be initialized once per process (D-01: single global session).

```python
# Source: https://fastapi.tiangolo.com/advanced/events/
from contextlib import asynccontextmanager
from fastapi import FastAPI
from jarvis.core.session import ChatSession
from jarvis.llm.factory import create_llm
from jarvis.memory.store import MemoryStore
from jarvis.memory.vectors import MemoryVectors
from jarvis.config import settings
import os

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — initialize shared ChatSession
    os.makedirs(os.path.dirname(settings.sqlite_path) or ".", exist_ok=True)
    os.makedirs(settings.chroma_path, exist_ok=True)
    llm = create_llm()
    db = MemoryStore(settings.sqlite_path)
    vectors = MemoryVectors(settings.chroma_path)
    session = ChatSession(llm=llm, db=db, vectors=vectors)
    app.state.session = session
    app.state.db = db
    yield
    # Shutdown — save and close
    await session.save()
    db.close()

app = FastAPI(lifespan=lifespan)
```

### Pattern 2: POST /chat — Blocking send() via asyncio.to_thread

**What:** `send()` is synchronous-natured (prints to stdout, uses blocking calls internally). Per ARCH-02, blocking calls wrap in `asyncio.to_thread()`. But `send()` is an `async def` that uses `astream()` — it's already async. The issue is that `send()` calls `print()` which pollutes stdout in API mode. The solution: `send()` is called directly (it IS async), but `send_stream()` is the one that captures tokens.

**Critical insight:** `send()` already IS `async def`. Calling `await session.send(msg)` from a FastAPI endpoint works directly — no `asyncio.to_thread()` needed for `send()` itself. The `print()` side effects in `send()` go to stdout (acceptable — they're logged for debug), and `send()` returns the full string, which is returned as JSON.

```python
# Source: FastAPI official patterns + session.py analysis
from fastapi import APIRouter, Request
from jarvis.api.models import ChatRequest, ChatResponse

router = APIRouter()

@router.post("/chat", response_model=ChatResponse)
async def chat(request: Request, body: ChatRequest) -> ChatResponse:
    session = request.app.state.session
    response_text = await session.send(body.message)
    return ChatResponse(message=response_text)
```

### Pattern 3: GET /chat/stream — SSE via EventSourceResponse

**What:** Native SSE using FastAPI 0.135.3's `EventSourceResponse`. The endpoint is an async generator function that yields `ServerSentEvent` objects. The `send_stream()` method on `ChatSession` uses `asyncio.Queue` to capture tokens as they're generated.

```python
# Source: https://fastapi.tiangolo.com/tutorial/server-sent-events/
from collections.abc import AsyncIterable
from fastapi import APIRouter, Request
from fastapi.sse import EventSourceResponse, ServerSentEvent

router = APIRouter()

@router.get("/chat/stream", response_class=EventSourceResponse)
async def chat_stream(request: Request, message: str) -> AsyncIterable[ServerSentEvent]:
    session = request.app.state.session
    async for token in session.send_stream(message):
        yield ServerSentEvent(data=token)
```

### Pattern 4: send_stream() using asyncio.Queue

**What:** `send_stream()` is a new method on `ChatSession`. It runs `send()` in a background task while yielding tokens from a queue. Since `send()` calls `print(token, ...)`, we intercept at the LLM streaming layer — not by monkey-patching print, but by reimplementing the streaming loop cleanly to put tokens in the queue instead.

**Implementation approach:** `send_stream()` should NOT call `send()` internally (that would double the print side effects). Instead, it should extract the shared streaming logic into a private helper, or duplicate the streaming portion. The simpler and cleaner approach per D-02 is:

`send_stream()` runs its own `astream()` loop with `asyncio.Queue`, and calls the same memory/profile/compression logic. This is more code but avoids `send()` side effects entirely.

```python
# Pattern for send_stream() in ChatSession
import asyncio
from collections.abc import AsyncGenerator

async def send_stream(self, user_input: str) -> AsyncGenerator[str, None]:
    """Stream tokens one-by-one via async generator (API mode).
    
    Unlike send(), does NOT print to stdout. Yields each token as a string.
    Memory, profile extraction, and compression logic identical to send().
    """
    queue: asyncio.Queue[str | None] = asyncio.Queue()
    
    async def _run():
        # Same pipeline as send() but puts tokens in queue instead of print()
        # ... compression, augmented_system, messages_to_send ...
        async for chunk in self._llm_with_tools.astream(messages_to_send):
            token = chunk.content
            if token:
                await queue.put(token)
                full_response += token
        # Signal end
        await queue.put(None)
        # Post-streaming: save, profile extraction (same as send())
    
    task = asyncio.create_task(_run())
    
    while True:
        token = await queue.get()
        if token is None:
            break
        yield token
    
    await task  # propagate exceptions
```

**Alternative simpler approach:** Since `send()` is complex (tool calls, vision routing, two-pass LLM), the cleanest implementation refactors the streaming logic into a private `_stream_tokens()` helper that both `send()` and `send_stream()` call. `send()` consumes it with `print()`, `send_stream()` yields it.

### Pattern 5: Health Probes

**What:** Liveness = always returns 200. Readiness = checks that backing stores are reachable.

```python
# Source: FastAPI patterns + success criteria from CONTEXT.md
from fastapi import APIRouter, HTTPException
from pathlib import Path
from jarvis.config import settings

router = APIRouter()

@router.get("/health")
async def health():
    return {"status": "ok"}

@router.get("/health/ready")
async def health_ready():
    errors = []
    # Check SQLite file exists
    if not Path(settings.sqlite_path).exists():
        errors.append("sqlite: file not found")
    # Check ChromaDB responds
    try:
        import chromadb
        client = chromadb.PersistentClient(path=settings.chroma_path)
        client.heartbeat()
    except Exception as e:
        errors.append(f"chromadb: {e}")
    
    if errors:
        raise HTTPException(status_code=503, detail={"status": "not_ready", "errors": errors})
    return {"status": "ok", "stores": {"sqlite": "ok", "chromadb": "ok"}}
```

### Pattern 6: Module entrypoint (python -m jarvis.api)

```python
# src/jarvis/api/__main__.py
import uvicorn
from jarvis.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "jarvis.api:app",
        host=getattr(settings, "api_host", "0.0.0.0"),
        port=getattr(settings, "api_port", 8000),
        workers=1,  # CRITICAL: single worker — in-memory session
    )
```

### Pattern 7: Settings extension

New fields to add in `config.py`:
```python
# API server config (Phase 6)
api_host: str = Field(default="0.0.0.0")
api_port: int = Field(default=8000)
```

### Anti-Patterns to Avoid

- **Multiple uvicorn workers:** `uvicorn app --workers 4` splits the `ChatSession` across processes — each worker gets a different session, requests go to different histories. The CONTEXT decision mandates `workers=1`.
- **Reading os.environ directly in api module:** All config must flow through `from jarvis.config import settings` — never `os.environ.get("API_PORT")` directly.
- **Calling send() from send_stream():** `send()` calls `print()` which pollutes stdout in API mode. `send_stream()` must have its own streaming path.
- **SSE with POST body for /chat/stream:** The success criteria explicitly shows `GET /chat/stream?message=oi` — message is a query parameter, not a POST body. This is intentional for SSE (EventSource API is GET-only in browsers).
- **Modifying `__main__.py`:** The existing CLI entrypoint must remain untouched (D-03).
- **Using deprecated @app.on_event:** Use `lifespan` context manager instead.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE formatting | Manual `data: ...\n\n` string building | `EventSourceResponse` + `ServerSentEvent` from `fastapi.sse` | Handles keep-alive pings, Cache-Control headers, X-Accel-Buffering automatically |
| Request body validation | Manual JSON parsing + type checking | Pydantic `BaseModel` for `ChatRequest` | Free validation, OpenAPI docs, clear error messages |
| Test HTTP client | subprocess curl calls | `httpx.AsyncClient(transport=ASGITransport(app=app))` | In-process testing, no port binding needed, SSE streaming via `aiter_sse()` |
| ASGI server | Rolling own server | `uvicorn[standard]` | Battle-tested, handles connection lifecycle, Keep-Alive, graceful shutdown |

**Key insight:** The 3-line FastAPI `EventSourceResponse` endpoint replaces hundreds of lines of manual SSE implementation that would need to handle buffering, keep-alive, client disconnects, and content-type headers.

---

## Runtime State Inventory

> This is not a rename/refactor/migration phase — this section is not applicable.

---

## Common Pitfalls

### Pitfall 1: send() stdout side-effects in API mode
**What goes wrong:** `send()` calls `print(token, end="", flush=True)` throughout streaming. When called from an API endpoint, this pollutes the server stdout — not catastrophic, but messy and confusing for operators.
**Why it happens:** `send()` was designed for CLI output (D-02 in v1.0: plain print, not Rich).
**How to avoid:** `send_stream()` must NOT call `send()` internally. It should replicate the streaming logic with `asyncio.Queue`. The `POST /chat` endpoint calling `await session.send(msg)` is acceptable — stdout output in server logs is noise but not a bug.
**Warning signs:** Seeing JARVIS response tokens in server process stdout — expected for `/chat`, unexpected if it also happens for `/chat/stream`.

### Pitfall 2: asyncio event loop conflicts between tests
**What goes wrong:** `pytest-asyncio` with `asyncio_mode = "auto"` (already configured in pyproject.toml) can conflict with FastAPI's `lifespan` if the test creates its own loop.
**Why it happens:** FastAPI lifespan uses the same event loop as the test. `asyncio.run()` creates a new loop — tests should use `async def test_...` not `asyncio.run()`.
**How to avoid:** Use `@pytest.mark.anyio` or let `asyncio_mode = "auto"` handle it. Use `ASGITransport` which runs in the same loop. Never call `asyncio.run()` inside async tests.
**Warning signs:** `RuntimeError: This event loop is already running` or `RuntimeError: Event loop is closed`.

### Pitfall 3: asyncio.Queue in send_stream() with error handling
**What goes wrong:** If `_run()` background task raises an exception, the queue never gets `None` sentinel, and `send_stream()` hangs forever waiting for tokens.
**Why it happens:** `asyncio.create_task()` exceptions are silently swallowed unless awaited.
**How to avoid:** Use try/finally in `_run()` to always put `None` in the queue. Then `await task` after the while loop to re-raise exceptions.
**Warning signs:** Endpoint hangs indefinitely, no response sent to client.

### Pitfall 4: /health/ready creates a NEW ChromaDB client on every call
**What goes wrong:** `chromadb.PersistentClient(path=...)` is expensive (~100ms). If `/health/ready` is polled every second by Docker healthcheck, it creates thousands of DB connections.
**Why it happens:** Naive implementation creates a fresh client per request.
**How to avoid:** Use the already-initialized `MemoryVectors` from `app.state` — it holds the live ChromaDB client. Call `app.state.vectors._client.heartbeat()` or equivalent instead of creating a new client.
**Warning signs:** High latency on health endpoint, ChromaDB lock contention.

### Pitfall 5: GET /chat/stream with large message in query param
**What goes wrong:** Very long messages in query params can hit URL length limits (~2048 chars in some proxies/clients).
**Why it happens:** SSE endpoints are conventionally GET — the `EventSource` browser API only supports GET.
**How to avoid:** For this phase (CLI tools and curl), query params are fine. The success criteria uses `?message=oi` — short messages. This is acceptable for personal use. Document the limitation.
**Warning signs:** `414 URI Too Long` from proxy/nginx in future Docker setup.

### Pitfall 6: send() vs send_stream() divergence over time
**What goes wrong:** `send()` gets updated (new tool, new vision logic) but `send_stream()` doesn't, causing behavioral differences between CLI and API streaming mode.
**Why it happens:** Two codepaths that should be identical.
**How to avoid:** Consider refactoring to a shared `_build_and_stream()` private method that both consume — or add a comment/test asserting they use the same logic paths.
**Warning signs:** User reports CLI and API give different responses to the same input.

---

## Code Examples

### ChatRequest and ChatResponse Pydantic Models
```python
# Source: FastAPI Pydantic patterns + project convention
from pydantic import BaseModel

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    message: str
```

### Complete /chat endpoint (API-01)
```python
# Source: FastAPI docs + session.py interface
from fastapi import APIRouter, Request
from jarvis.api.models import ChatRequest, ChatResponse

router = APIRouter()

@router.post("/chat", response_model=ChatResponse)
async def chat(request: Request, body: ChatRequest) -> ChatResponse:
    session = request.app.state.session
    # send() is async def — call directly, no asyncio.to_thread needed
    response_text = await session.send(body.message)
    return ChatResponse(message=response_text)
```

### Complete /chat/stream endpoint (API-02)
```python
# Source: https://fastapi.tiangolo.com/tutorial/server-sent-events/
from collections.abc import AsyncIterable
from fastapi import APIRouter, Request
from fastapi.sse import EventSourceResponse, ServerSentEvent

router = APIRouter()

@router.get("/chat/stream", response_class=EventSourceResponse)
async def chat_stream(
    request: Request, message: str
) -> AsyncIterable[ServerSentEvent]:
    session = request.app.state.session
    async for token in session.send_stream(message):
        yield ServerSentEvent(data=token)
```

### FastAPI app initialization
```python
# src/jarvis/api/__init__.py
from fastapi import FastAPI
from jarvis.api.lifespan import lifespan
from jarvis.api.routes.chat import router as chat_router
from jarvis.api.routes.health import router as health_router

app = FastAPI(title="JARVIS API", lifespan=lifespan)
app.include_router(chat_router)
app.include_router(health_router)
```

### Test pattern for POST /chat
```python
# Source: https://fastapi.tiangolo.com/advanced/async-tests/
import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, MagicMock

@pytest.mark.anyio
async def test_chat_endpoint():
    from jarvis.api import app
    # Override app.state.session with a mock
    mock_session = MagicMock()
    mock_session.send = AsyncMock(return_value="Olá! Como posso ajudar?")
    app.state.session = mock_session
    
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/chat", json={"message": "oi"})
    
    assert response.status_code == 200
    assert response.json()["message"] == "Olá! Como posso ajudar?"
```

### Test pattern for GET /health
```python
@pytest.mark.anyio
async def test_health_endpoint():
    from jarvis.api import app
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `sse-starlette` for SSE | `fastapi.sse.EventSourceResponse` (native) | FastAPI 0.135.0 (2025) | Removes external dependency, better Pydantic integration |
| `@app.on_event("startup")` | `lifespan` asynccontextmanager | FastAPI 0.93.0+ | More robust, handles exceptions during startup cleanly |
| `from starlette.testclient import TestClient` | `httpx.AsyncClient` + `ASGITransport` | FastAPI async testing docs update | Required for async path operations |

**Deprecated/outdated:**
- `@app.on_event("startup")` / `@app.on_event("shutdown")`: Deprecated — use `lifespan` context manager
- `sse-starlette`: Unnecessary for new projects using FastAPI >= 0.135.0
- `TestClient` from starlette: Works for sync tests; prefer `AsyncClient` for async endpoints

---

## Open Questions

1. **How to handle concurrent requests to /chat (both blocking send())**
   - What we know: D-01 mandates single worker, single session. Two simultaneous requests would both call `session.send()`, interleaving their messages into shared history — undefined behavior.
   - What's unclear: Is this a real concern for personal use? The user said "uso pessoal" but curl tests could overlap.
   - Recommendation: Add a `asyncio.Lock` guard on the session in the API layer. If a request arrives while session is busy, return 429 Too Many Requests immediately. This is a simple, correct solution for personal use.

2. **send_stream() implementation depth**
   - What we know: D-02 says to use `asyncio.Queue`. `send()` has complex logic: tool calls, vision routing, compression, two-pass LLM.
   - What's unclear: How much of `send()`'s tool-calling logic should `send_stream()` support in Phase 6?
   - Recommendation: For Phase 6, implement `send_stream()` with the same streaming path as `send()` but skip tool-call handling in the first version (tools are a CLI concern, not API). Document this gap. Tool streaming can come in a future phase.

3. **ChromaDB readiness check implementation**
   - What we know: `GET /health/ready` must check ChromaDB is operational. Creating a new `PersistentClient` per request is expensive.
   - What's unclear: Does `MemoryVectors` expose the ChromaDB client for reuse?
   - Recommendation: Add a `is_healthy()` method to `MemoryVectors` that calls `self._client.heartbeat()` (or equivalent) on the existing client. Access via `app.state.vectors.is_healthy()`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.10+ | Runtime | ✓ | 3.12.x (inferred from .venv) | — |
| fastapi | HTTP framework | ✗ (not installed) | — | None — must install |
| uvicorn[standard] | ASGI server | ✓ (partial — 0.42.0 installed, needs 0.43.0) | 0.42.0 | Upgrade required |
| httpx | Test client | ✓ | 0.28.1 | — |
| pydantic | Request validation | ✓ | 2.12.5 | — |
| starlette | Auto-installed with FastAPI | ✗ (pending FastAPI install) | — | Automatic via FastAPI dep |
| anyio | Async runtime / tests | ✓ | 4.13.0 | — |
| chromadb | Readiness probe | ✓ | 1.5.5 | — |

**Missing dependencies with no fallback:**
- `fastapi==0.135.3` — must be added to `pyproject.toml` and installed before implementation

**Missing dependencies with fallback:**
- `uvicorn 0.42.0` installed but needs upgrade to `0.43.0` — 0.42.0 will also work for development

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 + pytest-asyncio 1.3.0 |
| Config file | `pyproject.toml` (`[tool.pytest.ini_options]`) |
| Quick run command | `python3 -m pytest tests/test_api.py -x -q` |
| Full suite command | `python3 -m pytest tests/ -q` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| API-01 | POST /chat returns JSON with response text | unit (mock session) | `python3 -m pytest tests/test_api.py::test_chat_post -x` | ❌ Wave 0 |
| API-01 | POST /chat with empty message returns 422 | unit (Pydantic validation) | `python3 -m pytest tests/test_api.py::test_chat_post_empty_message -x` | ❌ Wave 0 |
| API-02 | GET /chat/stream returns text/event-stream content-type | unit (mock session) | `python3 -m pytest tests/test_api.py::test_chat_stream_content_type -x` | ❌ Wave 0 |
| API-02 | GET /chat/stream yields tokens incrementally | unit (mock send_stream) | `python3 -m pytest tests/test_api.py::test_chat_stream_tokens -x` | ❌ Wave 0 |
| API-02 | send_stream() yields same tokens as send() returns | unit (mock LLM) | `python3 -m pytest tests/test_session.py::test_send_stream_yields_tokens -x` | ❌ Wave 0 |
| API-03 | GET /health returns {"status": "ok"} | unit | `python3 -m pytest tests/test_api.py::test_health_liveness -x` | ❌ Wave 0 |
| API-04 | GET /health/ready returns 200 when stores are OK | unit (mock stores) | `python3 -m pytest tests/test_api.py::test_health_ready_ok -x` | ❌ Wave 0 |
| API-04 | GET /health/ready returns 503 when SQLite missing | unit | `python3 -m pytest tests/test_api.py::test_health_ready_sqlite_missing -x` | ❌ Wave 0 |
| regression | 234 existing tests still pass | regression | `python3 -m pytest tests/ -q --ignore=tests/test_api.py` | ✓ exists |
| regression | python -m jarvis CLI entrypoint unchanged | smoke (manual) | `python3 -m jarvis --help` | ✓ exists |

### Sampling Rate
- **Per task commit:** `python3 -m pytest tests/test_api.py -x -q`
- **Per wave merge:** `python3 -m pytest tests/ -q`
- **Phase gate:** Full suite green (234 + new API tests) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/test_api.py` — all API endpoint tests (API-01 through API-04)
- [ ] `tests/test_session_stream.py` — OR extend `tests/test_session.py` with `test_send_stream_yields_tokens`
- [ ] Framework install: `pip install "fastapi==0.135.3" "uvicorn[standard]==0.43.0"` + add to `pyproject.toml`

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 6 |
|-----------|-------------------|
| Stack: Python 3.10+ with LangChain/LangGraph | FastAPI is additive — does not replace LangChain |
| Multi-LLM: all LLM calls via abstraction layer | `create_llm()` used in lifespan — never provider-specific imports in api/ module |
| Multiplataforma: OS-specific code isolated | `src/jarvis/api/` has no platform-specific code |
| Privacidade: conversa nunca vai para cloud sem config | API layer does not add any cloud calls — inherits from session config |
| Sem UI obrigatória: funciona 100% em terminal | CLI (`python -m jarvis`) preserved 100% — D-03 |
| Config singleton: `from jarvis.config import settings` | All new Settings fields (api_host, api_port) follow existing pattern |
| asyncio.to_thread() para chamadas bloqueantes | `send()` is already async — no to_thread needed; only needed for sync ops in health check |
| GSD Workflow Enforcement | All file changes via GSD commands |
| Git Commits: Conventional Commits with emojis | ✨ feat(api): pattern for new API module commits |

---

## Sources

### Primary (HIGH confidence)
- [FastAPI Server-Sent Events docs](https://fastapi.tiangolo.com/tutorial/server-sent-events/) — `EventSourceResponse`, `ServerSentEvent` import paths, async generator pattern (FastAPI 0.135.0+)
- [FastAPI Lifespan Events docs](https://fastapi.tiangolo.com/advanced/events/) — `asynccontextmanager` lifespan pattern, `app.state` usage
- [FastAPI Async Tests docs](https://fastapi.tiangolo.com/advanced/async-tests/) — `ASGITransport`, `AsyncClient` test pattern
- `pip index versions fastapi` — 0.135.3 confirmed latest (2026-04-05)
- `pip index versions uvicorn` — 0.43.0 confirmed latest (2026-04-05)
- `src/jarvis/core/session.py` — Existing `send()` interface, print() side effects, async structure
- `src/jarvis/config.py` — Settings singleton pattern to extend
- `src/jarvis/__main__.py` — CLI entrypoint (confirmed: must not be modified)

### Secondary (MEDIUM confidence)
- WebSearch: "FastAPI SSE EventSourceResponse 0.135.0 native" — confirmed native SSE added in 0.135.0, no sse-starlette needed
- `pyproject.toml` — confirmed 234 tests, pytest-asyncio `asyncio_mode = "auto"` already configured

### Tertiary (LOW confidence)
- asyncio.Queue pattern for send_stream() — standard Python async pattern, not FastAPI-specific; implementation details need validation during coding

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified via `pip index versions`, FastAPI SSE verified via official docs
- Architecture: HIGH — patterns sourced from official FastAPI docs + existing codebase analysis
- Pitfalls: MEDIUM — asyncio.Queue pitfall is documented standard Python; others derived from code analysis

**Research date:** 2026-04-05
**Valid until:** 2026-05-05 (FastAPI releases frequently but 0.135.x is stable)
