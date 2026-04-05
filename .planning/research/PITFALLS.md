# Domain Pitfalls: JARVIS v1.1 Monorepo + API Layer

**Domain:** Adding FastAPI HTTP layer, Express TS gateway, Docker Compose, and pnpm monorepo to an existing Python LangChain/LangGraph assistant.
**Researched:** 2026-04-05
**Scope:** SUBSEQUENT MILESTONE — Pitfalls specific to the v1.1 integration, not repeating v1.0 Python-only pitfalls already catalogued.
**Overall confidence:** HIGH for architectural pitfalls (well-documented across official sources). MEDIUM for version-specific behaviors (verified against current PyPI/npm/GitHub but evolving ecosystem).

---

## How to Read This Document

Pitfalls are organized by severity and tagged with **[Phase]** so the roadmap knows which phase must address each risk. Pitfalls from the original v1.0 PITFALLS.md (agent loops, context window, tool schema drift, etc.) are NOT repeated here — they remain valid and should be consulted alongside this document.

---

## Critical Pitfalls

Mistakes that cause silent data corruption, service failures, or force rewrites of the integration layer.

---

### Pitfall C-1: Alpine musl/glibc Incompatibility — ML Packages Silently Fail or Refuse to Install

**What goes wrong:** Using `python:3.12-alpine` as the Docker base image. Several JARVIS core dependencies link against glibc at runtime: `numpy`, `torch` (via `sentence-transformers`), `onnxruntime` (via `openwakeword`), and `ctranslate2` (via `faster-whisper`). Alpine uses musl libc. Binary wheels distributed on PyPI target glibc. The result is either a build failure (`pip` must compile from source, which fails without the complete C toolchain) or a runtime crash (`ImportError: libgomp.so.1: cannot open shared object file`).

**Why it happens:** Alpine's smaller attack surface and image size look appealing. The musl vs glibc incompatibility is not obvious during `pip install` — some packages install successfully via source compilation only to crash when the compiled `.so` tries to load a glibc symbol that musl doesn't implement.

**Consequences:**
- `onnxruntime` (used by `openwakeword`) is documented as incompatible with Alpine musl — GitHub issue #6800 is open and not closed as of 2025.
- `faster-whisper` via `ctranslate2` requires `libgomp1` (OpenMP) which is a glibc-linked library.
- Build times explode: Python on Alpine with scientific packages compiles from source, turning a 5-minute build into 30+ minutes.
- The problem only manifests at runtime in some packages — CI can show "build successful" while the deployed container crashes immediately.

**Prevention:**
- Use `python:3.12-slim` (Debian-based, glibc). Full stop. This is already in STACK.md and must not be reconsidered.
- If image size is a concern: optimize via multi-stage builds and pip `--no-cache-dir`, not by switching to Alpine.
- The pythonspeed.com analysis (2019, still valid) documents Alpine builds being 50x slower for Python packages. Debian slim is the correct choice.

**Detection (warning signs):**
- Any `FROM python:*-alpine` line in a Dockerfile.
- `ImportError` referencing `.so` files or `libgomp`, `libstdc++`, `libgomp1` on container start.
- `pip install` that takes >15 minutes for scientific packages (source compilation fallback).

**Phase:** Monorepo restructure / Docker setup (Phase 1 of v1.1). Must be locked before any Dockerfile is committed.

---

### Pitfall C-2: Multi-Stage Build Drops System Libraries — site-packages Copy Leaves Orphaned .so Files

**What goes wrong:** The `COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages` pattern for Python multi-stage builds copies Python package files but leaves behind system-level shared libraries (`libgomp1`, `libstdc++6`, `libffi`, `libsndfile1`, `espeak-ng` for kokoro on Linux) that were installed in the builder stage via `apt-get`. The runtime stage starts clean (Debian slim baseline) and is missing these libraries.

**Why it happens:** Multi-stage builds are correctly taught as "copy only what you need." The pitfall is that `site-packages` contains `.so` files (compiled C extensions) that `dlopen()` system libraries at runtime. The `pip install` step doesn't document which system packages it depends on — you discover missing libraries at container startup.

**Specific libraries JARVIS needs in the runtime stage:**
- `libgomp1` — required by `ctranslate2` (faster-whisper). Install: `apt-get install -y libgomp1`
- `libsndfile1` — required by `soundfile` (kokoro audio output). Install: `apt-get install -y libsndfile1`
- `espeak-ng` — required by `kokoro` on Linux for phonemization. Install: `apt-get install -y espeak-ng`
- `libportaudio2` — required by `sounddevice`. Install: `apt-get install -y libportaudio2`
- `libstdc++6`, `libgcc-s1` — required by `onnxruntime` (openwakeword). Usually present in slim but verify.
- `curl` — required by the Docker `HEALTHCHECK` command in Dockerfile.python. Install: `apt-get install -y curl`

**Consequences:**
- Container starts without error from `docker build` but crashes immediately on first import of `faster_whisper`, `sounddevice`, or `kokoro`.
- The error is a cryptic `OSError` or `ImportError` on a `.so` file, not a Python dependency error.
- Hard to diagnose in CI because the build succeeds — the failure is runtime-only.

**Prevention:**
```dockerfile
# In the runtime stage, install system runtime libs explicitly:
FROM python:3.12-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    libsndfile1 \
    libportaudio2 \
    espeak-ng \
    curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
```

Alternatively, avoid the site-packages COPY pattern entirely and use a venv-based multi-stage build where the entire venv (including any shared libs it bundles) is copied as a unit. This is more portable.

**Detection (warning signs):**
- `OSError: libgomp.so.1: cannot open shared object file` on startup.
- Runtime stage Dockerfile with no `apt-get install` for system libraries.
- `docker run` failing with exit code non-zero immediately after `docker build` succeeds.

**Phase:** Docker setup. Add a smoke test (`docker compose up && docker compose exec python-service python -c "import faster_whisper; import sounddevice; import kokoro"`) to the phase acceptance criteria.

---

### Pitfall C-3: asyncio.run() Inside FastAPI Handler — Nested Event Loop Crash

**What goes wrong:** The existing JARVIS CLI uses `asyncio.run(main())` as the entry point. Some internal code may call `asyncio.run()` or create a new event loop directly (for sync→async bridging). When FastAPI/uvicorn runs, it owns the event loop. Any call to `asyncio.run()` inside a FastAPI route handler raises `RuntimeError: asyncio.run() cannot be called from a running event loop`.

**Why it happens:** The CLI entry point was designed to own its event loop. FastAPI is an ASGI framework that itself owns the event loop via uvicorn. The existing LangGraph `graph.invoke()` (sync) and `graph.ainvoke()` (async) may have been used interchangeably in the CLI — in FastAPI, only the async version is safe in route handlers.

**Specific patterns to audit in the existing JARVIS codebase:**
- `asyncio.run(...)` calls in `src/jarvis/core/` or session management code.
- Any `loop = asyncio.get_event_loop(); loop.run_until_complete(...)` patterns.
- `asyncio.to_thread()` wrapping synchronous code that itself calls asyncio operations (creates nested loops).
- LangGraph checkpoint writers that use sync SQLite under the hood (they may call `asyncio.run()` internally for connection management).

**Consequences:**
- The FastAPI startup appears to work, but the first `/chat` request crashes with `RuntimeError`.
- The error stack trace is deep and confusing — it doesn't point to the obvious call site.
- In testing with `TestClient` (which is synchronous), this bug may not appear — `TestClient` creates its own loop. The bug surfaces under uvicorn only.

**Prevention:**
- Audit every file in `src/jarvis/` for `asyncio.run()` before writing any FastAPI code.
- The FastAPI app must call `graph.ainvoke()` or `graph.astream_events()`, never `graph.invoke()` inside an `async` handler.
- If synchronous code must bridge to async, use `asyncio.to_thread()` (running sync code in a thread) — not the reverse.
- The `nest_asyncio` library can paper over this during development but is not a production solution — it masks the root cause.

**Detection (warning signs):**
- `grep -r "asyncio.run(" src/jarvis/` returns results outside of `__main__.py`.
- Route handler calling `.invoke()` instead of `.ainvoke()` on a LangGraph graph.
- Tests passing with `TestClient` but failing under `uvicorn` in integration tests.

**Phase:** FastAPI integration (wrapping the existing core). The audit must happen before writing any `app.py` route.

---

### Pitfall C-4: Multiple Uvicorn Workers Break In-Process LangGraph State

**What goes wrong:** Running FastAPI with `uvicorn --workers 4` (or `gunicorn -w 4 -k uvicorn.workers.UvicornWorker`) spawns 4 separate Python processes. Each process has its own memory. In-memory LangGraph state, the `Settings` singleton, ChromaDB in embedded mode, and the session object all get duplicated. A user's session in worker 1 is invisible to worker 2. ChromaDB embedded mode opens the same SQLite file from multiple processes, risking write conflicts.

**Why it happens:** Multi-worker deployment is the standard FastAPI production recommendation for CPU-bound workloads. JARVIS is not CPU-bound — it's I/O-bound (LLM API calls). The personal assistant use case (single user) means there's no horizontal scaling benefit. Using multiple workers adds state isolation problems with no benefit.

**Consequences:**
- ChromaDB embedded mode with SQLite: two workers trying to write simultaneously hit `SQLITE_BUSY` or `database is locked` errors.
- Session state (conversation history) could be split across workers — worker 2 sees a "new" session after worker 1 handled the last 10 messages.
- The `Settings` singleton re-reads `.env` in each worker process — inconsistent if `.env` changes mid-run (the hot-reload use case in v1.0).

**Prevention:**
- For v1.1, run uvicorn with a single worker: `uvicorn jarvis.api.app:app --host 0.0.0.0 --port 8000 --workers 1`.
- This is safe for a single-user personal assistant — there is no concurrency requirement beyond async I/O.
- Document this decision explicitly in the Dockerfile CMD and docker-compose.yml to prevent "optimization" that adds `--workers N` later.
- If future scaling is needed, the correct solution is a proper persistent session store (Redis, PostgreSQL), not multiple uvicorn workers sharing embedded SQLite.

**Detection (warning signs):**
- `--workers N` where N > 1 in any uvicorn startup command.
- `gunicorn` with more than 1 worker used for the Python service.
- `SQLITE_BUSY` or intermittent `database is locked` errors in logs.

**Phase:** Docker Compose / FastAPI deployment configuration. Set in Dockerfile.python CMD and document the single-worker constraint.

---

## High-Severity Pitfalls

Mistakes that cause degraded UX or hard-to-debug integration failures.

---

### Pitfall H-1: SSE Proxy Buffering — Express Buffers the LangChain Stream

**What goes wrong:** The Express gateway proxies SSE from FastAPI to the client. Without explicit configuration, Node.js HTTP responses are buffered. The stream from LangGraph arrives at Express in chunks, but Express accumulates them and flushes in bursts — or worse, waits until the stream ends and sends everything at once. The user sees no streaming, defeating the entire purpose.

**Why it happens:** Node.js `http.ServerResponse` has internal buffering. When Express writes chunks via `res.write()`, they don't necessarily flush immediately. Compression middleware (if added) will buffer the entire response. Nginx or any reverse proxy in front of Express will buffer SSE by default.

**Specific failure modes for the JARVIS stack:**
1. **Express `compression` middleware** (if added): Buffers entire response before applying gzip. Completely breaks SSE. Never use `compression` on SSE routes.
2. **Node.js response buffering**: Requires `res.flushHeaders()` called immediately when the SSE connection is established, before the first data event.
3. **Nginx proxy (if added later)**: Must have `proxy_buffering off` and `X-Accel-Buffering: no` response header. Without it, Nginx buffers the stream.
4. **Node fetch `ReadableStream` pipe**: When proxying SSE from Python via `fetch`, the response body must be piped directly as a `ReadableStream` — not read into a buffer first. Using `await response.text()` buffers the entire LLM response before forwarding.

**Prevention — required headers on every SSE endpoint in Express:**
```typescript
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache, no-transform');
res.setHeader('Connection', 'keep-alive');
res.setHeader('X-Accel-Buffering', 'no');  // disables nginx buffering
res.flushHeaders();  // CRITICAL: flush before first write
```

**Prevention — SSE proxy pattern in Express (Node fetch streaming):**
```typescript
const upstream = await fetch(`${PYTHON_SERVICE_URL}/chat/stream?message=${message}`);
// Pipe ReadableStream directly, do NOT await upstream.text()
upstream.body!.pipeTo(
  new WritableStream({
    write(chunk) { res.write(chunk); },
    close() { res.end(); }
  })
);
```

**Prevention — never apply `compression()` to SSE routes:**
```typescript
// Apply compression only to non-streaming routes
app.use('/chat/stream', noCompressionMiddleware);
app.use(compression());  // only applies to routes that didn't match above
```

**Detection (warning signs):**
- Client receives all tokens at once after a delay, not incrementally.
- `res.flushHeaders()` not called before the first SSE write.
- `compression` or `express-compression` middleware applied globally.
- Nginx/reverse proxy without `proxy_buffering off` for the SSE path.

**Phase:** Express gateway implementation (SSE proxy route). Must be tested end-to-end with a slow-streaming model (use a local LM Studio model with streaming enabled) to confirm tokens arrive incrementally.

---

### Pitfall H-2: Docker Compose Healthcheck Timeout Too Short — Gateway Starts Before Python Service Is Ready

**What goes wrong:** The Python FastAPI service with JARVIS dependencies (ChromaDB initializes SQLite, `sentence-transformers` loads the embedding model ~22MB, `faster-whisper` model loads on first use) can take 15-60 seconds to be truly ready. The Docker Compose `HEALTHCHECK` default `--start-period` is 0 seconds. If the healthcheck fires before the service is ready, it marks the service as unhealthy. The gateway (`depends_on: condition: service_healthy`) never starts.

**Why it happens:** The `start_period` parameter tells Docker to ignore healthcheck failures during the grace period. Without it, Docker begins counting failures immediately. A service that takes 30 seconds to load its ML models will fail 6 health checks (at 5s intervals) before becoming healthy, causing Docker Compose to mark it as unhealthy permanently.

**Default values (all too aggressive for ML services):**
- `--interval=30s` (time between checks)
- `--timeout=30s` (time before a check times out)
- `--retries=3` (failures before unhealthy)
- `--start-period=0s` (grace period — **must be set**)

**Prevention:**
```dockerfile
HEALTHCHECK --interval=10s --timeout=5s --retries=10 --start-period=60s \
  CMD curl -f http://localhost:8000/health || exit 1
```

The `--start-period=60s` gives the service 60 seconds to start before failures count against the retry limit. During startup, a single success ends the start period early.

Additionally, the `/health` endpoint must be implemented before any heavy model loading to give a "warming up" response:
```python
@app.get("/health")
async def health():
    return {"status": "ok", "ready": app.state.agent_ready}
```

The gateway should handle `agent_ready: false` gracefully (503 response to the caller) rather than crashing.

**Detection (warning signs):**
- `HEALTHCHECK` with no `--start-period` in the Python Dockerfile.
- Gateway service never starts in Docker Compose (`docker compose ps` shows it waiting).
- `curl -f http://localhost:8000/health` fails for the first 30+ seconds of Python service startup.

**Phase:** Docker Compose setup. Test with `docker compose up --wait` which blocks until all services are healthy.

---

### Pitfall H-3: LangGraph SSE Stream Not Cleaned Up on Client Disconnect

**What goes wrong:** A client (browser, CLI) disconnects mid-stream. The FastAPI `StreamingResponse` generator keeps running — pumping tokens into a closed connection. The LangGraph agent continues calling the LLM, consuming tokens, locking the session, and blocking the next request for the same session. For a personal assistant with a single session, this means JARVIS gets stuck and can't accept new input until the orphaned stream times out.

**Why it happens:** `StreamingResponse` with an async generator doesn't automatically cancel the generator when the client disconnects. The generator is only cancelled when the ASGI server (uvicorn) propagates the disconnect — but only if the generator is actively `await`-ing and the ASGI disconnect event is checked.

The `anyio.CancelScope(shield=True)` workaround for cleanup inside LangGraph nodes is documented as broken in certain configurations (LangChain forum 2025).

**Prevention:**
```python
from fastapi import Request

@app.get("/chat/stream")
async def chat_stream(request: Request, message: str):
    async def generate():
        try:
            async for event in agent.astream_events({"input": message}, version="v2"):
                if await request.is_disconnected():
                    break  # client gone — stop generating
                if event["event"] == "on_chat_model_stream":
                    token = event["data"]["chunk"].content
                    yield f"data: {json.dumps({'token': token})}\n\n"
        except asyncio.CancelledError:
            pass  # uvicorn cancels the generator on disconnect
        finally:
            # Release session lock, cleanup state
            pass
    return StreamingResponse(generate(), media_type="text/event-stream")
```

Key: check `await request.is_disconnected()` inside the generator loop. FastAPI's `Request` object exposes this.

**Detection (warning signs):**
- LLM API calls continuing after the client has closed the connection (visible in LM Studio or API logs).
- Session locked for minutes after a client disconnect.
- No `request.is_disconnected()` check in the SSE generator.

**Phase:** FastAPI SSE endpoint implementation. Add a test that disconnects mid-stream and verifies the generator terminates.

---

### Pitfall H-4: pnpm workspace installs fail silently for Python — No Python Isolation

**What goes wrong:** `pnpm install` at the repo root processes `pnpm-workspace.yaml` and installs Node dependencies. Python is not managed by pnpm. If a developer runs `pnpm install` thinking it sets up the full dev environment, they have a broken Python setup with no error (pnpm silently ignores `pyproject.toml`). Conversely, `pip install -e .` doesn't install Node dependencies.

**Secondary problem:** The root `package.json` `test:python` script (`pytest`) runs in the shell's active Python environment. If the developer's system Python doesn't have the JARVIS packages installed, pytest silently uses the wrong interpreter.

**Why it happens:** pnpm is JavaScript-only. Mixed-language monorepos require explicit documentation and tooling to bridge the language boundaries.

**Prevention:**
- Create a `Makefile` or `scripts/setup.sh` that runs BOTH `pnpm install` AND `pip install -e ".[dev]"`.
- Add a `check-env` target / script that validates both `node_modules` and `.venv` (or system packages) are present.
- The root `package.json` `dev` script should error visibly if Python packages aren't installed (wrap in a check: `python -c "import jarvis" || (echo "Run: pip install -e ." && exit 1)`).
- Never put Python-specific tooling (pytest, ruff, mypy) under pnpm scripts — keep Python tools as standalone commands or in a Makefile.
- Document the setup in README: `pnpm install && pip install -e ".[dev]"` — both required.

**Detection (warning signs):**
- Developer reports "it worked after I ran `pnpm install`" but Python tests fail.
- `pnpm run test:python` running against wrong Python interpreter.
- No `Makefile` or `setup.sh` that chains both install steps.

**Phase:** Monorepo setup (first phase of v1.1). The setup script is part of the foundation deliverable.

---

### Pitfall H-5: FastAPI Lifespan Not Used — Session Initialized Per-Request

**What goes wrong:** The LangGraph agent, ChromaDB collection, and Settings singleton are initialized inside the route handler (on first request) rather than in FastAPI's `lifespan` context manager. The first request takes 30+ seconds (model loading, DB initialization). Subsequent requests are fast. But if the service restarts mid-conversation, the second request re-initializes everything — the session state is gone.

**Worse case:** If two requests arrive simultaneously before initialization completes, both try to initialize the agent. ChromaDB opens two connections to the same embedded SQLite file simultaneously.

**Why it happens:** The `@app.on_event("startup")` decorator (deprecated) and the `lifespan` pattern require explicit coding. The "quick" implementation puts everything in `__init__` or at module level.

**Prevention:**
```python
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs once at startup, before any requests
    settings = Settings()
    agent = await create_agent(settings)
    chroma_client = initialize_chromadb(settings)
    
    app.state.agent = agent
    app.state.settings = settings
    
    yield  # app is running
    
    # Runs once at shutdown
    await cleanup_agent(agent)

app = FastAPI(lifespan=lifespan)
```

The `app.state` object is shared across all requests within the same worker process (safe with single-worker deployment per Pitfall C-4).

**Detection (warning signs):**
- Agent or ChromaDB initialization code inside route handler functions.
- `@app.on_event("startup")` (deprecated — use lifespan).
- First request taking significantly longer than subsequent requests.

**Phase:** FastAPI application factory (`app.py`) — the lifespan pattern must be established before any routes are written.

---

### Pitfall H-6: Docker Compose Secrets / .env Leakage — API Keys Baked Into Image

**What goes wrong:** The `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `LM_STUDIO_URL` from `.env` gets baked into the Docker image via `COPY .env .` or `ARG API_KEY=...` in the Dockerfile. The image is then shared, pushed to a registry, or stored in CI cache — leaking keys.

**Why it happens:** pydantic-settings loads `.env` via `python-dotenv`. The temptation is to `COPY .env .` so the container finds it. This works locally and seems harmless until the image is shared.

**Consequences:**
- API keys in a Docker image layer are trivially extractable with `docker history` or layer inspection.
- `.env` in the build context means it's included in every `docker build` even without `COPY`.

**Prevention:**
- Add `.env` to `.dockerignore` (not just `.gitignore`). A separate `.dockerignore` file is required — Docker does not automatically respect `.gitignore`.
- Pass secrets at runtime via Docker Compose `env_file` or environment:
```yaml
services:
  python-service:
    env_file: .env          # loaded at container start, not baked into image
    # NOT: COPY .env . in Dockerfile
```
- The `.env` file lives on the host only. The image contains no secrets.
- pydantic-settings with `env_file=None` in the `model_config` still reads environment variables injected at runtime via Docker Compose — no code change needed.

**Detection (warning signs):**
- `COPY .env .` in any Dockerfile.
- `ARG` with default values containing API keys.
- No `.dockerignore` file in the repo root.
- `docker history <image>` reveals environment variables.

**Phase:** Docker setup. Add `.dockerignore` as a required deliverable alongside `Dockerfile.python`.

---

## Moderate Pitfalls

Mistakes that cause integration friction or debugging overhead.

---

### Pitfall M-1: Voice Pipeline (sounddevice/mic) Inside Docker — Audio Device Not Accessible

**What goes wrong:** The Docker container running the Python FastAPI service can't access the host's microphone or speakers. `sounddevice` requires access to `/dev/snd` (ALSA) or a PulseAudio/PipeWire socket. Neither is available by default in a Docker container. `openwakeword` and the voice pipeline will fail silently or crash with `PortAudioError: No Default Input Device Available`.

**Why it happens:** Docker containers are isolated from host hardware. Audio devices require device pass-through (`--device /dev/snd`) and either sharing the ALSA device directly or connecting to the host PulseAudio socket. Both approaches are fragile across Linux distributions (ALSA vs PulseAudio vs PipeWire).

**The JARVIS architecture decision:** The voice pipeline (sounddevice, openwakeword, kokoro TTS) is a local desktop feature — it inherently requires host hardware access. Containerizing it adds complexity with no benefit.

**Prevention strategy — split the architecture:**
- The Docker container serves the **HTTP/LangChain backend only** (no voice pipeline).
- The voice pipeline runs **on the host** (as it did in v1.0, via `python -m jarvis` CLI).
- Voice input → text transcription happens on the host → HTTP POST to the containerized FastAPI service.
- This is the correct architectural split: containers for stateless HTTP services, host for hardware-dependent I/O.

**If containerizing voice is truly needed** (future milestone):
```yaml
services:
  python-service:
    devices:
      - /dev/snd:/dev/snd    # ALSA pass-through
    environment:
      PULSE_SERVER: "unix:${XDG_RUNTIME_DIR}/pulse/native"
    volumes:
      - "${XDG_RUNTIME_DIR}/pulse:/run/user/1000/pulse"  # PulseAudio socket
```
This is Linux-only, version-specific, and breaks on PipeWire hosts without compatibility layer.

**Detection (warning signs):**
- `PortAudioError: No Default Input Device Available` in container logs.
- `sounddevice.query_devices()` returning empty list inside container.
- Any Dockerfile that installs `sounddevice` without corresponding device pass-through config.

**Phase:** Docker architecture design. Document the split explicitly: voice pipeline stays on host, HTTP backend goes in container. This is a design decision, not a bug fix.

---

### Pitfall M-2: Express Type Issues With SSE and Node fetch ReadableStream

**What goes wrong:** TypeScript's type definitions for `ReadableStream` differ between browser DOM types (`lib.dom.d.ts`) and Node.js types (`@types/node`). When proxying the FastAPI SSE response via `fetch` in Node, the `Response.body` type is `ReadableStream<Uint8Array> | null` in DOM types but `ReadableStream` (Node version) in `@types/node`. These are not the same interface. TypeScript throws type errors when trying to pipe the body to the Express response.

**Why it happens:** Node 22 has full `fetch` implementation built in, but its `Response` type comes from Node's type definitions, not the browser's. The `@types/node` package declares `fetch` with its own `Response` type that doesn't exactly match DOM types. Mixing them (e.g., importing `Response` from `node-fetch` or `undici`) creates additional confusion.

**Prevention:**
- Use `tsconfig.json` with `"lib": ["ES2022"]` — do NOT include `"DOM"`. This prevents the browser type definitions from conflicting with Node types.
- The `moduleResolution: "bundler"` setting (from STACK.md) helps resolve the Node/browser type ambiguity.
- For the SSE proxy, use the pipe approach with explicit type casting:
```typescript
// lib/python-client.ts
export async function streamChat(message: string, res: Response): Promise<void> {
  const upstream = await fetch(`${PYTHON_SERVICE_URL}/chat/stream?${params}`);
  if (!upstream.body) throw new Error('No stream body');
  
  // Explicitly type the reader to avoid DOM/Node conflicts
  const reader = upstream.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
}
```

**Detection (warning signs):**
- TypeScript errors referencing `ReadableStream` type incompatibility.
- `"lib": ["ES2022", "DOM"]` in tsconfig.json.
- Type errors on `Response.body` when using Node's built-in `fetch`.

**Phase:** Express gateway implementation (streaming proxy route).

---

### Pitfall M-3: pydantic-settings Hot-Reload Breaks Inside FastAPI Lifespan

**What goes wrong:** The v1.0 hot-reload pattern (`Settings()` re-instantiation reads `.env` fresh each time) conflicts with the FastAPI lifespan pattern. In v1.0, settings were re-read per request. In the FastAPI lifespan, settings are loaded once at startup and stored in `app.state.settings`. Changes to `.env` after startup have no effect.

**Why it happens:** The lifespan pattern (correctly) initializes once. The v1.0 pattern (correctly) reads fresh on each call. These two patterns are incompatible without an explicit mechanism.

**Prevention:**
- For v1.1, accept that settings require a service restart to take effect — this is the standard 12-factor app behavior.
- Document in v1.1 that `SIGTERM + docker compose up` is the hot-reload mechanism, not `.env` file watching.
- If live `.env` reload is needed in a future milestone, use a dedicated `/reload-config` admin endpoint that re-reads settings and re-initializes the agent.
- Remove any code that creates `Settings()` inside route handlers (it would no longer be the singleton from `app.state`).

**Detection (warning signs):**
- `Settings()` instantiation inside a route handler after lifespan is established.
- Test expecting settings changes to take effect without restart.
- Two different `Settings` objects in the same request lifecycle.

**Phase:** FastAPI integration — establish the settings ownership boundary (lifespan owns settings) before writing routes.

---

### Pitfall M-4: Docker Build Cache Invalidated by pyproject.toml Changes — 30-Minute Rebuilds

**What goes wrong:** The Dockerfile copies `pyproject.toml`, runs `pip install`, then copies source code. Any change to `pyproject.toml` invalidates the pip install layer — Docker rebuilds from scratch, downloading and installing 2GB+ of ML packages. This makes the inner dev loop for the Python service unusably slow.

**Why it happens:** Docker layer caching is content-addressed. Changing `pyproject.toml` (even a comment) invalidates the `COPY pyproject.toml .` layer and everything after it.

**Prevention:**
```dockerfile
# CORRECT order: copy only what pip needs, then install, then copy source
FROM python:3.12-slim AS builder
WORKDIR /app
COPY pyproject.toml ./               # copy ONLY pyproject.toml
RUN pip install --no-cache-dir .     # this layer caches unless pyproject.toml changes
COPY src/ ./src/                     # source changes don't invalidate the pip layer

# WRONG: copying src/ before pip install busts the cache on every source change
# COPY . .
# RUN pip install .
```

Additionally, for development, use volume mounts instead of rebuilding:
```yaml
services:
  python-service:
    volumes:
      - ./src:/app/src    # source changes reflected without rebuild (not for prod)
```

**Detection (warning signs):**
- `COPY . .` before `pip install` in the Dockerfile.
- Every source code change triggers a full `pip install` during `docker compose up --build`.
- Developer reporting >10 minute build times after small code changes.

**Phase:** Docker setup. The COPY order must be established correctly from the first Dockerfile commit.

---

### Pitfall M-5: Reverse Proxy Timeout During Long LLM Inference

**What goes wrong:** When the LLM (especially a large local model via LM Studio) takes >30-60 seconds to generate a response, intermediate proxies (nginx, load balancers) timeout the connection before the first token arrives. The client receives a 504 Gateway Timeout before seeing any output.

**Specific to JARVIS:** The SSE connection sends a `\n\n` heartbeat before the first real token. If the LLM hasn't started generating within the proxy's idle timeout, the connection is killed.

**Prevention:**
- Implement an SSE heartbeat from FastAPI: send a comment line (`: heartbeat\n\n`) every 15 seconds while waiting for the first token.
- This is distinct from actual data — SSE clients ignore comment lines but proxies see activity and don't timeout.
```python
async def generate_with_heartbeat(message: str):
    # Start the agent in a task
    agent_task = asyncio.create_task(
        agent.ainvoke({"input": message})
    )
    # Send heartbeats until agent responds
    while not agent_task.done():
        yield ": heartbeat\n\n"
        await asyncio.sleep(15)
    result = await agent_task
    yield f"data: {json.dumps({'result': result['output']})}\n\n"
```

**Detection (warning signs):**
- 504 errors with local LLM models after 30-60 seconds.
- No heartbeat mechanism in the SSE generator.
- Nginx or other proxy without `proxy_read_timeout` tuned for LLM workloads.

**Phase:** FastAPI SSE endpoint. Test specifically with a slow local model.

---

## Minor Pitfalls

Quick wins that prevent debugging sessions.

---

### Pitfall Mi-1: Missing .dockerignore — Huge Build Context Sent to Docker Daemon

**What goes wrong:** Without `.dockerignore`, `docker build` sends the entire repo to the Docker daemon as build context, including `.venv/` (1-2GB of Python packages), `node_modules/` (hundreds of MB), `data/` (ChromaDB and SQLite files), `.planning/`, `tests/audio-teste/` (audio test files). Build context upload takes minutes even on localhost.

**Prevention:**
```
# .dockerignore (repo root)
.venv/
node_modules/
packages/*/node_modules/
data/
.planning/
tests/
.git/
*.pyc
__pycache__/
.env
*.env
dist/
```

**Phase:** Docker setup — first file created before any `docker build` command.

---

### Pitfall Mi-2: pnpm-lock.yaml Committed Without Node Version Pin

**What goes wrong:** `pnpm-lock.yaml` locks package versions but not the Node version. A developer on Node 20 and a developer on Node 22 generate different lockfiles for the same `package.json`. CI uses a different Node version than local. Inconsistent lockfile contents cause CI failures.

**Prevention:**
- Add `"engines": {"node": ">=22.0.0"}` to root `package.json`.
- Add an `.nvmrc` file with `22` at the repo root.
- Use `packageManager: "pnpm@10.33.0"` in `package.json` (already in STACK.md) — pnpm enforces this via Corepack.

**Phase:** Monorepo setup — before first `pnpm install`.

---

### Pitfall Mi-3: CORS Misconfiguration — Express Gateway Rejects Browser Clients

**What goes wrong:** When a future web UI (deferred to a later milestone but accounted for in the architecture) calls the Express gateway from a browser, CORS headers are missing. The browser blocks the request. This is a non-issue for the current CLI client but will become a blocker the moment any browser-based client is added.

**Prevention:**
- Install and configure `cors` in Express from the start:
```typescript
import cors from 'cors';
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
  credentials: false,  // personal assistant, no auth cookies
}));
```
- SSE endpoints specifically need CORS preflight handled — ensure `cors()` middleware runs before route handlers.

**Phase:** Express gateway setup — configure CORS in the app factory before routes.

---

### Pitfall Mi-4: Docker Compose Service DNS — Hardcoded localhost in Python Code

**What goes wrong:** The existing Python code may reference `localhost` for internal service calls (unlikely since v1.0 is Python-only, but defensive). In Docker Compose, services communicate via service name DNS, not `localhost`. If any new FastAPI code references `localhost:8000` as its own address or a test fixture references `localhost:3000`, it will fail inside the container.

**Prevention:**
- Service-to-service calls in Docker Compose must use service names: `http://python-service:8000`, `http://gateway:3000`.
- Use the `PYTHON_SERVICE_URL` environment variable in the Express gateway (set to `http://python-service:8000` in docker-compose.yml).
- Never hardcode hostnames — all service URLs must come from environment variables.

**Phase:** Docker Compose configuration — establish the ENV VAR pattern in docker-compose.yml before writing any service-to-service code.

---

## Phase-Specific Warnings for v1.1 Roadmap

| Phase Topic | Pitfall | Mitigation | Severity |
|-------------|---------|------------|----------|
| Monorepo setup | pnpm doesn't manage Python (H-4) | Setup script chains both installs | High |
| Monorepo setup | Node version inconsistency (Mi-2) | `.nvmrc` + `engines` field | Minor |
| Docker Compose base image | Alpine musl failure (C-1) | Use python:3.12-slim only | Critical |
| Docker Compose Python image | Missing runtime .so libraries (C-2) | Explicit `apt-get` for libgomp1 etc. | Critical |
| Docker Compose Python image | .env baked into image (H-6) | `.dockerignore` + runtime `env_file` | High |
| Docker Compose Python image | Build cache busted by src changes (M-4) | `COPY pyproject.toml` before `COPY src/` | Moderate |
| Docker Compose Python image | Huge build context (Mi-1) | `.dockerignore` before first build | Minor |
| Docker Compose Python image | Healthcheck grace period (H-2) | `--start-period=60s` in HEALTHCHECK | High |
| Docker Compose multi-worker | Worker state isolation (C-4) | `--workers 1` explicitly set and documented | Critical |
| Docker Compose networking | Hardcoded localhost (Mi-4) | `PYTHON_SERVICE_URL` from env in all code | Minor |
| FastAPI integration | asyncio.run() in existing code (C-3) | Audit all files before writing routes | Critical |
| FastAPI integration | Per-request initialization (H-5) | lifespan context manager from day one | High |
| FastAPI integration | Settings hot-reload incompatibility (M-3) | Document restart-to-reload behavior | Moderate |
| FastAPI SSE endpoint | Client disconnect orphan stream (H-3) | `request.is_disconnected()` check | High |
| FastAPI SSE endpoint | Proxy timeout on slow LLM (M-5) | SSE heartbeat every 15s | Moderate |
| Express gateway | SSE buffering (H-1) | `res.flushHeaders()` + no compression | High |
| Express gateway | TypeScript ReadableStream types (M-2) | `"lib": ["ES2022"]` no DOM types | Moderate |
| Express gateway | CORS for future browser clients (Mi-3) | cors() from day one in app factory | Minor |
| Voice pipeline | Audio device in Docker (M-1) | Voice stays on host, HTTP only in container | High |

---

## Integration Pitfalls (Cross-Cutting)

Pitfalls that span multiple services and phases.

### The Split Environment Problem

The JARVIS system will run in two modes simultaneously:
1. **Containerized mode**: Python FastAPI service + Express gateway in Docker Compose.
2. **Host mode**: Voice pipeline CLI (`python -m jarvis`) runs on the host and speaks to the containerized FastAPI.

This split is correct (Pitfall M-1 rationale) but creates testing complexity: integration tests must account for both modes. A test that `docker compose up` and then runs `python -m jarvis --mode http` is testing the full stack. Tests that run pytest only test the Python core in isolation.

**Required deliverable:** A documented test matrix showing which tests cover which mode. Do not ship v1.1 without confirming that the host-CLI-to-container-API path works end-to-end.

### The .env Ownership Split

With pnpm workspaces + Python, there are now three consumers of `.env`:
1. Python/FastAPI: `pydantic-settings` reads it via `python-dotenv`.
2. Node/Express: `process.env` reads environment variables injected at runtime.
3. Docker Compose: `env_file: .env` injects variables into containers.

All three must agree on variable names. The `PYTHON_SERVICE_URL` used by Express is a new variable not in the current `.env`. Establish a single `.env.example` that documents all variables for all services, and ensure it's kept in sync.

---

## Sources

**Confidence assessment:**

| Finding | Confidence | Source |
|---------|------------|--------|
| Alpine musl/glibc incompatibility | HIGH | GitHub issue #6800 (onnxruntime/alpine, open), pythonspeed.com analysis, Docker docs glibc-musl page |
| Multi-stage missing .so files | HIGH | Documented in pythonspeed.com multi-stage article, GitHub docker-library/python issue #610 |
| asyncio.run() in FastAPI | HIGH | FastAPI GitHub issue #543, LangChain GitHub issue #8494, official asyncio docs |
| Multiple uvicorn workers state isolation | HIGH | FastAPI deployment docs, gunicorn discussion #3017 |
| SSE buffering in Express | HIGH | MDN SSE docs, nginx SSE config docs, practical implementations |
| Docker healthcheck start_period | HIGH | Official Docker Compose docs, docker-compose-healthcheck GitHub |
| Client disconnect SSE cleanup | MEDIUM | LangGraph discussion #1601, FastAPI discussion #7572, LangChain forum 2025 |
| pnpm Python interop limits | HIGH | pnpm GitHub issues #2457 and #3164, pnpm docs |
| libgomp1 requirement for faster-whisper | MEDIUM | Inferred from CTranslate2 OpenMP dependency, SYSTRAN/faster-whisper #543 |
| pydantic-settings Docker env_file pattern | HIGH | Official pydantic-settings docs, FastAPI settings docs |

**Reference URLs:**
- Docker glibc/musl documentation: https://docs.docker.com/dhi/core-concepts/glibc-musl/
- onnxruntime Alpine issue: https://github.com/microsoft/onnxruntime/issues/6800
- asyncio.run() in FastAPI: https://github.com/fastapi/fastapi/issues/543
- FastAPI lifespan events: https://fastapi.tiangolo.com/advanced/events/
- LangGraph SSE streaming guide (2025): https://dev.to/kasi_viswanath/streaming-ai-agent-with-fastapi-langgraph-2025-26-guide-1nkn
- LangGraph client disconnect discussion: https://github.com/langchain-ai/langgraph/discussions/1601
- FastAPI disconnect handling: https://github.com/fastapi/fastapi/discussions/7572
- Docker Compose startup order: https://docs.docker.com/compose/how-tos/startup-order/
- pydantic-settings environment priority: https://docs.pydantic.dev/latest/concepts/pydantic_settings/
- FastAPI settings docs: https://fastapi.tiangolo.com/advanced/settings/
- SSE nginx configuration: https://oneuptime.com/blog/post/2025-12-16-server-sent-events-nginx/view
