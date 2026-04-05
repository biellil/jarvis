# Feature Landscape

**Domain:** Monorepo + HTTP API Gateway layer over existing Python AI assistant
**Project:** JARVIS v1.1 — Monorepo + API Milestone
**Researched:** 2026-04-05
**Overall confidence:** HIGH (current web search + official docs + strong domain signal)

---

## Context

JARVIS v1.0 ships a complete Python CLI assistant with LangChain/LangGraph, SQLite + ChromaDB memory, voice pipeline, PC Control tools, and vision. **This research is scoped to v1.1 only**: the new structural and infrastructure layer being added on top of the existing Python core. The existing Python features are not re-evaluated here.

The goal is to expose the Python core via HTTP (FastAPI), put a TypeScript gateway in front (Express), wire it together in a monorepo (pnpm workspaces), and containerize it (Docker Compose).

---

## Table Stakes

Features that must exist for this milestone to be considered complete. Missing any makes the layer non-functional.

### FastAPI (Python HTTP Layer)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `POST /chat` — send message, receive streamed response | Core value delivery — without this the HTTP layer does nothing | Medium | Must use `StreamingResponse` with `text/event-stream`; wraps `session.py` invoke |
| `GET /health` — liveness probe | Gateway and Docker Compose need to know Python service is up | Low | Returns `{"status": "ok", "version": "..."}` |
| `GET /health/ready` — readiness probe | Distinct from liveness: confirms ChromaDB, SQLite, LLM reachable | Medium | Checks all dependencies before accepting traffic |
| SSE streaming on `/chat` | LLM responses stream token-by-token; blocking HTTP is unacceptable UX | Medium | Use `AsyncGenerator` yielding `data: {chunk}\n\n`; LangChain `astream()` |
| Request/response Pydantic models | Type safety at the HTTP boundary; catches bad input before LLM call | Low | `ChatRequest(message: str, session_id: str)`, `ChatResponse` |
| CORS middleware | Express gateway calls Python from Node — cross-origin by nature | Low | `fastapi.middleware.cors.CORSMiddleware`; restrict to gateway origin |
| `GET /config` — read active config | Express gateway and future UI need to know active LLM backend | Low | Returns safe subset of `Settings` (no API keys) |
| `POST /config` — hot-reload LLM config | JARVIS v1.0 already supports hot-reload; expose via HTTP | Medium | Accepts `{"provider": "...", "model": "..."}`, re-instantiates `Settings()` |
| Session ID threading | Multiple concurrent clients (terminal + future UI) need isolated sessions | Medium | `session_id` in every request maps to a `JarvisSession` instance in memory |
| Graceful startup / shutdown | LLM and ChromaDB must init before accepting requests; clean teardown | Low | FastAPI `lifespan` context manager; log startup completion |

### Express TypeScript Gateway

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `POST /api/chat` — forward to FastAPI with SSE passthrough | Primary route; all chat traffic flows here | Medium | Must proxy SSE stream to client without buffering; `res.flushHeaders()` required |
| `GET /api/health` — aggregate health from all services | Single health endpoint for Docker, load balancer, Compose | Low | Calls FastAPI `/health`; reports gateway own status + Python status |
| Request logging middleware | Observability baseline; need to see request flow | Low | `morgan` or custom middleware; structured JSON log lines |
| Error normalization middleware | FastAPI returns different error shapes than Express; normalize at gateway | Low | Catch all 4xx/5xx from Python service, format consistent `{error, code, message}` |
| Environment-based config | FastAPI URL, port, timeouts must be configurable without code changes | Low | `dotenv` + typed config object; `FASTAPI_URL`, `PORT`, `LOG_LEVEL` |
| TypeScript strict mode | Type safety is the reason to use TS over JS for a gateway | Low | `"strict": true` in `tsconfig.json`; `zod` for request validation |
| `GET /api/config` — pass through to FastAPI | UI and client need active config; gateway forwards the call | Low | Simple proxy; no transformation needed |

### pnpm Workspaces (Monorepo Structure)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `pnpm-workspace.yaml` at root | Defines workspace; without it pnpm treats packages as independent | Low | `packages: ["apps/*", "packages/*"]` pattern |
| Root `package.json` with workspace scripts | `pnpm dev`, `pnpm build`, `pnpm test` running all packages | Low | `--filter` flag for targeting individual packages |
| `apps/api` — Express TS gateway package | Clean package boundary; its own `package.json`, `tsconfig.json` | Low | `name: "@jarvis/api"` |
| Python core co-located but not in pnpm | Python stays in `packages/core` (or root `src/`); not managed by pnpm | Low | pnpm manages only Node packages; Python stays under `pyproject.toml` |
| Shared TypeScript types package | `packages/types` with `ChatRequest`, `ChatResponse`, etc. shared across Node packages | Medium | `@jarvis/types`; prevents type drift between packages |
| Root `.env` with service URLs | Single `.env` for all services in local dev | Low | Each service reads its relevant vars; Docker Compose also uses this file |

### Docker Compose

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `jarvis-core` service (Python/FastAPI) | Python service must run in a container | Medium | `python:3.12-slim` base; mounts `src/` in dev; health check on `/health` |
| `jarvis-api` service (Express gateway) | Node service must run in a container | Low | `node:22-slim` base; depends on `jarvis-core` being healthy |
| `depends_on: condition: service_healthy` | Gateway must not start until Python service is healthy | Low | Prevents race condition on startup; uses `/health/ready` endpoint |
| Volume mount for `data/` (SQLite + ChromaDB) | Memory must persist across container restarts | Low | `./data:/app/data` volume; do not bake data into image |
| Volume mount for `.env` / config | Secrets and config must not be baked into image | Low | Mount `.env` as bind volume; or use `env_file:` directive |
| Named network for inter-service communication | Services talk to each other by service name, not IP | Low | `networks: jarvis-net`; gateway calls `http://jarvis-core:8000` |
| Explicit port mapping | `jarvis-api` exposed to host; `jarvis-core` internal only | Low | `3000:3000` for gateway; `jarvis-core` not exposed to host in production |
| Dev override file (`docker-compose.override.yml`) | Hot-reload in dev requires volume mounts; production image does not | Medium | Override adds `watchmedo` / `nodemon`; production uses baked image |

---

## Differentiators

Features that go beyond baseline function and add value. Not required for the milestone to ship, but worth building if they fit within scope.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| SSE reconnect / resumable streaming | Network interruption does not kill a long LLM response | High | Requires token buffer (Redis or in-memory dict); out of scope for v1.1 |
| Gateway request deduplication | Two identical requests in flight return the same stream | High | Complex caching logic; skip for personal-use scale |
| `POST /api/voice` — audio upload, returns text | Voice-over-HTTP for future web UI; mic → STT → response | High | Multipart upload to FastAPI; wraps `voice.py`; defer to v1.2 |
| OpenTelemetry tracing spans | Distributed tracing across gateway → FastAPI → LangGraph | High | Valuable at scale; overkill for single-user local tool |
| `GET /api/sessions` — list active sessions | Debug and inspect running conversations | Medium | Returns session IDs, message count; useful for multi-window use |
| `DELETE /api/sessions/{id}` — kill a session | Clear session state without restarting Python service | Low | Wraps `session_manager.destroy(id)` in FastAPI |
| Structured SSE event types | `{type: "token" | "tool_call" | "tool_result" | "done"}` instead of raw text | Medium | Enables rich client rendering; slightly more complex to emit |
| `GET /api/memory/search` — semantic memory query | Test and inspect ChromaDB from outside the Python process | Medium | Wraps `vectors.py` search; useful for debugging memory quality |

---

## Anti-Features

Features to explicitly avoid building in v1.1. Each adds complexity or violates stated constraints.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Authentication / API keys on gateway | Personal tool on localhost — auth adds friction with zero security benefit | Skip entirely; add if remote access ever needed |
| Rate limiting in gateway | Single user, single machine — rate limiting is meaningless | Skip; would only block legitimate requests |
| Redis / external message broker | Adds infra dependency without a clear problem to solve at this scale | Stick to SSE over HTTP; in-process session state is fine |
| WebSocket instead of SSE | WebSockets are bidirectional — SSE is simpler and sufficient for one-way LLM streaming | Use `text/event-stream`; WebSocket is justified only if client needs to push events mid-stream |
| Nginx / Traefik reverse proxy | Over-engineered for local development; Docker Compose networking covers routing | Compose `networks` handles service discovery; skip proxy layer in v1.1 |
| FastAPI background tasks for LLM calls | Background tasks complicate response lifecycle; SSE streaming is cleaner | Stream directly from endpoint; avoid `BackgroundTasks` for LLM inference |
| Multi-stage Docker build for Python | Python layer changes frequently during dev; multi-stage adds build time with no runtime benefit yet | Single-stage dev image; optimize in v2+ when image size matters |
| `langchain-serve` / LangServe | LangServe is deprecated; do not use it to expose the agent | Roll minimal FastAPI endpoints manually; keep control of request shape |
| Hardcoded internal service URLs | `http://localhost:8000` in Express code breaks in Docker and CI | Read from env: `FASTAPI_URL=http://jarvis-core:8000`; set in `docker-compose.yml` |
| gRPC between gateway and FastAPI | Binary protocol overkill for single-machine local tool; adds protobuf toolchain | Plain HTTP + JSON is fine; gRPC adds no benefit at personal-use scale |

---

## Feature Dependencies

```
pnpm-workspace.yaml (root)
  └── apps/api (Express gateway) — workspace package, inherits root node_modules
  └── packages/types (shared TS types) — imported by apps/api

apps/api (Express gateway)
  └── @jarvis/types — shared request/response shapes
  └── FASTAPI_URL env var — points to jarvis-core service
  └── POST /api/chat → forwards to FastAPI POST /chat (SSE passthrough)
  └── GET /api/health → calls FastAPI GET /health

FastAPI layer (packages/core or src/jarvis/api/)
  └── session.py (existing) — JarvisSession.invoke(), astream()
  └── memory/store.py (existing) — SQLite conversation history
  └── memory/vectors.py (existing) — ChromaDB semantic search
  └── config.py (existing) — Settings singleton + hot-reload
  └── llm/factory.py (existing) — LLM instantiation

Docker Compose
  └── jarvis-core service — wraps FastAPI; health check on /health/ready
  └── jarvis-api service — wraps Express; depends_on jarvis-core: service_healthy
  └── Named network (jarvis-net) — service name routing
  └── data/ volume — SQLite DB + ChromaDB persist across restarts

SSE streaming chain:
  LangChain astream() → FastAPI AsyncGenerator → StreamingResponse(text/event-stream)
  → Express: res.setHeader('Content-Type', 'text/event-stream')
           → pipe / manual chunk forwarding to client
  → Client: EventSource or fetch() with ReadableStream
```

---

## MVP Recommendation for v1.1

**The minimum viable v1.1 milestone ships exactly:**

1. **Monorepo structure**: `pnpm-workspace.yaml` at root, `apps/api`, `packages/types`, Python core stays under `src/`
2. **FastAPI layer**: `POST /chat` (SSE), `GET /health`, `GET /health/ready`, `GET /config`, `POST /config`
3. **Express gateway**: `POST /api/chat` (SSE passthrough), `GET /api/health`, request logging, error normalization
4. **Docker Compose**: `jarvis-core` + `jarvis-api` services, health checks, data volume, named network

**Defer to v1.2 or later:**

- `POST /api/voice` (audio upload)
- `GET /api/sessions` / `DELETE /api/sessions/{id}`
- Structured SSE event types (implement after streaming works)
- `GET /api/memory/search`
- Resumable streaming / Redis buffer
- Dev-optimized Docker override file (low priority, dev can use `pnpm dev` directly)

**Rationale for ordering:**

SSE streaming is the hardest part of this milestone and must be proven working end-to-end (LangChain → FastAPI → Express → client) before any other feature is added. Monorepo structure comes first because it sets up the workspace for all subsequent work. Docker Compose comes last because local dev without containers is faster for iteration.

---

## Complexity Flags

### SSE Passthrough in Express (MEDIUM-HIGH)

Express must not buffer SSE chunks. The critical pattern:

```typescript
// REQUIRED — flush headers immediately or SSE is buffered
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');
res.flushHeaders();

// Forward chunks from FastAPI as they arrive
const upstreamRes = await fetch(`${FASTAPI_URL}/chat`, { ... });
const reader = upstreamRes.body!.getReader();
// pipe reader → res.write() → res.flush() per chunk
```

Failure mode: Express default response buffering eats all SSE chunks and delivers them as one block at the end. Must disable compression middleware on SSE routes.

### FastAPI SSE with LangChain astream (MEDIUM)

LangChain's `astream()` yields `AIMessageChunk` objects. FastAPI must serialize each chunk properly:

```python
async def stream_generator(message: str, session_id: str):
    async for chunk in session.astream(message):
        content = chunk.content if hasattr(chunk, 'content') else str(chunk)
        yield f"data: {json.dumps({'token': content})}\n\n"
    yield "data: [DONE]\n\n"

return StreamingResponse(stream_generator(req.message, req.session_id),
                         media_type="text/event-stream")
```

Failure mode: Yielding objects directly without `json.dumps` causes client parse errors. `[DONE]` sentinel needed so client knows stream is complete.

### Docker Compose startup order (LOW but common mistake)

`depends_on: service_healthy` requires the Python service to define a `healthcheck`. Without `healthcheck:` in the Compose service definition, `condition: service_healthy` is silently ignored and Express starts before Python is ready.

### pnpm + Python co-location (LOW)

pnpm workspaces only manages Node packages. Python's `pyproject.toml` / `.venv` sits alongside `pnpm-workspace.yaml` at the root and is invisible to pnpm. Attempting to put Python in a pnpm workspace package causes confusion. Keep Python under `src/` and manage it separately with `uv` or `pip`.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| FastAPI SSE endpoint patterns | HIGH | FastAPI 0.135+ has native SSE; multiple verified sources; LangChain astream well documented |
| Express SSE proxy pattern | MEDIUM | Pattern is established; specific `res.flushHeaders()` requirement verified in multiple sources |
| pnpm workspaces structure | HIGH | Official pnpm docs + multiple 2025/2026 blog posts confirm structure and YAML format |
| Docker Compose service_healthy | HIGH | Official Docker docs + 2026 posts confirm `depends_on: condition: service_healthy` pattern |
| Streaming strategy (SSE over WebSocket) | HIGH | SSE is simpler, sufficient for one-way LLM output; WebSocket adds bidirectionality not needed here |
| Anti-features list | HIGH | Derived from project constraints (personal use, local-first, privacy-first) + v1.0 Key Decisions |

---

## Sources

- [FastAPI SSE official docs](https://fastapi.tiangolo.com/tutorial/server-sent-events/) — native SSE support since 0.135.0 (HIGH confidence)
- [FastAPI Behind a Proxy](https://fastapi.tiangolo.com/advanced/behind-a-proxy/) — Express gateway proxy configuration (HIGH confidence)
- [Streaming AI Agent with FastAPI & LangGraph 2025-26 Guide](https://dev.to/kasi_viswanath/streaming-ai-agent-with-fastapi-langgraph-2025-26-guide-1nkn) — SSE + LangGraph patterns (MEDIUM confidence — community article, verified against FastAPI docs)
- [pnpm Workspaces official docs](https://pnpm.io/workspaces) — workspace YAML format and package resolution (HIGH confidence)
- [Docker Compose depends_on with healthcheck](https://oneuptime.com/blog/post/2026-01-16-docker-compose-depends-on-healthcheck/view) — `service_healthy` pattern confirmed Jan 2026 (HIGH confidence)
- [Docker Compose Control Startup Order](https://docs.docker.com/compose/how-tos/startup-order/) — official Docker docs on startup ordering (HIGH confidence)
- [Express TypeScript API Gateway](https://medium.com/@opeoluborode_9605/how-to-develop-an-api-gateway-using-express-js-with-typescript-93e01c38ad28) — gateway middleware chain pattern (MEDIUM confidence)
- `/root/jarvis/.planning/PROJECT.md` — v1.1 milestone goals, constraints, out-of-scope decisions (HIGH confidence, authoritative)
