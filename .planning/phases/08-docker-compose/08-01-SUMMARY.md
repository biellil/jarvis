---
phase: 08-docker-compose
plan: 01
subsystem: infra
tags: [docker, python, nodejs, multi-stage, dockerfile, dockerignore]

requires:
  - phase: 06-fastapi-core
    provides: FastAPI HTTP layer — uvicorn entrypoint, single-worker constraint
  - phase: 07-monorepo-express-gateway
    provides: Node Express gateway in apps/gateway/ with tsc build, dist/index.js entrypoint

provides:
  - Dockerfile.python — python:3.12-slim multi-stage build for JARVIS FastAPI service
  - Dockerfile.node — node:22-slim multi-stage build for Express gateway
  - .dockerignore — build context exclusions (secrets, artifacts, data, planning)
  - requirements-docker.txt — Python deps without openwakeword (tflite workaround)
  - .env.example — updated with GATEWAY_PORT, FASTAPI_URL, Docker host.docker.internal note

affects:
  - 08-02 (docker-compose.yml consumes both images + env vars from .env.example)

tech-stack:
  added: [docker, python:3.12-slim, node:22-slim, multi-stage builds]
  patterns:
    - Multi-stage Docker build — builder installs all deps, runtime copies site-packages + system libs
    - openwakeword tflite-runtime workaround — install with --no-deps to skip missing py3.12 wheel
    - requirements-docker.txt — separate dep file excluding problematic transitive deps for container builds
    - Production-only Docker — no dev containers (D-01 locked decision)

key-files:
  created:
    - Dockerfile.python
    - Dockerfile.node
    - .dockerignore
    - requirements-docker.txt
  modified:
    - .env.example

key-decisions:
  - "openwakeword --no-deps workaround: tflite-runtime has no Python 3.12 wheels on Linux; openwakeword uses onnxruntime at runtime so --no-deps install is safe"
  - "requirements-docker.txt tracks Python deps sans openwakeword for cache-friendly layer separation"
  - "Dockerfile.node uses npm (not pnpm) inside container for simplicity — gateway has no workspace deps"

patterns-established:
  - "python:3.12-slim always (never Alpine) — musl breaks onnxruntime/ctranslate2/numpy"
  - "node:22-slim always (Node 22 active LTS; Node 20 EOL April 2026)"
  - "uvicorn --workers 1 mandatory — in-memory session_store breaks with multiple workers"
  - "CMD node dist/index.js directly — never use --env-file flag in Docker (use env_file: in compose)"

requirements-completed: [DOCKER-01, DOCKER-02, DOCKER-05]

duration: ~40min
completed: 2026-04-06
---

# Phase 08 Plan 01: Docker Images Summary

**python:3.12-slim and node:22-slim multi-stage Dockerfiles with openwakeword tflite-runtime workaround and .dockerignore excluding secrets/data/artifacts**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-04-06T12:28:00Z
- **Completed:** 2026-04-06T13:08:36Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Python image builds from python:3.12-slim with all native deps (onnxruntime, ctranslate2, kokoro, sounddevice) working correctly
- Node image builds from node:22-slim with TypeScript compiled in builder stage, production-only deps in runtime
- .dockerignore ensures .env, .venv/, node_modules/, data/, .planning/, .claude/ never enter build context
- .env.example updated with GATEWAY_PORT, FASTAPI_URL, and Docker-specific host.docker.internal comments

## Task Commits

Each task was committed atomically:

1. **Task 1: Dockerfile.python multi-stage build and .dockerignore** - `f92f5e0` (feat)
2. **Task 2: Dockerfile.node multi-stage build and update .env.example** - `ff2ce88` (feat)

## Files Created/Modified
- `Dockerfile.python` — Python FastAPI multi-stage build with tflite workaround
- `Dockerfile.node` — Node Express gateway multi-stage build with tsc compilation
- `.dockerignore` — Build context exclusions for both Dockerfiles
- `requirements-docker.txt` — Python deps list excluding openwakeword (workaround file)
- `.env.example` — Added GATEWAY_PORT, FASTAPI_URL, host.docker.internal Docker notes

## Decisions Made
- `requirements-docker.txt` created as Docker-specific workaround: openwakeword 0.6.0 declares `tflite-runtime` as a hard dep but tflite-runtime has no Python 3.12 wheels on Linux. openwakeword uses onnxruntime at runtime (tflite is a vestigial dep). Solution: install openwakeword with `--no-deps` + install its actual runtime deps (onnxruntime, requests, scikit-learn, scipy, tqdm) via requirements-docker.txt
- Node image uses npm (not pnpm) inside container — gateway has no pnpm workspace dependencies, so npm install is simpler and avoids corepack complexity
- Dockerfile.node uses `node dist/index.js` directly in CMD, not `npm start` — npm start uses `--env-file ../../.env` which breaks inside container (path doesn't exist; env injection is via docker-compose env_file:)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] openwakeword tflite-runtime Python 3.12 incompatibility**
- **Found during:** Task 1 (Dockerfile.python build)
- **Issue:** `openwakeword==0.6.0` declares `tflite-runtime<3,>=2.8.0` as a hard dep in package metadata. No tflite-runtime wheels exist for Python 3.12 on Linux. `pip install .` fails during Docker build even though tflite-runtime is not used at runtime (openwakeword uses onnxruntime).
- **Fix:** Created `requirements-docker.txt` with all pyproject.toml deps except openwakeword. Dockerfile.python installs openwakeword with `--no-deps` first, then installs other deps from requirements-docker.txt, then installs jarvis package with `--no-deps`. This avoids pip ever trying to resolve tflite-runtime.
- **Files modified:** Dockerfile.python (build strategy), requirements-docker.txt (new file)
- **Verification:** `docker build -f Dockerfile.python -t jarvis-python .` exits 0
- **Committed in:** f92f5e0 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug in dependency resolution for Docker environment)
**Impact on plan:** Fix necessary for the image to build. No scope creep — workaround is contained to Docker build layer, no application code changes.

## Issues Encountered
- openwakeword tflite-runtime incompatibility blocked the Python image build (3 attempts to resolve). Final solution uses requirements-docker.txt to separate dep installation and install openwakeword with --no-deps. Documented in deviation above.

## User Setup Required
None - no external service configuration required. Docker images build locally from repo.

## Next Phase Readiness
- Both Dockerfiles exist and build successfully (verified: `docker build` exits 0 for both)
- .dockerignore in place — .env and data/ excluded from all builds
- .env.example has all vars needed by docker-compose.yml (GATEWAY_PORT, FASTAPI_URL, LM_STUDIO_URL with Docker note)
- Plan 02 can proceed: create docker-compose.yml wiring python-service + gateway with health checks, volume, and network

---
*Phase: 08-docker-compose*
*Completed: 2026-04-06*
