# Project Research Summary

**Project:** JARVIS v1.1 — Monorepo + API Layer
**Domain:** Hybrid Python/Node.js monorepo with HTTP API gateway over an existing LangChain assistant
**Researched:** 2026-04-05
**Confidence:** HIGH

## Executive Summary

JARVIS v1.1 is a structural and infrastructure milestone, not a features milestone. The v1.0 Python core (LangChain, LangGraph, ChromaDB, voice pipeline, vision, PC Control) is complete with 234 passing tests and is not being changed. The goal is to expose that core over HTTP via FastAPI, put a typed Express gateway in front of it, wire everything into a pnpm monorepo, and containerize via Docker Compose. The key insight from research is that **zero existing Python modules need interface changes** — only two additive touches are required: a `stream()` async generator on `ChatSession` and two new config fields in `Settings`. All 234 existing tests must continue passing; the CLI entry point (`python -m jarvis`) is untouched throughout.

The recommended approach builds in three sequential phases with hard gates between them. Phase 1 (FastAPI) must prove end-to-end SSE streaming before Phase 2 (Express gateway) is started, because the SSE passthrough in Express depends on FastAPI behaving correctly. Phase 3 (Docker Compose) comes last because containerization is faster to iterate once the local dev chain is proven. This order directly mirrors the dependency graph: the Python API must exist before Node can proxy to it; both services must be tested locally before wrapping in Docker. The voice pipeline is deliberately excluded from Docker — it requires host hardware access and continues running via the CLI on the host machine.

The dominant risk across all three phases is SSE buffering. LLM token streaming is the core value of this layer, and three different systems can silently buffer it: FastAPI (if sync instead of async), Node.js response handling (if `flushHeaders()` is skipped), and Docker health check timing (if `start_period` is too short and the gateway starts before Python is ready). Each has a specific, well-documented prevention. A secondary risk cluster is Docker image misconfiguration: Alpine base images break ML packages at runtime with cryptic `ImportError` at container start, and multi-stage builds that omit system `.so` libraries pass CI but fail on first import. Both are completely avoidable with the right base image choice and an explicit `apt-get` in the runtime stage.

---

## Key Findings

### Recommended Stack

The existing Python core stack is frozen and validated. v1.1 adds three dependency groups. For the Python HTTP layer: `fastapi==0.135.3` and `uvicorn[standard]==0.43.0` — FastAPI 0.135+ includes built-in SSE support via `fastapi.sse.EventSourceResponse`, eliminating the need for any external SSE library. For the Express gateway: Node.js 22 LTS (Node 20 LTS ended April 2026), Express 5.1 (GA since October 2024), and `zod^4.0` for request validation at the gateway boundary. Dev tooling uses `tsx` for fast TypeScript execution without a compilation step and `tsdown` (Rolldown-based tsup successor) for production builds. For monorepo management: pnpm 10.33.0 workspaces managing only the `packages/` Node packages — Python stays at repo root, managed separately by `pyproject.toml`.

**Core new technologies:**
- `fastapi==0.135.3` + `uvicorn[standard]==0.43.0`: ASGI HTTP layer with native SSE — no `sse-starlette` or custom `StreamingResponse` needed
- `express^5.1.0` (Node 22 LTS): typed API gateway with Promise-based error handling and async route support
- `zod^4.0`: request schema validation at the gateway boundary before proxying to Python
- `pnpm 10.x workspaces`: monorepo structure for Node packages only — Python invisible to pnpm
- `python:3.12-slim` + `node:22-slim`: Debian-based Docker base images — never Alpine (musl glibc incompatibility)

**Critical version constraints:**
- Node 20 LTS is end-of-life as of April 30, 2026 — Node 22 is mandatory for any new project
- Zod v4 has breaking changes from v3 — new project starts on v4 from day one, never mix
- `tiangolo/uvicorn-gunicorn-fastapi` Docker image is deprecated per FastAPI docs (2025) — build from `python:3.12-slim` directly
- `tsdown` is the officially recommended tsup successor; tsup is no longer actively maintained

### Expected Features

The minimum viable v1.1 milestone is precisely defined and bounded. There is no feature ambiguity — the table stakes are what ships, differentiators are deferred.

**Must have (table stakes):**
- `POST /chat` (FastAPI) — blocking response, wraps `ChatSession.send()`
- `GET /chat/stream` (FastAPI SSE) — token-by-token streaming via `ChatSession.stream()` async generator
- `GET /health` + `GET /health/ready` (FastAPI) — liveness and readiness probes required by Docker Compose
- `GET /config` + `POST /config` (FastAPI) — read and update active LLM backend over HTTP
- Session ID threading — `session_id` maps requests to persistent `ChatSession` instances across the conversation
- `POST /api/chat` + SSE passthrough (Express gateway) — proxies to FastAPI without buffering
- `GET /api/health` (Express) — aggregated health from gateway and Python service
- Error normalization middleware (Express) — consistent `{error, code, message}` shape regardless of upstream shape
- pnpm workspace root with `packages/gateway` and `packages/types` packages
- Docker Compose: `python-service` (internal port 8000), `gateway` (public port 3000), health checks, data volume

**Should have — defer to v1.2:**
- Structured SSE event types (`{type: "token" | "tool_call" | "done"}`) for rich client rendering
- `GET /api/sessions` and `DELETE /api/sessions/{id}` — session inspection and cleanup endpoints
- `GET /api/memory/search` — semantic memory query endpoint for debugging ChromaDB quality

**Defer to v2+:**
- `POST /api/voice` — audio upload over HTTP (requires multipart + STT pipeline)
- SSE reconnect / resumable streaming (requires Redis token buffer)
- OpenTelemetry distributed tracing (overkill for single-user personal tool)

**Anti-features — explicitly skip in v1.1:**
- Authentication / rate limiting — personal tool on localhost, auth adds friction with zero security benefit
- WebSockets — SSE is sufficient for one-way LLM output; WebSocket is only justified if client must push events mid-stream
- Redis or external message broker — in-process session dict is correct for single-user at this scale
- Nginx/Traefik reverse proxy — Docker Compose bridge networking covers service discovery
- gRPC between gateway and FastAPI — plain HTTP + JSON is correct at personal-use scale
- `LangServe` — deprecated; roll minimal FastAPI endpoints manually

### Architecture Approach

The architecture adds two new layers (FastAPI, Express) that wrap existing code without modifying it. Python stays at the repo root under `src/jarvis/`; only the new `src/jarvis/api/` package and two additive edits to existing files (`config.py`, `session.py`) constitute the Python changes. Node packages live under `packages/gateway/`. The FastAPI layer owns shared singleton initialization via the `lifespan` context manager — `MemoryStore`, `MemoryVectors`, `LLM`, `ActionExecutor` are created once at startup and stored in `app.state`, not re-created per request. The in-memory `session_store` module maps `session_id → ChatSession` and lives for the process lifetime. The Express gateway does no business logic — it validates inbound requests with Zod, sets SSE headers, and raw-pipes the stream from Python to the client.

**Major components:**
1. `src/jarvis/api/` (FastAPI layer) — HTTP boundary, session registry, SSE emission, lifespan singleton initialization
2. `src/jarvis/api/session_store.py` — in-memory `dict[str, ChatSession]`, `get_or_create()`, `delete()`, session lifecycle management
3. `packages/gateway/` (Express TS gateway) — public entry point, Zod validation, SSE raw pipe, error normalization
4. `docker-compose.yml` — `python-service` (internal, `expose: 8000`), `gateway` (public, `ports: 3000:3000`), `jarvis-net` bridge, `./data:/app/data` volume

**SSE wire path (end-to-end):**
`ChatSession.stream()` yields tokens → FastAPI `EventSourceResponse` wraps each as `event: token\ndata: <text>\n\n` → Express raw-pipes bytes to client via `upstreamRes.pipe(res)` with `res.flushHeaders()` called before the first byte.

**Key architecture decisions from research:**
- Voice pipeline stays on the **host**, not in Docker — audio hardware pass-through in containers is fragile; CLI path continues handling voice
- Single uvicorn worker — in-memory session dict breaks with multiple workers (no shared process memory); correct for single-user use
- `expose: "8000"` (not `ports:`) for python-service — FastAPI has no auth; only the gateway is public-facing
- `host.docker.internal` with `extra_hosts: host-gateway` on Linux for LM Studio connectivity from inside containers

### Critical Pitfalls

1. **Alpine base image breaks ML packages at runtime (C-1)** — Use `python:3.12-slim` exclusively. `onnxruntime`, `ctranslate2`, `numpy` require glibc; Alpine musl causes `ImportError: libgomp.so.1: cannot open shared object file` after a successful `docker build`.

2. **Multi-stage Docker build drops system `.so` libraries (C-2)** — The `COPY --from=builder site-packages` pattern copies Python packages but leaves behind `libgomp1`, `libsndfile1`, `libportaudio2`, `espeak-ng`, and `curl`. The runtime stage needs an explicit `apt-get install` for these before the COPY step.

3. **`asyncio.run()` inside FastAPI handlers causes event loop crash (C-3)** — Audit all `src/jarvis/` files for `asyncio.run()` before writing any FastAPI code. FastAPI/uvicorn owns the event loop; any nested `asyncio.run()` raises `RuntimeError`. All LLM-touching routes must be `async def` using `llm.astream()`, never `llm.invoke()`.

4. **Multiple uvicorn workers break in-process session state (C-4)** — Run with `--workers 1` only. Multiple workers split the in-memory `session_store` dict across processes; ChromaDB embedded mode gets SQLite write conflicts. Document the single-worker constraint in the Dockerfile CMD.

5. **SSE buffering in Express silently kills streaming (H-1)** — `res.flushHeaders()` must be called before the first write. Never apply `compression()` middleware to SSE routes. Use `upstreamRes.pipe(res)` raw pipe — never `await response.text()` which buffers the entire stream.

6. **Healthcheck `start_period` too short causes gateway restart loop (H-2)** — ChromaDB + sentence-transformers init can take 15-60 seconds. Set `--start-period=60s` on the Python service HEALTHCHECK. Without it, Docker marks the service unhealthy during startup and the gateway (`depends_on: condition: service_healthy`) never starts.

7. **`.env` baked into Docker image leaks API keys (H-6)** — Add `.env` to `.dockerignore` (separate from `.gitignore` — Docker does not respect `.gitignore`). Use `env_file: .env` in docker-compose.yml, not `COPY .env .` in any Dockerfile.

---

## Implications for Roadmap

Based on research, the suggested phase structure is three phases with hard gates between them. The ordering is dictated by the dependency graph: FastAPI must exist and be proven before Express proxies to it; both must work locally before being containerized.

### Phase 1: FastAPI Core (Python HTTP Layer)

**Rationale:** Everything else depends on the Python HTTP layer working. The Express gateway has nothing to proxy until FastAPI is running. Docker Compose has nothing to containerize until both services work locally. Start here. All changes are additive — the two required edits to existing files are backward-compatible.

**Delivers:** FastAPI service that exposes `POST /chat`, `GET /chat/stream` (SSE), `GET /health`, `GET /health/ready`, `GET /config`, `POST /config`. All 234 existing tests continue passing. CLI entry point is untouched. `uvicorn jarvis.api.app:app` starts; `curl -N "http://localhost:8000/chat/stream?message=hello"` streams tokens incrementally.

**Addresses:** All FastAPI table stakes from FEATURES.md. Session ID threading. Graceful startup/shutdown via `lifespan`. CORS middleware for future cross-origin clients.

**Avoids:**
- C-3: Audit for `asyncio.run()` before writing any routes
- C-4: Establish single-worker constraint in startup config from the first day
- H-5: Use `lifespan` for all singleton initialization — never inside route handlers
- M-3: Settings owned by lifespan; no `Settings()` re-instantiation inside handlers

**Gate:** All 234 existing tests pass. `curl -N "http://localhost:8000/chat/stream?message=hello"` streams tokens incrementally. `python -m jarvis` CLI behavior is identical to v1.0.

**Research flag:** Standard patterns — FastAPI SSE, lifespan, async generators are fully documented in official FastAPI docs. Skip `/gsd:research-phase`.

---

### Phase 2: Monorepo + Express Gateway (Node Layer)

**Rationale:** After FastAPI is proven, add the Node layer and monorepo structure. The pnpm workspace setup is foundational for this phase; Express routing depends on it. SSE passthrough is the hardest part of this phase and must be tested end-to-end with a real streaming model — not a mock — before the phase is considered complete.

**Delivers:** pnpm workspace at repo root with `packages/gateway` and `packages/types`. Express gateway proxying `POST /api/chat` and `GET /api/chat/stream` to FastAPI without buffering. Request logging, error normalization, environment-driven config. `tsx src/index.ts` starts the gateway; `curl http://localhost:3000/api/chat/stream` streams tokens without buffering.

**Addresses:** All Express gateway table stakes from FEATURES.md. pnpm workspace structure. Shared TypeScript types package preventing type drift between Node packages.

**Avoids:**
- H-1: `res.flushHeaders()` before first write; `upstreamRes.pipe(res)` raw pipe; no `compression()` on SSE routes
- H-4: Setup script (`Makefile` or `scripts/setup.sh`) chains `pnpm install && pip install -e ".[dev]"` — pnpm silently ignores Python
- M-2: `tsconfig.json` with `"lib": ["ES2022"]` only — no DOM lib to avoid `ReadableStream` type conflicts
- Mi-2: `.nvmrc` with `22` and `"engines": {"node": ">=22.0.0"}` to pin Node version

**Gate:** `curl http://localhost:3000/api/chat/stream` streams tokens incrementally through the Express proxy (verified with a slow-streaming local model). TypeScript compiles with no errors (`tsc --noEmit`). Vitest unit tests pass.

**Research flag:** SSE passthrough in Express is MEDIUM confidence (community-verified pattern, not official Express docs). Consider a quick spike test of `res.flushHeaders()` + raw pipe before full implementation. The combination of Node 22 + Express 5 is new enough to warrant a smoke test.

---

### Phase 3: Docker Compose

**Rationale:** Containerization is the final step — both services must work locally first. Docker adds operational complexity (healthchecks, multi-stage builds, networking) that is faster to debug when the underlying services are already proven and understood.

**Delivers:** `docker-compose.yml` with `python-service` (internal, port 8000) and `gateway` (public, port 3000) on `jarvis-net` bridge network. `./data:/app/data` volume persists SQLite + ChromaDB across container restarts. `docker compose up` starts everything; full request chain works in containers. `.dockerignore` excludes `.venv/`, `node_modules/`, `data/`, `.planning/`, `tests/`.

**Addresses:** All Docker Compose table stakes from FEATURES.md. `depends_on: condition: service_healthy`. Named network for service-name DNS. Volume mounts for data persistence and secret separation.

**Avoids:**
- C-1: `python:3.12-slim` base image — never Alpine
- C-2: Explicit `apt-get install libgomp1 libsndfile1 libportaudio2 espeak-ng curl` in runtime stage before COPY from builder
- H-2: `--start-period=60s` on Python service HEALTHCHECK
- H-6: `.dockerignore` created before first `docker build`; `env_file: .env` in Compose (never `COPY .env .`)
- M-1: Voice pipeline explicitly excluded from container — stays on host
- M-4: `COPY pyproject.toml` before `pip install` (not `COPY . .`) to preserve Docker layer cache
- Mi-1: `.dockerignore` present at repo root before any `docker build`

**Gate:** `docker compose up --wait` starts both services healthy. Smoke test: `docker compose exec python-service python -c "import faster_whisper; import sounddevice; import kokoro"` exits 0. `data/` persists after `docker compose down && docker compose up`.

**Research flag:** The system library list for C-2 is comprehensive but may be incomplete — actual transitive `.so` dependencies depend on which JARVIS features are compiled into the image. The smoke test import check in the gate will catch any gaps immediately.

---

### Phase Ordering Rationale

- **FastAPI before Express:** The gateway has nothing to proxy until FastAPI is running. Proving SSE end-to-end (LangChain → FastAPI → curl) confirms the Python layer before adding Node complexity.
- **Both services locally before Docker:** Debugging SSE buffering is much harder inside containers where logs require `docker compose logs` and restarts require rebuilds. Prove it works in dev first.
- **Monorepo setup in Phase 2, not Phase 1:** Python at repo root doesn't need pnpm. Creating the workspace in Phase 2 when the Node package actually exists prevents premature tooling overhead.
- **Voice pipeline explicitly excluded from Docker:** PITFALLS.md M-1 confirms this is a deliberate architectural decision — audio hardware pass-through in containers is Linux-only, version-specific, and breaks on PipeWire hosts. The CLI (`python -m jarvis`) handles voice on the host; Docker handles the HTTP backend only.
- **Single uvicorn worker from day one:** Document this in the Dockerfile CMD and docker-compose.yml immediately. Prevent future "optimization" that adds `--workers N` and silently breaks session state.

---

### Research Flags

Needs closer attention during execution:

- **Phase 2 (SSE proxy in Express):** MEDIUM confidence on buffering behavior with Node 22 + Express 5. Test early with a real slow-streaming LM Studio model — not a mock — to confirm tokens arrive incrementally before building the full gateway.
- **Phase 3 (system libraries in Docker runtime stage):** The list in PITFALLS.md C-2 covers all known JARVIS dependencies but may be incomplete for transitive `.so` requirements. Add the smoke test import check (`import faster_whisper; import sounddevice; import kokoro`) to the Docker Compose phase gate.

Standard patterns — skip `/gsd:research-phase`:

- **Phase 1 (FastAPI SSE + lifespan):** Fully documented in official FastAPI docs. The lifespan wiring pattern mirrors `__main__.py` already in the codebase. Well-understood and directly applicable.
- **Phase 3 (Docker Compose networking + healthchecks):** Official Docker docs are comprehensive and current. The `depends_on: service_healthy` + `start_period` pattern is standard.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against PyPI/npm on 2026-04-05. Node 22 LTS decision is mandatory (Node 20 EOL). tsdown is MEDIUM (newer project, officially recommended successor to tsup, but less battle-tested). |
| Features | HIGH | Table stakes are precisely bounded by PROJECT.md milestone goals. Anti-features list derived from stated constraints (personal use, local-first, privacy-first). No ambiguity in what ships vs defers. |
| Architecture | HIGH | FastAPI SSE and lifespan patterns confirmed against official docs. SSE raw-pipe passthrough in Express is MEDIUM (established community pattern, verified in multiple sources, not official Express 5 docs). Docker networking is HIGH (official docs). |
| Pitfalls | HIGH | Alpine/glibc incompatibility well-documented (multiple sources, onnxruntime GitHub issue #6800). SSE buffering patterns confirmed in FastAPI and Express sources. asyncio event loop pitfall is standard FastAPI knowledge. |

**Overall confidence:** HIGH

### Gaps to Address

- **tsdown build configuration for the gateway:** tsdown is newer than tsup. The specific `tsdown.config.ts` options for the Express gateway may need adjustment during execution. Use the official tsdown.dev docs as the reference; fall back to tsup config syntax if needed (tsdown maintains API compatibility).
- **Exact system library list in Docker runtime stage (C-2):** The list in PITFALLS.md covers known JARVIS dependencies but may miss transitive requirements. The Phase 3 smoke test gate (`import faster_whisper; import sounddevice; import kokoro`) will catch any gaps.
- **`session.py` `stream()` method implementation detail:** The method signature and contract are fully specified in ARCHITECTURE.md, but the exact sharing of preprocessing/postprocessing logic with `send()` (compression, memory injection, profile extraction) needs care to avoid code duplication without coupling. ARCHITECTURE.md recommends `stream()` share this logic with `send()`.
- **LM Studio Docker connectivity on Linux:** `host.docker.internal` requires `extra_hosts: ["host.docker.internal:host-gateway"]` on Linux (Docker Desktop handles this automatically on macOS/Windows). Verify this works in the specific Linux environment where JARVIS runs.

---

## Sources

### Primary (HIGH confidence)
- FastAPI official docs (fastapi.tiangolo.com) — SSE native support (0.135+), lifespan events, Docker deployment, deprecated tiangolo image
- pnpm official docs (pnpm.io/workspaces) — workspace YAML format, package resolution, `.npmrc` config
- Docker official docs — Compose `depends_on: service_healthy`, bridge networking, `extra_hosts: host-gateway`, build layer caching
- Node.js release schedule — Node 20 LTS EOL April 30, 2026; Node 22 LTS current active
- PyPI verified versions (2026-04-05): fastapi 0.135.3, uvicorn 0.43.0, pnpm 10.33.0
- npm verified versions (2026-04-05): express 5.1.x, zod 4.x, tsx 4.19.x, @types/express 5.0.6

### Secondary (MEDIUM confidence)
- Express 5 GA announcement (October 2024) — Promise-based error handling, Node >=18 requirement
- tsdown.dev + tsup GitHub — tsdown as officially recommended tsup successor (Rolldown-based)
- Streaming AI Agent with FastAPI and LangGraph (dev.to, 2025) — SSE + LangGraph async generator patterns
- Docker Compose depends_on with healthcheck (oneuptime.com, January 2026) — `service_healthy` pattern confirmed
- FastAPI in-memory session dict pattern (LangChain community, Latepoint, 2025) — module-level dict for session state

### Tertiary (LOW confidence — needs validation during execution)
- http-proxy-middleware SSE buffering behavior with `responseInterceptor` — community sources confirm it buffers; raw pipe is safer but documented in community not official docs
- Alpine musl + onnxruntime incompatibility — GitHub issue #6800 reported as open; Debian slim recommendation confirmed by multiple independent sources

---

*Research completed: 2026-04-05*
*Ready for roadmap: yes*
