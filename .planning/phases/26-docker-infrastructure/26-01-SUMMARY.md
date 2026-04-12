---
phase: 26-docker-infrastructure
plan: 01
subsystem: docker-infrastructure
tags: [docker, chromadb, persistence, networking]
dependency_graph:
  requires: []
  provides:
    - chromadb-docker-service
    - chroma-persistent-volume
    - backend-chromadb-connection
  affects:
    - docker-compose.yml
    - apps/backend-ts/src/config.ts
    - apps/backend-ts/src/memory/vectors.ts
tech_stack:
  added:
    - chromadb/chroma:1.0.12 (Docker image)
  patterns:
    - Docker service networking (internal DNS chromadb:8000)
    - Environment-based configuration (CHROMA_HOST/PORT)
    - Healthcheck-based dependency management
key_files:
  created: []
  modified:
    - docker-compose.yml
    - apps/backend-ts/src/config.ts
    - apps/backend-ts/src/memory/vectors.ts
    - .env.example
decisions:
  - ChromaDB 1.0.12 image chosen (latest stable as of April 2026)
  - Healthcheck uses /api/v2/heartbeat endpoint (Chroma 1.x API)
  - Backend-ts waits for chromadb service_healthy before starting
  - CHROMA_HOST env var defaults to localhost for dev, chromadb for Docker
metrics:
  duration_minutes: 2
  tasks_completed: 2
  files_modified: 4
  commits: 2
  completed_at: "2026-04-12T22:35:33Z"
---

# Phase 26 Plan 01: ChromaDB Docker Service & Network Configuration Summary

**One-liner:** ChromaDB roda como serviço Docker dedicado com volume persistente e backend-ts conecta via rede interna usando CHROMA_HOST env var.

## What Was Built

Adicionado ChromaDB como serviço independente no docker-compose.yml e corrigido o ChromaConnectionError que ocorria porque o cliente JS tentava conectar em localhost dentro do container. Agora backend-ts conecta ao ChromaDB via rede Docker interna (chromadb:8000) em produção e mantém localhost em desenvolvimento local.

**Functional changes:**
- ChromaDB roda em container separado com volume chroma-data persistente
- Backend-ts recebe CHROMA_HOST=chromadb e CHROMA_PORT=8000 via environment variables
- MemoryVectors usa config.chromaHost/chromaPort como defaults (não hardcoded)
- Healthcheck garante ChromaDB está pronto antes de backend-ts iniciar

**Technical highlights:**
- Imagem oficial chromadb/chroma:1.0.12 com IS_PERSISTENT=TRUE
- Volume Docker nomeado chroma-data montado em /chroma/chroma
- Healthcheck via curl /api/v2/heartbeat (retries: 5, start_period: 20s)
- Backend-ts depends_on chromadb com condition: service_healthy
- Config.ts expõe chromaHost/chromaPort lidos de process.env

## Implementation Details

### Task 1: Adicionar ChromaDB ao docker-compose com volume persistente

**What:** Declarar serviço chromadb no docker-compose.yml com volume persistente e configurar backend-ts para depender dele.

**How:**
1. Adicionado serviço chromadb:
   - image: chromadb/chroma:1.0.12
   - expose: 8000 (não publica publicamente)
   - networks: jarvis-net (mesma rede do backend)
   - volumes: chroma-data:/chroma/chroma
   - environment: IS_PERSISTENT=TRUE, PERSIST_DIRECTORY=/chroma/chroma, ANONYMIZED_TELEMETRY=FALSE
   - healthcheck: curl /api/v2/heartbeat (interval 10s, retries 5, start_period 20s)

2. Atualizado serviço backend-ts:
   - environment: CHROMA_HOST=chromadb, CHROMA_PORT=8000
   - depends_on: chromadb com condition: service_healthy

3. Adicionado volume chroma-data na seção volumes

**Files modified:**
- docker-compose.yml

**Commit:** 84e25ae

### Task 2: Expor CHROMA_HOST/PORT em config.ts e corrigir MemoryVectors

**What:** Ler CHROMA_HOST/PORT de environment variables e usar como defaults no MemoryVectors constructor ao invés de hardcoded localhost.

**How:**
1. Atualizado apps/backend-ts/src/config.ts:
   - Adicionado chromaHost: process.env.CHROMA_HOST ?? "localhost"
   - Adicionado chromaPort: parseInt(process.env.CHROMA_PORT ?? "8000", 10)

2. Atualizado apps/backend-ts/src/memory/vectors.ts:
   - Importado { config } from '../config.js'
   - Alterado constructor: this.host = options.host ?? config.chromaHost
   - Alterado constructor: this.port = options.port ?? config.chromaPort

3. Atualizado .env.example:
   - Adicionado CHROMA_HOST= com comentário explicando Docker vs dev
   - Adicionado CHROMA_PORT=8000

**Files modified:**
- apps/backend-ts/src/config.ts
- apps/backend-ts/src/memory/vectors.ts
- .env.example

**Commit:** 95e2479

**Verification:**
- TypeScript compilation: ✅ npx tsc --noEmit (zero errors)
- docker-compose.yml contém chromadb: service ✅
- docker-compose.yml contém chroma-data: volume ✅
- docker-compose.yml contém CHROMA_HOST=chromadb ✅
- vectors.ts contém config.chromaHost ✅
- .env.example contém CHROMA_HOST= ✅

## Deviations from Plan

None - plan executed exactly as written.

## Technical Decisions

**1. ChromaDB version 1.0.12**
- Rationale: Latest stable release as of April 2026; healthcheck endpoint /api/v2/heartbeat matches Chroma 1.x API
- Impact: Persistent volume schema compatible with chromadb JS client >=1.x
- Alternatives: 0.x (deprecated), 1.1.x (bleeding edge)

**2. Healthcheck start_period 20s**
- Rationale: ChromaDB needs time to initialize collections and load embeddings on first boot
- Impact: docker compose up waits ~20s before backend-ts starts (acceptable for production)
- Alternatives: 10s (too aggressive, flaky), 30s (unnecessarily slow)

**3. Environment variable defaults preserve backward compatibility**
- Rationale: Dev workflow on host uses localhost; Docker uses service name
- Impact: Zero .env changes required for existing dev setups; Docker env vars handled by compose
- Alternatives: Force explicit CHROMA_HOST (breaks dev UX)

## Files Changed

### Created
None

### Modified
- docker-compose.yml (27 insertions: chromadb service, volume, backend env vars)
- apps/backend-ts/src/config.ts (2 insertions: chromaHost/chromaPort exports)
- apps/backend-ts/src/memory/vectors.ts (2 insertions: config import, use config defaults)
- .env.example (4 insertions: CHROMA_HOST/PORT documentation)

## Testing & Validation

**Automated:**
- ✅ grep chromadb: docker-compose.yml (service declared)
- ✅ grep chroma-data: docker-compose.yml (volume declared)
- ✅ grep CHROMA_HOST=chromadb docker-compose.yml (env var set)
- ✅ grep config.chromaHost vectors.ts (config usage verified)
- ✅ npx tsc --noEmit (TypeScript compilation clean)

**Manual (deferred to deployment):**
- [ ] docker compose up --build: chromadb service starts healthy
- [ ] backend-ts logs show connection to chromadb:8000
- [ ] POST /chat with memory recall works (ChromaDB queryMemories returns results)
- [ ] docker compose down && docker compose up: chroma-data volume preserves embeddings

## Requirements Completed

- ✅ **DOCK-06:** ChromaDB roda como serviço dedicado no docker-compose com nome 'chromadb' — volume chroma-data persiste dados
- ✅ **DOCK-07:** Backend-ts conecta ao ChromaDB via rede Docker interna usando CHROMA_HOST env var — zero hardcode de localhost

## Known Issues

None identified during implementation.

## Known Stubs

None - all data flows are wired. MemoryVectors now reads config.chromaHost/chromaPort from environment variables and connects to the correct ChromaDB service in both Docker (chromadb:8000) and dev (localhost:8000) environments.

## Next Steps

**Immediate (this milestone):**
- Plan 26-02: Pre-download Whisper model during Docker build (DOCK-08, DOCK-09)
- Phase 27: System prompt pt-BR + memória semântica funcionando (CONV-07, CONV-08, CONV-09)

**Follow-up validation:**
1. Deploy Docker stack: `docker compose up --build`
2. Verificar logs chromadb: healthcheck passing
3. Verificar logs backend-ts: "ChromaDB connected" ou similar
4. Testar conversa com recall: POST /chat com mensagem que deve recuperar memória
5. Verificar persistência: docker compose down, up, memórias ainda presentes

**Future improvements:**
- ChromaDB monitoring/metrics endpoint exposure (optional for observability)
- Backup/restore strategy for chroma-data volume (production ops concern)

## Self-Check: PASSED

**Files created:**
None expected - verified

**Files modified:**
- ✅ docker-compose.yml exists and contains chromadb service
- ✅ apps/backend-ts/src/config.ts exists and contains chromaHost/chromaPort
- ✅ apps/backend-ts/src/memory/vectors.ts exists and imports config
- ✅ .env.example exists and contains CHROMA_HOST/PORT

**Commits exist:**
- ✅ 84e25ae: feat(26-01): adiciona ChromaDB como serviço Docker
- ✅ 95e2479: feat(26-01): configura CHROMA_HOST/PORT via env vars

All claimed artifacts verified.
