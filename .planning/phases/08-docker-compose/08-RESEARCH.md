# Phase 8: Docker Compose - Research

**Researched:** 2026-04-06
**Domain:** Docker multi-stage builds, Docker Compose orchestration, Python/Node.js containerization
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01: Somente produção** — Um único `docker-compose.yml` com imagens compiladas. Sem `docker-compose.dev.yml`. Desenvolvimento local continua sem Docker (`python -m jarvis.api` + `pnpm dev`). Mantém simplicidade — não há necessidade de hot-reload dentro de container para uso pessoal.

- **D-02: tsc + node (multi-stage)** — Stage 1: instala devDependencies + compila com `tsc`. Stage 2: copia `dist/` + instala somente `dependencies` (sem devDeps). Executa `node dist/index.js`. Imagem final menor, sem esbuild/tsx/vitest na produção.

- **D-03: `python:3.12-slim` base** — Nunca Alpine (musl quebra onnxruntime, ctranslate2, numpy). Multi-stage: stage builder instala deps Python, stage runtime recopia site-packages + instala system libs explicitamente (`libgomp1`, `libsndfile1`, `libportaudio2`, `espeak-ng`, `curl`).

- **D-04: Single worker uvicorn** — `CMD ["uvicorn", "jarvis.api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]`. Obrigatório per D-01 da Phase 6 (in-memory session_store quebra com múltiplos workers).

- **D-05: FastAPI exposto apenas internamente** — `expose: ["8000"]` no python-service (sem `ports:`). Somente o gateway tem `ports: ["3000:3000"]`. Comunicação interna via bridge network `jarvis-net` usando service name DNS (`http://python-service:8000`). O `.env` de produção deve ter `FASTAPI_URL=http://python-service:8000`.

- **D-06: LM Studio via `host.docker.internal`** — No Linux, `extra_hosts: ["host.docker.internal:host-gateway"]` no python-service para conectar ao LM Studio rodando no host. A var `LM_STUDIO_URL` no `.env` deve apontar para `http://host.docker.internal:1234/v1`.

- **D-07: Volume `./data:/app/data`** — Um único volume bind mount no python-service para SQLite (`jarvis.db`) e ChromaDB (`chroma/`). Dados persistem entre `docker compose down && up`. Gateway não precisa de volume — é stateless.

- **D-08: `env_file: .env`** — Ambos os serviços usam `env_file: .env` no `docker-compose.yml`. `.env` **nunca** entra na imagem Docker (`.dockerignore` obrigatório). Sem hardcode de secrets no Dockerfile ou docker-compose.yml.

- **D-09: Health check com start_period longo** — Python service: `healthcheck` via `curl -f http://localhost:8000/health/ready` com `start_period: 60s` (ChromaDB + sentence-transformers init pode levar 15-60s). Gateway: `depends_on: python-service: condition: service_healthy`.

### Claude's Discretion

- Intervalos e retries do healthcheck (interval, timeout, retries)
- Estrutura de multi-stage naming (builder/runtime ou stage names)
- `.dockerignore` paths completos para ambos os contextos
- Ordem das camadas Docker para cache eficiente (COPY pyproject.toml antes de COPY src/)
- Build args vs env vars para configuração de build

### Deferred Ideas (OUT OF SCOPE)

- `docker-compose.dev.yml` com hot-reload
- Makefile com atalhos
- CI/CD pipeline com Docker build
- Docker Hub / registry push
- Multi-arch builds (amd64/arm64)

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DOCKER-01 | Desenvolvedor pode construir imagem Python otimizada via Dockerfile multi-stage com `python:3.12-slim` (nunca Alpine) | Multi-stage pattern documented: builder stage installs deps, runtime stage copies site-packages + re-installs system libs |
| DOCKER-02 | Desenvolvedor pode construir imagem Node otimizada via Dockerfile multi-stage com `node:22-slim` | tsc-compile in builder + copy dist/ + npm ci --omit=dev in runtime stage; `pnpm deploy` alternative documented |
| DOCKER-03 | Desenvolvedor pode subir todos os serviços com `docker compose up` e o gateway só inicia após o Python estar saudável (`depends_on: service_healthy`) | `depends_on: condition: service_healthy` + HEALTHCHECK in Python Dockerfile with `start_period: 60s`; `--wait` flag verified |
| DOCKER-04 | Dados de SQLite e ChromaDB persistem entre restarts via volume `./data:/app/data` | Bind mount pattern; no code change needed — `settings.sqlite_path` and `settings.chroma_path` already use `data/` prefix |
| DOCKER-05 | Build de imagens não inclui `.env`, `.venv`, `node_modules`, `data/` ou `.planning/` via `.dockerignore` correto | `.dockerignore` separate from `.gitignore`; complete exclusion list documented; `env_file:` in Compose vs `COPY .env` |

</phase_requirements>

---

## Summary

Phase 8 is a pure packaging phase — no application code changes. Both services (Python FastAPI on port 8000, Node Express gateway on port 3000) are already running and tested locally. The task is to write three Dockerfiles and one `docker-compose.yml` that wrap them correctly.

The critical technical complexity is in the Python Dockerfile: the JARVIS Python service depends on native compiled libraries (`onnxruntime` via openwakeword, `ctranslate2` via faster-whisper, `sounddevice`, `kokoro`/soundfile) that require specific system `.so` libraries at runtime. A naive multi-stage build that copies only Python `site-packages` will produce a container that builds successfully but crashes on first import with cryptic `OSError: libgomp.so.1: cannot open shared object file`. The runtime stage must explicitly `apt-get install` these system libraries before the COPY from the builder stage.

The Node Dockerfile is straightforward: the gateway uses standard TypeScript (tsc), has no native addons, and the multi-stage pattern is well-established for Node/TypeScript. The key decision (already locked by D-02) is `tsc + node`, not tsx/esbuild — the `build` script in `package.json` is already `tsc`, and `start` is already `node dist/index.js`. The build context for the Node Dockerfile must be the monorepo root (not `apps/gateway/`) to access the pnpm lock file and workspace metadata, OR the Dockerfile must be placed in `apps/gateway/` with a build context scoped to that directory (simpler, since the gateway has no workspace dependencies to copy).

The `docker-compose.yml` wires the services together: python-service (internal only) and gateway (public port 3000) on a dedicated `jarvis-net` bridge network, with `depends_on: condition: service_healthy` ensuring correct startup order.

**Primary recommendation:** Write `Dockerfile.python` and `Dockerfile.node` at repo root, both `docker-compose.yml` and `.dockerignore` at repo root. The gateway build context is the repo root with `dockerfile: Dockerfile.node`. The Python build context is repo root with `dockerfile: Dockerfile.python`.

---

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| `python:3.12-slim` | 3.12 (Debian Bookworm) | Python Dockerfile base | Debian glibc — required by onnxruntime, ctranslate2, numpy. Never Alpine (musl incompatibility). Confirmed in PITFALLS.md C-1. |
| `node:22-slim` | 22 LTS (Debian) | Node Dockerfile base | Node 22 is current active LTS. Node 20 EOL April 30, 2026. Slim variant excludes dev tools but retains glibc. |
| Docker Compose v2 | v5.0.2 (installed) | Service orchestration | `docker compose` (v2 CLI plugin, no hyphen). `--wait` flag available — confirmed by `docker compose up --help`. |
| Docker BuildKit | built-in (>= Docker 23) | Build acceleration | `--mount=type=cache` for pip cache available. Not required for correctness but helps rebuild speed. Docker 29.2.1 installed. |

### Supporting

| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| `curl` (system) | latest apt | Python healthcheck command | Installed in Python runtime stage — required by `HEALTHCHECK CMD curl -f http://localhost:8000/health/ready`. Not in slim base by default. |
| `libgomp1` (system) | latest apt | OpenMP — required by ctranslate2/faster-whisper | Must be in Python **runtime** stage. Build stage gets it, but runtime starts fresh. |
| `libsndfile1` (system) | latest apt | Audio file I/O — required by soundfile/kokoro | Must be in Python runtime stage. |
| `libportaudio2` (system) | latest apt | Audio device I/O — required by sounddevice | Must be in Python runtime stage. |
| `espeak-ng` (system) | latest apt | Phonemizer — required by kokoro on Linux | Must be in Python runtime stage. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `python:3.12-slim` | `python:3.12-alpine` | Alpine musl breaks onnxruntime/ctranslate2/numpy — NOT viable. Locked by D-03. |
| Multi-stage COPY site-packages | venv-based multi-stage (`COPY --from=builder /app/.venv /app/.venv`) | Venv pattern is cleaner (system libs bundled in venv). More portable but more complex setup. site-packages COPY is simpler and well-documented. |
| `node:22-slim` | `node:22-alpine` | Alpine lacks glibc — risky for native addons. Gateway has no native addons currently, but slim is safer. |
| `tsc` build | `tsdown` / esbuild | tsdown produces smaller bundles. Decision locked to tsc by D-02. `dist/` from `tsc` is sufficient. |
| `pnpm deploy` for Node image | npm ci in runtime stage | `pnpm deploy` prunes workspace deps cleanly. Viable alternative. Gateway has no workspace deps, so npm ci `--omit=dev` in runtime is simpler. |

**Installation:** No new packages needed. All dependencies are already declared in `pyproject.toml` and `apps/gateway/package.json`.

---

## Architecture Patterns

### Recommended File Structure

```
jarvis/
  Dockerfile.python          # Python FastAPI multi-stage build (repo root context)
  Dockerfile.node            # Node Express multi-stage build (repo root context)
  docker-compose.yml         # Orchestrates both services
  .dockerignore              # Applies to BOTH build contexts (both Dockerfiles use repo root)
  .env                       # Runtime secrets — never in image; loaded via env_file:
  .env.example               # Updated to add FASTAPI_URL and LM_STUDIO_URL docker note
  apps/gateway/
    ...                      # No changes to gateway source code
  src/jarvis/
    ...                      # No changes to Python source code
  data/                      # Bind-mounted at runtime; excluded from images via .dockerignore
```

### Pattern 1: Python Multi-Stage Build (Dockerfile.python)

**What:** Two stages — `builder` installs Python deps, `runtime` installs system libs and copies site-packages.

**When to use:** Always for Python with native compiled deps (onnxruntime, ctranslate2, etc.)

**Layer cache order (critical for rebuild speed):**
1. COPY `pyproject.toml` only — triggers pip install layer
2. `pip install` deps (cached until pyproject.toml changes)
3. COPY `src/` — triggers only if code changes (not deps)

```dockerfile
# Source: Docker official docs + PITFALLS.md C-1, C-2
FROM python:3.12-slim AS builder

WORKDIR /app

# Layer 1: deps manifest (cached — only invalidated if pyproject.toml changes)
COPY pyproject.toml ./

# Layer 2: install deps (slow — but cached between code-only changes)
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir .

# Layer 3: application source
COPY src/ ./src/

# ---- Runtime stage ----
FROM python:3.12-slim AS runtime

WORKDIR /app

# CRITICAL (PITFALLS.md C-2): system libs that site-packages .so files need at runtime.
# These are NOT copied by COPY --from=builder site-packages; they live in the OS layer.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    libsndfile1 \
    libportaudio2 \
    espeak-ng \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /usr/local/lib/python3.12/site-packages \
                    /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application source
COPY --from=builder /app/src ./src

# Single worker — CRITICAL (PITFALLS.md C-4): in-memory session breaks with >1 worker
CMD ["uvicorn", "jarvis.api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
```

### Pattern 2: Node Multi-Stage Build (Dockerfile.node)

**What:** Two stages — `builder` installs all deps + compiles TypeScript, `runtime` installs production deps only.

**When to use:** Any Node.js/TypeScript service with devDependencies (tsc, tsx, vitest, types).

**Gateway-specific note:** `package.json` scripts already have `build: tsc` and `start: node dist/index.js`. The `--env-file ../../.env` flag in the dev `start` script must NOT be used in Docker — env vars are injected via `env_file:` in docker-compose.yml.

**Build context note:** Because the gateway is in `apps/gateway/` inside the pnpm workspace, the build context must be the **repo root** to access `pnpm-lock.yaml` and `pnpm-workspace.yaml`, OR the `apps/gateway/` directory is used as a self-contained build context (simpler — gateway `package.json` has no workspace dependencies on `packages/*`). The simpler approach (context = `apps/gateway/`) is recommended since the gateway does not depend on any other workspace package.

```dockerfile
# Source: Docker docs multi-stage + Node.js 22 patterns (2025-2026)
FROM node:22-slim AS builder

WORKDIR /app

# Layer 1: deps manifest
COPY apps/gateway/package.json apps/gateway/package-lock.json* ./

# If using npm (not pnpm) inside the container for simplicity:
RUN npm ci

# Layer 2: TypeScript source + compile
COPY apps/gateway/src ./src
COPY apps/gateway/tsconfig.json ./
RUN npm run build

# ---- Runtime stage ----
FROM node:22-slim AS runtime

WORKDIR /app

COPY --from=builder /app/package.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# node reads env vars from process.env — Docker Compose injects via env_file:
CMD ["node", "dist/index.js"]
```

**Alternative with repo root context and pnpm:**

If the build context is the repo root:

```dockerfile
FROM node:22-slim AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/gateway/package.json ./apps/gateway/

RUN pnpm install --frozen-lockfile

COPY apps/gateway/ ./apps/gateway/

RUN pnpm --filter @jarvis/gateway build

# Deploy stage — prune to production deps only
RUN pnpm deploy --filter @jarvis/gateway --prod /prod/gateway

FROM node:22-slim AS runtime
WORKDIR /app
COPY --from=builder /prod/gateway ./
CMD ["node", "dist/index.js"]
```

**Recommendation:** Use the **simpler npm-based approach** (context = `apps/gateway/` only). The gateway has no workspace package dependencies — only external npm packages. This avoids pnpm version management inside Docker and produces a cleaner build.

### Pattern 3: Docker Compose Orchestration (docker-compose.yml)

**What:** Two services on a dedicated bridge network with health checks, env injection, and volume.

```yaml
# Source: Docker Compose official docs + CONTEXT.md decisions
services:
  python-service:
    build:
      context: .
      dockerfile: Dockerfile.python
    expose:
      - "8000"          # Internal only — not published to host (D-05)
    networks:
      - jarvis-net
    volumes:
      - ./data:/app/data  # SQLite + ChromaDB persistence (D-07)
    env_file: .env        # Secrets injected at runtime, not baked in (D-08)
    extra_hosts:
      - "host.docker.internal:host-gateway"  # Linux LM Studio access (D-06)
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health/ready"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 60s    # ChromaDB + sentence-transformers init time (D-09)
    restart: unless-stopped

  gateway:
    build:
      context: apps/gateway
      dockerfile: ../../Dockerfile.node   # OR: Dockerfile placed in apps/gateway/
    ports:
      - "3000:3000"      # Public access (D-05)
    networks:
      - jarvis-net
    env_file: .env
    environment:
      - FASTAPI_URL=http://python-service:8000   # Service DNS (D-05)
    depends_on:
      python-service:
        condition: service_healthy  # Gateway waits for Python health check (D-09)
    restart: unless-stopped

networks:
  jarvis-net:
    driver: bridge
```

**Note on FASTAPI_URL override:** `environment:` in docker-compose.yml overrides the same key in `env_file: .env`. This means the production `.env` can keep `FASTAPI_URL=http://localhost:8000` for local dev, and docker-compose.yml overrides it to `http://python-service:8000` for containers. No need for a separate `.env.docker` file.

### Pattern 4: .dockerignore

**What:** Excludes paths from the build context sent to Docker daemon. Critical for security and build speed.

**Important:** `.dockerignore` is a separate file from `.gitignore`. Docker does NOT read `.gitignore`. Must be created explicitly.

For repo root build context (both services), a single `.dockerignore` applies:

```
# Python artifacts
.venv/
__pycache__/
*.py[cod]
*.pyo
.pytest_cache/
*.egg-info/
dist/
build/
.mypy_cache/
.ruff_cache/

# Node artifacts
node_modules/
apps/gateway/node_modules/

# Data (runtime — bind-mounted, not in image)
data/

# Secrets (NEVER in image)
.env
.env.*
!.env.example

# Planning and docs
.planning/
*.md
!README.md

# Git
.git/
.gitignore

# IDE
.vscode/
.idea/

# Test artifacts
tests/
.coverage
htmlcov/
```

### Anti-Patterns to Avoid

- **`FROM python:3.12-alpine`:** Breaks onnxruntime/ctranslate2 at runtime. Not discoverable until first import. Locked by D-03.
- **`COPY .env .` in Dockerfile:** Bakes secrets into image layers. Extractable with `docker history`. Use `env_file:` in Compose.
- **`--workers 4` in uvicorn CMD:** Splits in-memory session_store across processes. ChromaDB gets SQLite write conflicts. Locked to 1 worker by D-04.
- **`ports: ["8000:8000"]` on python-service:** Exposes FastAPI directly to host — no auth. Use `expose:` only. Locked by D-05.
- **`start_period: 0s` (default) on healthcheck:** ChromaDB + sentence-transformers load in 15-60s. Default causes Python service to be marked unhealthy before it's ready. Gateway never starts.
- **Missing system libs in runtime stage:** `COPY --from=builder site-packages` does NOT copy OS-level `.so` files. `libgomp1`, `libsndfile1`, `libportaudio2`, `espeak-ng` must be `apt-get install`ed in the runtime stage.
- **No curl in runtime stage:** The healthcheck `CMD curl -f ...` silently fails if curl is absent. Docker marks service unhealthy immediately.
- **`--env-file ../../.env` in CMD:** The gateway dev `start` script uses this flag. It must NOT be in the Dockerfile CMD — Docker Compose `env_file:` handles environment injection.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Service startup ordering | Custom wait-for-it.sh script | `depends_on: condition: service_healthy` + `HEALTHCHECK` | Native Docker Compose feature; `--wait` flag blocks until all services healthy |
| Environment injection | Hardcoding env vars in Dockerfile | `env_file: .env` in docker-compose.yml | Keys never baked into image layers; clean separation |
| Python dep layer caching | `COPY . . && pip install` | `COPY pyproject.toml && pip install && COPY src/` | Standard Docker layer cache optimization; only rebuilds deps when pyproject.toml changes |
| Cross-container networking | Hardcoded IPs or host networking | Docker Compose bridge network + service name DNS | `python-service` resolves automatically on `jarvis-net`; no IP management |
| Data persistence between restarts | Named Docker volumes | Bind mount `./data:/app/data` | User can inspect data directly; `docker compose down` doesn't destroy it |

**Key insight:** Docker Compose native features handle all orchestration needs. No auxiliary scripts (wait-for-it.sh, etc.) are needed when healthchecks are properly configured.

---

## Common Pitfalls

### Pitfall 1: Alpine Base — ML Packages Crash at Runtime (CRITICAL)

**What goes wrong:** `python:3.12-alpine` produces a container that builds and installs successfully but crashes immediately on first import of `faster_whisper`, `sounddevice`, or `openwakeword` with `OSError: libgomp.so.1: cannot open shared object file`.

**Why it happens:** PyPI binary wheels target glibc. Alpine uses musl libc. The `.so` files can't load glibc-linked symbols.

**How to avoid:** Always `FROM python:3.12-slim`. Already locked by D-03.

**Warning signs:** Any `FROM python:*-alpine` in Dockerfile. Build succeeds but container exits immediately on start.

---

### Pitfall 2: System Libraries Missing in Runtime Stage (CRITICAL)

**What goes wrong:** After a `COPY --from=builder /usr/local/lib/python3.12/site-packages ...` the runtime stage is missing `libgomp1`, `libsndfile1`, `libportaudio2`, `espeak-ng`. First import of faster-whisper, sounddevice, or kokoro raises `OSError`.

**Why it happens:** Multi-stage builds start each stage from a fresh base image. System packages installed in the builder stage don't carry over.

**How to avoid:** Explicit `apt-get install -y --no-install-recommends libgomp1 libsndfile1 libportaudio2 espeak-ng curl` in the runtime stage **before** the COPY from builder. The `curl` package is also required — it is the healthcheck command.

**Warning signs:** Runtime stage Dockerfile with no `apt-get install`. `docker compose exec python-service python -c "import faster_whisper"` exits non-zero.

---

### Pitfall 3: Health Check Fails Before Service Warms Up

**What goes wrong:** `HEALTHCHECK` fires immediately on start (default `start_period: 0s`). ChromaDB + sentence-transformers take 15-60s to initialize. Docker marks python-service unhealthy. Gateway's `depends_on: condition: service_healthy` condition is never satisfied. Gateway never starts.

**Why it happens:** Default Docker `start_period` is 0s — any failure counts immediately against retries.

**How to avoid:** `start_period: 60s` (already decided in D-09). Use `--interval=10s --retries=10` so there are 10 chances (100s total window) after the start period.

**Warning signs:** `docker compose ps` shows gateway in "waiting" state. `docker compose logs python-service` shows successful startup but gateway never starts.

---

### Pitfall 4: .env Baked Into Image

**What goes wrong:** `COPY .env .` in Dockerfile bakes API keys into a layer. `docker history <image>` reveals them.

**Why it happens:** pydantic-settings tries to load `.env` from working directory. Temptation to `COPY .env` so the container finds it.

**How to avoid:** `.env` in `.dockerignore`. Use `env_file: .env` in docker-compose.yml only. pydantic-settings reads env vars injected by Docker Compose at container start — no `.env` file needed inside the image.

**Warning signs:** `COPY .env` in any Dockerfile. No `.dockerignore` file. `docker history <image>` shows env layer.

---

### Pitfall 5: FASTAPI_URL Not Overridden for Docker Network

**What goes wrong:** `apps/gateway/src/config.ts` reads `FASTAPI_URL` with fallback `http://localhost:8000`. Inside a Docker container, `localhost` is the container itself — not the python-service container. Gateway cannot reach FastAPI.

**Why it happens:** `localhost` resolves differently inside containers vs. on the host.

**How to avoid:** Set `environment: FASTAPI_URL=http://python-service:8000` in the `gateway` service in `docker-compose.yml`. This overrides whatever is in `.env`. The `environment:` key takes precedence over `env_file:` for the same variable.

**Warning signs:** Gateway starts but all `/api/chat` requests return 502 or connection refused. `docker compose exec gateway wget -q -O- http://python-service:8000/health` succeeds; `wget -q -O- http://localhost:8000/health` fails.

---

### Pitfall 6: Voice Pipeline Audio Devices in Container

**What goes wrong:** `sounddevice` (via `libportaudio2`) needs `/dev/snd` or PipeWire socket. Container doesn't have them. On startup, when `sounddevice` is imported, it may attempt device enumeration.

**Why it happens:** Docker containers are isolated from host hardware. Audio device pass-through is Linux-only, version-specific.

**How to avoid:** The FastAPI server only imports `sounddevice` transitively — the voice pipeline is not active in the HTTP server path. The `lifespan.py` does not initialize voice pipeline components. If sounddevice import fails silently (driver not found), FastAPI still works. Verify: `docker compose exec python-service python -c "import sounddevice; print(sounddevice.query_devices())"` may show empty list or raise — acceptable as long as FastAPI endpoints work.

**Warning signs:** Container crashes on startup with `PortAudioError`. Check if `sounddevice` is imported at module level in any code that runs at startup.

---

### Pitfall 7: Dockerfile Build Context for Monorepo Gateway

**What goes wrong:** Setting `context: apps/gateway` in docker-compose.yml build section, but Dockerfile references `../../pnpm-lock.yaml` or `../../package.json`. Docker daemon can't access files outside the build context.

**Why it happens:** Docker build context is the root of what Docker can access. `..` traversal outside the context fails.

**How to avoid:** Two options:
1. **Simple (recommended):** `context: apps/gateway` — Dockerfile only uses files within `apps/gateway/`. Uses npm (not pnpm) inside Docker. Gateway has no workspace dependencies.
2. **Complex:** `context: .` (repo root) with `dockerfile: Dockerfile.node` — Dockerfile copies from `apps/gateway/` with full monorepo context. Required only if gateway depends on `packages/*` workspace packages.

The gateway (`@jarvis/gateway`) has no workspace-internal dependencies in `package.json`. Option 1 is correct.

---

## Code Examples

Verified patterns from official sources:

### Docker Compose depends_on with service_healthy

```yaml
# Source: https://docs.docker.com/compose/how-tos/startup-order/
services:
  gateway:
    depends_on:
      python-service:
        condition: service_healthy
    restart: true  # Restart gateway if python-service restarts
```

### HEALTHCHECK with start_period (Dockerfile)

```dockerfile
# Source: Docker Dockerfile reference — HEALTHCHECK instruction
# PITFALLS.md H-2: start_period must accommodate ML model loading time
HEALTHCHECK --interval=10s --timeout=5s --retries=10 --start-period=60s \
  CMD curl -f http://localhost:8000/health/ready || exit 1
```

### host.docker.internal on Linux

```yaml
# Source: https://docs.docker.com/reference/compose-file/services/#extra_hosts
# Required on Linux — Docker Desktop handles this automatically on macOS/Windows
services:
  python-service:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

`host-gateway` is a special value Docker resolves to the host's gateway IP (typically `172.17.0.1` on Linux bridge networks). Requires Docker >= 20.10. Installed version: 29.2.1 — supported.

### environment: overrides env_file:

```yaml
# Source: Docker Compose official docs — environment key precedence
services:
  gateway:
    env_file: .env          # FASTAPI_URL=http://localhost:8000 (dev default)
    environment:
      - FASTAPI_URL=http://python-service:8000  # Override for container DNS
```

`environment:` values take precedence over `env_file:` values for the same key. No code change needed in `config.ts`.

### Smoke test for Python imports

```bash
# Validate all ML libraries load correctly inside the container
docker compose exec python-service python -c "
import faster_whisper
import sounddevice
import kokoro
import chromadb
import sentence_transformers
print('All ML imports OK')
"
```

### docker compose up --wait

```bash
# Source: confirmed via `docker compose up --help` (Docker Compose v5.0.2)
# Blocks until all services with healthchecks report healthy
docker compose up --wait

# Equivalent with timeout:
docker compose up --wait --wait-timeout 120
```

---

## Runtime State Inventory

> No rename/refactor in this phase — data paths are unchanged.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `data/jarvis.db` (SQLite) and `data/chroma/` (ChromaDB) on host filesystem | Bind-mounted via `./data:/app/data` — no migration |
| Live service config | None — no running Docker services yet | Phase 8 creates them |
| OS-registered state | None | None |
| Secrets/env vars | `.env` at repo root — already excluded from git | Add to `.dockerignore` |
| Build artifacts | `apps/gateway/dist/` (if tsc was run locally) | Add to `.dockerignore` via `apps/gateway/dist/` |

**Critical data path check:** `settings.sqlite_path = "data/jarvis.db"` (relative path). Inside the container, WORKDIR is `/app`, so the resolved path is `/app/data/jarvis.db`. The volume mount `./data:/app/data` maps host `./data/` to `/app/data/`. Path alignment is correct — no code change needed.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | Container builds | ✓ | 29.2.1 | — |
| Docker Compose v2 | Service orchestration | ✓ | v5.0.2 | — |
| `--wait` flag | `docker compose up --wait` | ✓ | Confirmed in v5.0.2 | `docker compose up -d && docker compose wait` |
| `host-gateway` special value | `extra_hosts: host.docker.internal:host-gateway` | ✓ | Docker >= 20.10; installed 29.2.1 | Hardcode `172.17.0.1` |
| Python 3.12 | Local dev (not Docker) | ✓ | 3.12.3 | — |
| Node.js 22 | Local dev (not Docker) | ✓ | v24.12.0 (24 > 22, compatible) | — |
| pnpm 10 | Local dev (not Docker) | ✓ | 10.27.0 | — |

**Missing dependencies with no fallback:** None — Docker and Docker Compose are both available and at sufficient versions.

**Note:** Node 24 is installed locally (not 22). The Dockerfile uses `node:22-slim` base image — this is for the container, not the local build. No impact.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 (Python) + vitest 4.1.2 (Node) |
| Config file | `pyproject.toml` [tool.pytest.ini_options] / `apps/gateway/vitest.config.ts` |
| Quick run command | `pytest tests/ -x -q` (Python) / `pnpm --filter @jarvis/gateway test` (Node) |
| Full suite command | `pytest tests/ && pnpm --filter @jarvis/gateway test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOCKER-01 | Python image builds without error | smoke/manual | `docker build -f Dockerfile.python -t jarvis-python .` | ❌ Wave 0 |
| DOCKER-01 | ML imports succeed inside container | smoke | `docker compose exec python-service python -c "import faster_whisper"` | ❌ Wave 0 |
| DOCKER-02 | Node image builds without error | smoke/manual | `docker build -f Dockerfile.node apps/gateway/ -t jarvis-gateway` | ❌ Wave 0 |
| DOCKER-03 | `docker compose up --wait` succeeds | smoke/manual | `docker compose up --wait && docker compose ps` | ❌ Wave 0 |
| DOCKER-03 | Gateway waits for Python health | behavioral | `docker compose up --wait` — gateway starts only after python healthy | ❌ Wave 0 (manual) |
| DOCKER-04 | Data persists after restart | behavioral/manual | `docker compose down && docker compose up --wait && curl localhost:3000/api/health` | ❌ Wave 0 (manual) |
| DOCKER-05 | `.env` not in image layers | security/manual | `docker history jarvis-python \| grep -i api_key` — must be empty | ❌ Wave 0 (manual) |
| DOCKER-05 | `.venv` / `node_modules` excluded | build | Image size check; `docker run jarvis-python ls /app/.venv` must fail | ❌ Wave 0 (manual) |

**Note:** All DOCKER requirements are operational/infrastructure — no unit tests apply. All validation is smoke/manual tests against running containers.

### Sampling Rate

- **Per task commit:** `docker build` succeeds (no test runner)
- **Per wave merge:** Full smoke test suite: build → up → exec imports → curl endpoints → down/up data persistence
- **Phase gate:** `docker compose up --wait` succeeds + all smoke tests green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/docker/smoke_test.sh` — shell script running all Docker smoke tests for DOCKER-01 through DOCKER-05
- [ ] `Dockerfile.python` — must exist before any Docker test
- [ ] `Dockerfile.node` — must exist before any Docker test
- [ ] `docker-compose.yml` — must exist before orchestration tests
- [ ] `.dockerignore` — must exist before any `docker build`

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 8 |
|-----------|-------------------|
| Stack: Python 3.10+ | Base image `python:3.12-slim` satisfies this |
| Multi-LLM: never hardcode provider | Docker CMD uses `uvicorn jarvis.api:app` — LLM config via env vars; correct |
| Multiplataforma | Dockerfiles are Linux-only (container context). Local dev retains cross-platform support. |
| Privacidade: local por padrão | `env_file: .env` keeps secrets on host; not in image |
| Sem UI obrigatória | Docker exposes HTTP only; no UI dependency |
| `python:3.12-slim` never Alpine | Locked in D-03; PITFALLS.md C-1 |
| `host.docker.internal` + extra_hosts | Locked in D-06 |
| Single uvicorn worker | Locked in D-04; enforced in CMD |
| `expose:` not `ports:` for python-service | Locked in D-05 |
| Config via `from jarvis.config import settings` | Docker injects env vars; pydantic-settings reads them — no code change needed |
| Git commits: Conventional Commits with emojis | Applies to all commits in this phase |
| GSD workflow enforcement | All work through `/gsd:execute-phase` |

---

## Open Questions

1. **Dockerfile placement: repo root vs apps/gateway/**
   - What we know: Build context for Node can be `apps/gateway/` (simpler). Gateway has no workspace deps.
   - What's unclear: Whether planner prefers both Dockerfiles at repo root (consistent) or Node Dockerfile in `apps/gateway/` (conventional).
   - Recommendation: Both Dockerfiles at repo root (`Dockerfile.python`, `Dockerfile.node`) with respective build contexts in docker-compose.yml. Consistent location, single `.dockerignore` at root covers both.

2. **pnpm vs npm inside Node Docker build**
   - What we know: Gateway uses pnpm workspace locally but has no internal workspace dependencies. npm is available in `node:22-slim` base; pnpm requires explicit corepack setup.
   - What's unclear: Whether pnpm is needed at all inside the Docker build.
   - Recommendation: Use npm inside Docker (`npm ci`, `npm ci --omit=dev`). Gateway `package-lock.json` must be committed or `package.json` used with `npm install`. Simpler than adding pnpm corepack setup to Dockerfile.

3. **sounddevice at container startup**
   - What we know: `pyproject.toml` lists sounddevice. The lifespan only initializes ChatSession and memory stores — no voice pipeline init. However, `from jarvis.tools import ALL_TOOLS` imports all tools; if any tool imports sounddevice at module level, it may fail.
   - What's unclear: Whether any module in `src/jarvis/` imports sounddevice at the top level (vs. inside a function).
   - Recommendation: Add a pre-implementation check: `grep -r "import sounddevice" src/jarvis/` to confirm sounddevice is only imported inside voice tool functions, not at module level. If it fails at startup: add a try/except around sounddevice import with graceful degradation.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tiangolo/uvicorn-gunicorn-fastapi` Docker image | `FROM python:3.12-slim` + manual uvicorn CMD | Deprecated in FastAPI docs 2024-2025 | Don't use the prebuilt image — build from slim base directly |
| `wait-for-it.sh` scripts | `depends_on: condition: service_healthy` + `HEALTHCHECK` | Docker Compose v3+ (standard now) | No auxiliary scripts needed |
| `--add-host host.docker.internal:host-gateway` in `docker run` | `extra_hosts: - "host.docker.internal:host-gateway"` in docker-compose.yml | Docker Compose v3.x | Compose syntax is the canonical form |
| `docker-compose` (v1 Python CLI) | `docker compose` (v2 CLI plugin, no hyphen) | Docker Desktop 3.x+ / Docker Engine 20.x | Use v2 syntax in all commands |
| `@app.on_event("startup")` | `lifespan` context manager | FastAPI 0.93+ | Already using lifespan in lifespan.py — no change needed |

**Deprecated/outdated:**
- `tiangolo/uvicorn-gunicorn-fastapi` Docker Hub image: deprecated per FastAPI docs; replaced by `FROM python:3.12-slim` + direct uvicorn CMD.
- `docker-compose` (hyphen, v1): The installed version is `docker compose` v5.0.2 (v2 CLI plugin).

---

## Sources

### Primary (HIGH confidence)

- [Docker Compose startup order docs](https://docs.docker.com/compose/how-tos/startup-order/) — `depends_on: condition: service_healthy` syntax
- [Docker Compose service reference](https://docs.docker.com/reference/compose-file/services/) — `extra_hosts`, `expose`, `env_file`, `environment`, `healthcheck` fields
- [pnpm Docker docs](https://pnpm.io/docker) — pnpm multi-stage build patterns, `pnpm deploy` command
- Docker CLI `docker compose up --help` — `--wait` flag confirmed in installed Docker Compose v5.0.2
- `.planning/research/PITFALLS.md` — C-1 (Alpine), C-2 (system libs), H-2 (healthcheck start_period), H-6 (.env leakage) — HIGH confidence, project-specific
- `.planning/research/SUMMARY.md` — Phase 3 Docker section with complete pitfall list and gate criteria

### Secondary (MEDIUM confidence)

- [oneuptime.com — Docker Compose depends_on healthcheck (2026-01-16)](https://oneuptime.com/blog/post/2026-01-16-docker-compose-depends-on-healthcheck/view) — `service_healthy` pattern confirmed with examples
- [Baeldung — host.docker.internal:host-gateway in Docker Compose](https://www.baeldung.com/ops/docker-compose-add-host) — Linux extra_hosts pattern
- [andreadiotallevi.com — Node TypeScript multi-stage Docker](https://www.andreadiotallevi.com/blog/how-to-create-a-production-image-for-a-node-typescript-app-using-docker-multi-stage-builds/) — tsc build + dist copy pattern
- [Docker multi-stage builds guide (devtoolbox, 2026)](https://devtoolbox.dedyn.io/blog/docker-multi-stage-builds-guide) — contemporary multi-stage patterns

### Tertiary (LOW confidence — needs validation during execution)

- Exact list of system libraries needed in Python runtime stage: documented in PITFALLS.md C-2 as `libgomp1 libsndfile1 libportaudio2 espeak-ng curl`. May be incomplete for transitive `.so` deps — the smoke test import check will catch gaps.
- sounddevice behavior at FastAPI startup inside container without audio hardware: likely harmless (import succeeds, device query may return empty) but unverified without container execution.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — Docker 29.2.1 and Compose v5.0.2 installed and verified; base image choices locked by decisions; all flags confirmed
- Architecture: HIGH — Patterns verified via official Docker docs and PITFALLS.md cross-reference; docker-compose.yml structure is standard
- Pitfalls: HIGH — C-1 through H-6 from PITFALLS.md are well-documented; project-specific risk (system libs, sounddevice) flagged
- Code examples: MEDIUM-HIGH — Examples follow official patterns; exact system library list may need adjustment during smoke testing

**Research date:** 2026-04-06
**Valid until:** 2026-05-06 (Docker Compose v2 syntax is stable; base image versions are pinned in decisions)
