---
phase: 08-docker-compose
verified: 2026-04-06T14:30:00Z
status: human_needed
score: 3/5 must-haves verified (DOCKER-01, DOCKER-02, DOCKER-05 confirmed; DOCKER-03, DOCKER-04 need runtime confirmation)
human_verification:
  - test: "docker compose up --wait completes with both services healthy"
    expected: "Both python-service and gateway report healthy. No errors in logs. Gateway starts only after python-service passes healthcheck."
    why_human: "Requires running containers and observing actual startup sequence. Cannot verify service_healthy condition fires correctly without running Docker."
  - test: "curl -X POST http://localhost:3000/api/chat -d '{\"message\":\"oi\"}' -H 'Content-Type: application/json' returns JARVIS response"
    expected: "JSON response with assistant message text. Confirms gateway routes through to Python service over jarvis-net Docker network."
    why_human: "End-to-end network flow between containers requires running stack to verify."
  - test: "docker compose down && docker compose up --wait, then check conversation history is preserved"
    expected: "SQLite and ChromaDB files persist in ./data/. Subsequent chat response references previous messages."
    why_human: "Data persistence across down/up cycle requires actually running containers and verifying ./data/ is populated and survives restart."
  - test: "curl http://localhost:8000/health fails with connection refused"
    expected: "Port 8000 is NOT accessible from host — python-service uses expose: not ports:."
    why_human: "Requires running stack to confirm host-level port is not bound."
  - test: "ML imports work inside python-service container"
    expected: "docker compose exec python-service python -c 'import faster_whisper; import sounddevice; import kokoro; print(OK)' exits 0"
    why_human: "Requires running container to verify native libs (libgomp1, libsndfile1, libportaudio2, espeak-ng) are functional at runtime."
---

# Phase 8: Docker Compose Verification Report

**Phase Goal:** Ambos os serviços (Python FastAPI e Node gateway) rodam em containers orquestrados por Docker Compose, com persistência de dados entre restarts e o gateway só iniciando após o Python estar saudável
**Verified:** 2026-04-06T14:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | `docker compose up --wait` sobe ambos os serviços e reporta ambos como healthy | ? UNCERTAIN | docker-compose.yml exists and is valid (`docker compose config` exits 0); healthcheck and depends_on configured correctly. Runtime confirmation needed. |
| 2 | Chat via `POST http://localhost:3000/api/chat` funciona com ambos em containers | ? UNCERTAIN | All wiring present (gateway has FASTAPI_URL=http://python-service:8000, jarvis-net bridge). Requires running stack to confirm. |
| 3 | Dados persistem após `docker compose down && docker compose up --wait` | ? UNCERTAIN | `./data:/app/data` volume mount present in docker-compose.yml. Requires actual run/restart cycle to confirm. |
| 4 | Gateway nunca inicia se Python service não passar no health check | ? UNCERTAIN | `depends_on: condition: service_healthy` configured. Behavioral verification requires observing actual startup logs. |
| 5 | `docker build` não inclui `.env`, `.venv/`, `node_modules/`, `data/`, `.planning/` | ✓ VERIFIED | .dockerignore confirmed to contain all five exclusions; `docker compose config` valid; no hardcoded secrets found in any Dockerfile. |

**Score:** 1/5 truths fully verified; 4/5 require human runtime confirmation

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `Dockerfile.python` | Multi-stage python:3.12-slim build | ✓ VERIFIED | Two stages (builder/runtime), all system libs installed (libgomp1, libsndfile1, libportaudio2, espeak-ng, curl), `--workers 1`, WORKDIR /app, mkdir /app/data |
| `Dockerfile.node` | Multi-stage node:22-slim build | ✓ VERIFIED | Two stages (builder/runtime), npm install --omit=dev in runtime, CMD ["node", "dist/index.js"], no --env-file in CMD (only in comment line 29), no pnpm |
| `.dockerignore` | Build context exclusions | ✓ VERIFIED | Contains .env (line 22), .venv/ (line 2), node_modules/ (line 14), data/ (line 19), .planning/ (line 27) |
| `docker-compose.yml` | Two-service orchestration with health checks, volumes, networking | ✓ VERIFIED (static) | All structural requirements present — see Key Link Verification below. Runtime behavior unconfirmed. |
| `requirements-docker.txt` | Python dep list for Docker build (openwakeword workaround) | ✓ VERIFIED | Exists at repo root; contains 20+ packages; openwakeword installed via --no-deps in Dockerfile.python |
| `.env.example` | Updated with FASTAPI_URL, GATEWAY_PORT, Docker notes | ✓ VERIFIED | Contains GATEWAY_PORT=3000 (line 17), FASTAPI_URL=http://localhost:8000 (line 21), host.docker.internal comment (line 6) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `docker-compose.yml gateway` | `docker-compose.yml python-service` | `depends_on: condition: service_healthy` | ✓ WIRED | Lines 34-36: `depends_on: python-service: condition: service_healthy` present |
| `docker-compose.yml python-service` | `./data:/app/data` | bind mount volume | ✓ WIRED | Line 11: `- ./data:/app/data` present under python-service volumes |
| `docker-compose.yml gateway environment` | `python-service DNS` | `FASTAPI_URL=http://python-service:8000` | ✓ WIRED | Line 33: `- FASTAPI_URL=http://python-service:8000` in gateway environment block |
| `Dockerfile.python` | `pyproject.toml` | COPY + pip install | ✓ WIRED | Line 7: `COPY pyproject.toml requirements-docker.txt ./` |
| `Dockerfile.node` | `apps/gateway/package.json` | COPY + npm install | ✓ WIRED | Line 7: `COPY apps/gateway/package.json ./` |
| `python-service healthcheck` | `/health/ready` endpoint | curl CMD | ✓ WIRED | Healthcheck test: `curl -f http://localhost:8000/health/ready`; endpoint verified at `src/jarvis/api/routes/health.py` line 25 |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces infrastructure artifacts (Dockerfiles, compose config), not UI components or data-rendering code. No state/prop data flow to trace.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| docker-compose.yml is syntactically valid | `docker compose config --quiet` | exits 0 | ✓ PASS |
| docker-compose.yml has correct service count | `grep -c "^\s\{2\}[a-z]" docker-compose.yml` | 2 services | ✓ PASS |
| python-service does not expose port 8000 to host | grep "ports:" under python-service block | no ports: key found | ✓ PASS |
| No hardcoded secrets in docker-compose.yml | grep -iE "api_key\|secret\|password\|token" | empty | ✓ PASS |
| `docker compose up --wait` starts stack | requires running Docker | N/A | ? SKIP — requires containers |
| Gateway starts only after Python healthy | requires observing logs | N/A | ? SKIP — requires containers |
| Data persists after down/up cycle | requires running containers | N/A | ? SKIP — requires containers |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| DOCKER-01 | 08-01 | Desenvolvedor pode construir imagem Python otimizada via Dockerfile multi-stage com `python:3.12-slim` | ✓ SATISFIED | Dockerfile.python: `FROM python:3.12-slim AS builder` (line 2), `FROM python:3.12-slim AS runtime` (line 23). REQUIREMENTS.md marks [x]. |
| DOCKER-02 | 08-01 | Desenvolvedor pode construir imagem Node otimizada via Dockerfile multi-stage com `node:22-slim` | ✓ SATISFIED | Dockerfile.node: `FROM node:22-slim AS builder` (line 2), `FROM node:22-slim AS runtime` (line 18). REQUIREMENTS.md marks [x]. |
| DOCKER-03 | 08-02 | Desenvolvedor pode subir todos os serviços com `docker compose up` e o gateway só inicia após o Python estar saudável | ? NEEDS HUMAN | docker-compose.yml has `condition: service_healthy` wired correctly. Runtime behavior unconfirmed. REQUIREMENTS.md still marks [ ]. ROADMAP.md shows 08-02-PLAN as unchecked. No 08-02-SUMMARY.md exists. |
| DOCKER-04 | 08-02 | Dados de SQLite e ChromaDB persistem entre restarts via volume `./data:/app/data` | ? NEEDS HUMAN | docker-compose.yml has `./data:/app/data` on python-service. Persistence unconfirmed — no actual run/restart cycle performed. REQUIREMENTS.md still marks [ ]. |
| DOCKER-05 | 08-01 | Build de imagens não inclui `.env`, `.venv`, `node_modules`, `data/` ou `.planning/` via `.dockerignore` correto | ✓ SATISFIED | .dockerignore contains all five entries. REQUIREMENTS.md marks [x]. |

**Orphaned requirements check:** No additional DOCKER-* requirements appear in REQUIREMENTS.md beyond DOCKER-01 through DOCKER-05.

**Note:** REQUIREMENTS.md and ROADMAP.md still mark DOCKER-03 and DOCKER-04 as `[ ]` (pending). The docker-compose.yml artifact implementing them was created (all structural patterns verified), but Plan 02 has no 08-02-SUMMARY.md and ROADMAP.md shows `- [ ] 08-02-PLAN.md`. These tracking files need updating after human verification confirms runtime behavior.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| Dockerfile.node | 29 | Contains `--env-file` string | ℹ️ Info | Only appears in a comment (`# env vars injected by docker-compose env_file — NOT --env-file flag`). NOT in CMD or RUN. Not a stub — comment is correct documentation. |

No TODOs, FIXMEs, placeholders, empty implementations, or hardcoded secrets found in any of the four Docker artifacts.

### Human Verification Required

#### 1. Full Stack Startup

**Test:** Run `docker compose up --wait` from repo root (ensure `.env` exists with `LLM_PROVIDER` and valid model config)
**Expected:** Both python-service and gateway containers report healthy. No startup errors. Command completes without timeout.
**Why human:** Requires actually building and running Docker containers — healthcheck must pass and depends_on must fire correctly.

#### 2. Gateway-to-Python Communication

**Test:** With stack running, run `curl -X POST http://localhost:3000/api/chat -d '{"message":"oi"}' -H 'Content-Type: application/json'`
**Expected:** JSON response with JARVIS assistant text. Confirms Docker bridge network (jarvis-net) resolves `python-service` hostname from gateway container.
**Why human:** Network DNS resolution between containers requires running stack.

#### 3. Data Persistence Across Restart

**Test:** Send a message, run `docker compose down`, run `docker compose up --wait`, send message asking about conversation history
**Expected:** `./data/jarvis.db` and `./data/chroma/` survive the down/up cycle. JARVIS remembers previous messages.
**Why human:** Bind mount persistence requires observing actual file system state before and after restart.

#### 4. Python Service Not Exposed on Host Port 8000

**Test:** With stack running, run `curl http://localhost:8000/health`
**Expected:** Connection refused — port 8000 is NOT bound on the host (python-service uses `expose:` not `ports:`).
**Why human:** Confirming host-level port binding requires running containers.

#### 5. ML Imports Work in Container

**Test:** With stack running, run `docker compose exec python-service python -c "import faster_whisper; import sounddevice; import kokoro; print('OK')"`
**Expected:** Prints "OK". Confirms all native system libs (libgomp1, libsndfile1, libportaudio2, espeak-ng) are correctly installed in the runtime image.
**Why human:** Runtime import validation requires an executing container.

### Gaps Summary

No hard gaps blocking goal achievement from a static code analysis perspective. All Docker artifacts exist, are substantive, and are correctly wired:

- Dockerfile.python: multi-stage python:3.12-slim with all required system libs, workers=1, correct entrypoint
- Dockerfile.node: multi-stage node:22-slim with production-only runtime deps, correct CMD
- .dockerignore: all five required exclusions present
- docker-compose.yml: valid YAML, all structural requirements met (depends_on service_healthy, volume mount, FASTAPI_URL override, expose-not-ports, jarvis-net bridge, env_file on both services)

The phase is blocked at `human_needed` status because:
1. DOCKER-03 and DOCKER-04 have behavioral requirements that cannot be verified without running containers
2. Plan 02 has no 08-02-SUMMARY.md (execution summary was not written after docker-compose.yml was created)
3. REQUIREMENTS.md and ROADMAP.md still show DOCKER-03 and DOCKER-04 as pending

After human verification confirms runtime behavior, these tracking files should be updated and Phase 8 can be marked complete.

---

_Verified: 2026-04-06T14:30:00Z_
_Verifier: Claude (gsd-verifier)_
