# Technology Stack

**Project:** JARVIS v1.1 — Monorepo + API Layer
**Researched:** 2026-04-05
**Scope:** NEW additions only. Existing Python core (LangChain, LangGraph, ChromaDB, voice, vision, PC control) is validated and unchanged. This document covers the v1.1 stack additions: monorepo structure, FastAPI HTTP layer, Express TS gateway, Docker Compose.

---

## What Is NOT Changing

The Python core stack from v1.0 is pinned and validated via 234 passing tests:

- `langchain==1.2.14`, `langgraph==1.1.4`, `langchain-openai==1.1.12`
- `chromadb==1.5.5`, `pydantic==2.12.5`, `pydantic-settings==2.13.1`
- `faster-whisper==1.2.1`, `kokoro>=0.9.4`, `sounddevice>=0.5.0`
- `pyautogui>=0.9.54`, `psutil>=5.9`, `pytesseract>=0.3.13`

Do NOT re-evaluate these unless a hard blocker appears.

---

## New Stack: FastAPI HTTP Layer

### Core Dependencies (add to existing pyproject.toml)

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| fastapi | 0.135.3 | ASGI web framework for Python HTTP service | Async-native, auto OpenAPI docs, Pydantic v2 integration, native SSE via `EventSourceResponse`. Requires Python >=3.10 — compatible with current stack. |
| uvicorn | 0.43.0 | ASGI server | Standard production server for FastAPI. `uvicorn[standard]` pulls in `watchfiles` (reload), `websockets`, `httptools` (faster HTTP parser). |
| python-multipart | >=0.0.18 | Multipart form data support | Required by FastAPI for `Form()` and `UploadFile` parameters. Not needed if all endpoints use JSON, but include as safety. |

**Installation delta (add to pyproject.toml `[project.dependencies]`):**
```toml
"fastapi==0.135.3",
"uvicorn[standard]==0.43.0",
"python-multipart>=0.0.18",
```

**Confidence:** HIGH — versions verified against PyPI on 2026-04-05.

### FastAPI Entry Point Pattern

The existing `jarvis` package (`src/jarvis/`) stays intact. FastAPI wraps it:

```
src/jarvis/
├── api/                  # NEW — FastAPI layer
│   ├── __init__.py
│   ├── app.py            # FastAPI app factory
│   ├── routes/
│   │   ├── chat.py       # POST /chat, GET /chat/stream (SSE)
│   │   └── health.py     # GET /health
│   └── middleware.py     # CORS, request IDs
└── ... (existing core — untouched)
```

**Why a factory (`app.py`) not module-level `app`:** Allows `TestClient(create_app())` in tests without importing side effects from the module. Same pattern already used for `Settings` singleton.

### Streaming Pattern (LangChain → SSE)

LangGraph `astream_events` → FastAPI `EventSourceResponse`. No additional library needed:

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import json

async def stream_generator(message: str):
    async for event in agent.astream_events({"input": message}, version="v2"):
        if event["event"] == "on_chat_model_stream":
            token = event["data"]["chunk"].content
            yield f"data: {json.dumps({'token': token})}\n\n"
    yield "data: [DONE]\n\n"

@app.get("/chat/stream")
async def chat_stream(message: str):
    return StreamingResponse(
        stream_generator(message),
        media_type="text/event-stream"
    )
```

**Confidence:** HIGH — pattern is documented and used in production in 2026.

---

## New Stack: Express TypeScript Gateway

### Runtime

| Technology | Version | Why |
|-----------|---------|-----|
| Node.js | 22 LTS | Current LTS (active until April 2027). Native TypeScript type stripping (`--strip-types`) available from 22.18+. Use 22 not 20 — 20 LTS ended April 2026. |

**Confidence:** HIGH — Node 20 LTS ended April 30, 2026. Node 22 is the correct choice for any new project starting now.

### Production Dependencies

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| express | ^5.1.0 | HTTP gateway framework | Express 5 is now GA (released Oct 2024). Promise-based error handling, async route support without try/catch boilerplate. Requires Node >=18, fully compatible with Node 22. |
| zod | ^4.0.0 | Request schema validation | Zod 4 (April 2026) is the current stable. Smaller bundle, better performance than v3. Validate all inbound requests before proxying to Python. |

**Note on zod v4:** Breaking change from v3 — import path unchanged (`import { z } from "zod"`), but some APIs changed. Since this is a new package, use v4 from the start. Do not mix v3 and v4 in the same package.

**Confidence:** HIGH for Express 5 (GA since Oct 2024). HIGH for zod v4 (verified npm April 2026).

### Dev Dependencies

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| typescript | ^5.8 | TypeScript compiler | Current stable series. `strict: true` — required. |
| @types/node | ^22.0.0 | Node 22 type definitions | Match the runtime version. |
| @types/express | ^5.0.6 | Express 5 type definitions | Current stable, matches Express 5. |
| tsx | ^4.19 | TypeScript execution for dev | Runs `.ts` files directly via esbuild. 25x faster than ts-node. No tsconfig requirements for basic usage. Use for `dev` script: `tsx watch src/index.ts`. |
| tsdown | ^0.12 | TypeScript bundler for build | Successor to tsup (tsup is no longer actively maintained). Powered by Rolldown (Rust), ESM-first, compatible with tsup config. Use for `build` script. |
| vitest | ^3.0 | Unit testing | Faster than Jest, native TypeScript, no transform config needed. Prefer over Jest for new Node projects in 2026. |

**Why tsdown over tsup:** tsup maintainer officially recommends migrating to tsdown. tsdown is esm-first, uses Rolldown (Rust) for faster builds, and maintains API compatibility with tsup. Since this is a new package, start with tsdown directly.

**Why tsx for dev, tsdown for build:** tsx gives instant dev feedback (runs source directly, no dist/ step). tsdown compiles to `dist/` for Docker production image — only compiled JS goes into the container.

**Confidence:** MEDIUM for tsdown (newer project, verified npm April 2026 but less battle-tested than tsup). HIGH for tsx, typescript, @types packages.

### Package Structure

```
packages/gateway/
├── package.json
├── tsconfig.json
├── tsdown.config.ts          # or tsdown.config.js
└── src/
    ├── index.ts              # entry: app listen
    ├── app.ts                # Express app factory (for testing)
    ├── routes/
    │   ├── chat.ts           # POST /chat, proxies to Python :8000
    │   └── health.ts         # GET /health (checks Python health too)
    ├── middleware/
    │   ├── validate.ts       # Zod validation middleware factory
    │   └── error.ts          # Express 5 error handler
    └── lib/
        └── python-client.ts  # Typed HTTP client to FastAPI service
```

### package.json scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsdown src/index.ts --out-dir dist --format esm",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

### tsconfig.json baseline

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**`moduleResolution: "bundler"`** is the correct setting for 2026 when using tsdown/tsx — aligns with how esbuild/Rolldown resolve imports.

---

## Monorepo Structure (pnpm workspaces)

### pnpm Version

Use **pnpm 10.x** (latest stable: 10.33.0 as of March 2026). pnpm 11 is in beta — do not use.

### Root Files

**`pnpm-workspace.yaml`** (repo root):
```yaml
packages:
  - "packages/*"
```

Python is NOT a pnpm package. The `packages/` directory contains only Node packages. Python is managed via `pyproject.toml` at repo root (existing) or under a Python-specific directory.

**Root `package.json`** (repo root):
```json
{
  "name": "jarvis-monorepo",
  "private": true,
  "packageManager": "pnpm@10.33.0",
  "scripts": {
    "dev": "concurrently \"pnpm --filter gateway dev\" \"python -m jarvis.api.main\"",
    "build": "pnpm --filter gateway build",
    "test:node": "pnpm --filter gateway test",
    "test:python": "pytest"
  },
  "devDependencies": {
    "concurrently": "^9.1.0"
  }
}
```

**`.npmrc`** (repo root, prevents hoisting confusion):
```ini
shamefully-hoist=false
strict-peer-dependencies=false
```

### Directory Layout

```
jarvis/                              # repo root (existing git root)
├── package.json                     # NEW — pnpm workspace root
├── pnpm-workspace.yaml              # NEW — declares packages/*
├── .npmrc                           # NEW — pnpm config
├── pnpm-lock.yaml                   # NEW — generated by pnpm install
├── pyproject.toml                   # EXISTING — Python root (unchanged)
├── src/jarvis/                      # EXISTING — Python source (unchanged)
├── tests/                           # EXISTING — pytest tests (unchanged)
├── docker-compose.yml               # NEW — orchestrates all services
├── packages/
│   └── gateway/                     # NEW — Express TS API gateway
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
└── .planning/                       # EXISTING — unchanged
```

**Key decision: Python stays at repo root, not in `packages/`.** Moving `src/jarvis/` into `packages/ai-service/` would break all 234 existing tests and import paths. The monorepo "wraps" the existing Python project rather than restructuring it. Only new Node packages go under `packages/`.

**Confidence:** HIGH — pnpm workspace pattern verified. Python-stays-at-root decision is pragmatic, avoids breaking 234 tests.

---

## Docker Compose

### Service Topology

```yaml
# docker-compose.yml
services:
  python-service:       # FastAPI + LangChain core
    build:
      context: .
      dockerfile: Dockerfile.python
    ports: ["8000:8000"]
    env_file: .env
    volumes:
      - ./data:/app/data    # SQLite + ChromaDB persistence

  gateway:              # Express TS API gateway
    build:
      context: packages/gateway
      dockerfile: Dockerfile
    ports: ["3000:3000"]
    environment:
      PYTHON_SERVICE_URL: http://python-service:8000
    depends_on:
      python-service:
        condition: service_healthy
```

### Python Dockerfile (`Dockerfile.python`)

```dockerfile
# --- builder stage ---
FROM python:3.12-slim AS builder
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir ".[api]"   # install only api extras

# --- runtime stage ---
FROM python:3.12-slim AS runtime
WORKDIR /app
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY src/ ./src/
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1
CMD ["uvicorn", "jarvis.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Why `python:3.12-slim` not `python:3.12-alpine`:** Alpine uses musl libc. Several JARVIS dependencies (numpy, torch via sentence-transformers, onnxruntime) require glibc. Alpine would require patching or custom wheels. Use slim (Debian-based) for reliability.

**Why NOT `tiangolo/uvicorn-gunicorn-fastapi`:** FastAPI docs explicitly deprecated this image in 2025. Build from `python:3.12-slim` directly.

**Why multi-stage for Python:** Voice pipeline dependencies (faster-whisper, kokoro, openwakeword) are heavy (~2GB). The runtime stage only needs the installed site-packages, not the build toolchain. Reduces image size significantly.

### Node Gateway Dockerfile (`packages/gateway/Dockerfile`)

```dockerfile
# --- builder stage ---
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build    # tsdown compiles to dist/

# --- runtime stage ---
FROM node:22-slim AS runtime
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json .
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => r.statusCode === 200 ? process.exit(0) : process.exit(1))"
CMD ["node", "dist/index.js"]
```

**Why `node:22-slim` not `node:22-alpine`:** Alpine/musl issues with some native Node modules. `slim` is the safe production choice recommended by Docker documentation. Native Node.js Alpine builds are still experimental.

**Why not install pnpm globally in runtime:** Runtime stage has no `pnpm` — it runs compiled JS directly via `node`. pnpm is build-time-only.

**Confidence:** HIGH for multi-stage patterns and base image choices. MEDIUM for the exact Dockerfile — these are templates that will need tuning for the specific dependency tree.

### Docker Compose Health Checks

The `depends_on: condition: service_healthy` pattern requires a `HEALTHCHECK` in the Python Dockerfile. FastAPI should expose a `/health` endpoint that returns `{"status": "ok"}`. The gateway will not start until the Python service passes health checks.

**Confidence:** HIGH — this is standard Docker Compose orchestration.

---

## Service Communication Architecture

```
[CLI / any client]
        │
        ▼ HTTP :3000
  Express Gateway (Node)
  packages/gateway
        │
        ▼ HTTP :8000 (internal, service DNS via Docker Compose)
  FastAPI Service (Python)
  src/jarvis/api/
        │
        ▼ in-process
  LangGraph Agent
  (existing core — unchanged)
        │
  ┌─────┴──────┐
  ▼            ▼
SQLite      ChromaDB
(data/)     (data/)
```

**Python-to-Node HTTP client:** Use `httpx` (already in pyproject.toml) for any Python → Node calls. The primary flow is Node → Python, not the reverse.

**Node-to-Python HTTP client:** Use Node's built-in `fetch` (available since Node 18, stable in Node 22) or a thin wrapper. No need to add `axios` as a dependency — native fetch handles the use case. If typed responses are needed, wrap fetch with zod parsing.

**Why native fetch over axios:** Reduces dependency count. Node 22 `fetch` is stable, supports streaming (needed for SSE proxy), and has no extra bundle overhead.

**Streaming SSE proxy:** When the Express gateway proxies SSE from FastAPI, use Node's native `fetch` with `Response.body` as a `ReadableStream` and pipe it to the Express response. This avoids buffering the full LLM response.

---

## Alternatives Considered (v1.1 Scope)

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Gateway framework | Express 5 | Fastify | Fastify is faster but Express is project constraint (per PROJECT.md). Not reconsidering. |
| Gateway framework | Express 5 | Hono | Hono is excellent for edge/serverless; overkill for a local assistant gateway. |
| TS bundler | tsdown | tsup | tsup is no longer actively maintained; maintainer recommends tsdown. |
| TS bundler | tsdown | esbuild direct | More manual config required vs tsdown's zero-config experience. Use tsdown which wraps Rolldown. |
| TS runtime (dev) | tsx | ts-node + nodemon | tsx is 25x faster and requires zero config vs ts-node's complex setup. |
| TS runtime (dev) | tsx | native `--strip-types` | Node 22.18+ supports this natively, but it only strips types — no transformation. tsx handles both stripping AND JSX/decorators/paths. Use native for simple scripts, tsx for the gateway. |
| TS testing | vitest | jest | Vitest is faster, native ESM, no transform config. Jest requires `--experimental-vm-modules` for ESM in Node 22. |
| Node version | 22 LTS | 20 LTS | Node 20 LTS ended April 30, 2026. Cannot use for a new project. |
| Python base image | python:3.12-slim | python:3.12-alpine | Alpine musl breaks numpy, onnxruntime, torch. Slim is Debian-based, fully glibc-compatible. |
| HTTP client (Node→Python) | native fetch | axios | Reduces dependencies. Node 22 fetch is stable. Axios adds 30KB for no benefit. |
| Validation (Node) | zod v4 | zod v3 | v4 is current stable (April 2026). Smaller, faster. New project starts on v4. |

---

## Installation Commands

### Root (pnpm workspace)
```bash
pnpm init                                  # creates root package.json
# edit package.json: add "private": true, "packageManager": "pnpm@10.33.0"
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - "packages/*"
EOF
pnpm add -w -D concurrently
```

### Gateway package
```bash
mkdir -p packages/gateway && cd packages/gateway
pnpm init
pnpm add express zod
pnpm add -D typescript @types/node @types/express tsx tsdown vitest
```

### Python additions (to existing pyproject.toml)
```toml
# Add to [project.dependencies]:
"fastapi==0.135.3",
"uvicorn[standard]==0.43.0",
"python-multipart>=0.0.18",
```

---

## Version Compatibility Matrix

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| fastapi | 0.135.3 | Python >=3.10, pydantic >=2.7 | Verified PyPI 2026-04-05 |
| uvicorn | 0.43.0 | Python >=3.9 | `[standard]` extras add watchfiles, websockets |
| express | ^5.1.0 | Node >=18 | GA since Oct 2024. Works on Node 22. |
| zod | ^4.0.0 | Node >=18, TypeScript >=5.0 | Breaking change from v3 — new project, use v4 from start |
| tsx | ^4.19 | Node >=18, TypeScript >=5.x | esbuild-based, zero config |
| tsdown | ^0.12 | Node >=18 | Rolldown-based successor to tsup |
| pnpm | 10.x (10.33.0) | Node >=18 | pnpm 11 in beta — do not use |
| node:22-slim | base image | — | For Docker runtime. Not alpine. |
| python:3.12-slim | base image | — | For Docker runtime. Not alpine. |

---

## Sources

- FastAPI 0.135.3 — verified PyPI 2026-04-05: https://pypi.org/project/fastapi/
- uvicorn 0.43.0 — verified PyPI 2026-04-05: https://pypi.org/project/uvicorn/
- FastAPI Docker best practices (official docs, deprecated tiangolo image): https://fastapi.tiangolo.com/deployment/docker/
- FastAPI SSE native support (0.135.0+): https://fastapi.tiangolo.com/tutorial/server-sent-events/
- Express 5 GA (October 2024): https://www.trevorlasn.com/blog/whats-new-in-express-5
- @types/express 5.0.6, @types/node ^22 — current npm versions
- zod v4.x — verified npm April 2026: https://www.npmjs.com/package/zod
- tsdown (tsup successor): https://tsdown.dev/ and https://github.com/rolldown/tsdown
- tsup maintenance status: https://github.com/egoist/tsup — maintainer recommends tsdown
- tsx vs ts-node 2026: https://blog.logrocket.com/running-typescript-node-js-tsx-vs-ts-node-vs-native/
- pnpm 10.33.0 latest stable: https://github.com/pnpm/pnpm/releases
- Node 20 LTS end date: Node.js release schedule (April 30, 2026)
- Docker alpine vs slim (musl glibc issue): https://openillumi.com/en/en-docker-nodejs-image-alpine-slim-debian-choice/

**Overall confidence:** HIGH for architectural decisions (FastAPI, Express 5, pnpm workspaces, Docker multi-stage). HIGH for versions verified on PyPI/npm. MEDIUM for tsdown (newer, less battle-tested than tsup but officially recommended successor).
