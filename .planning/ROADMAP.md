# Roadmap: JARVIS

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-04-05)
- 📋 **v1.1 Monorepo + API** — Phases 6-8 (active)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) — SHIPPED 2026-04-05</summary>

- [x] Phase 1: Foundation (4/4 plans) — completed 2026-04-02
- [x] Phase 2: Memory (6/6 plans) — completed 2026-04-04
- [x] Phase 3: Voice Pipeline (6/6 plans) — completed 2026-04-04
- [x] Phase 4: PC Control (3/3 plans) — completed 2026-04-05
- [x] Phase 5: Advanced Features (2/2 plans) — completed 2026-04-05

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### 📋 v1.1 Monorepo + API (Phases 6-8)

- [x] **Phase 6: FastAPI Core** — Python HTTP layer expondo chat, streaming SSE e health probes (completed 2026-04-05)
- [x] **Phase 7: Monorepo + Express Gateway** — pnpm workspace e gateway Node/TS proxiando para FastAPI (completed 2026-04-06)
- [x] **Phase 8: Docker Compose** — Containerização de ambos os serviços com saúde, volumes e rede (completed 2026-04-06)

## Phase Details

### Phase 6: FastAPI Core
**Goal**: O core Python do JARVIS está acessível via HTTP com suporte a respostas completas, streaming SSE token-a-token e health probes para orquestradores externos
**Depends on**: Nothing (primeira fase do v1.1 — Python core v1.0 já está completo)
**Requirements**: API-01, API-02, API-03, API-04
**Success Criteria** (what must be TRUE):
  1. `curl -X POST http://localhost:8000/chat -d '{"message":"oi"}' -H 'Content-Type: application/json'` retorna resposta JSON completa com o texto do JARVIS
  2. `curl -N "http://localhost:8000/chat/stream?message=oi"` exibe tokens chegando incrementalmente em tempo real (Server-Sent Events), não uma resposta buffered
  3. `curl http://localhost:8000/health` retorna `{"status":"ok"}` indicando que o serviço está vivo
  4. `curl http://localhost:8000/health/ready` retorna status indicando se ChromaDB e SQLite estão operacionais e prontos para receber requests
  5. Todos os 234 testes existentes continuam passando após a adição do FastAPI — `python -m jarvis` CLI funciona idêntico ao v1.0
**Plans**: 2 plans

Plans:
- [x] 06-01-PLAN.md — FastAPI app scaffold, lifespan, Settings, health endpoints (API-03, API-04)
- [x] 06-02-PLAN.md — send_stream(), POST /chat (API-01), GET /chat/stream SSE (API-02)

### Phase 7: Monorepo + Express Gateway
**Goal**: O projeto tem estrutura pnpm workspaces com um gateway Express/TypeScript que recebe requests externos, valida payloads e proxia para FastAPI sem buffering de stream
**Depends on**: Phase 6 (FastAPI deve estar rodando para o gateway ter algo para proxiar)
**Requirements**: MONO-01, GW-01, GW-02, GW-03, GW-04, GW-05
**Success Criteria** (what must be TRUE):
  1. `pnpm install` executado na raiz do repositório instala todas as dependências Node de todos os pacotes do workspace sem erros
  2. `curl -X POST http://localhost:3000/api/chat -d '{"message":"oi"}' -H 'Content-Type: application/json'` retorna a resposta do JARVIS proxiada pelo gateway Express
  3. `curl -N "http://localhost:3000/api/chat/stream?message=oi"` exibe tokens chegando incrementalmente através do proxy Express — sem buffering, sem delay até o final
  4. `curl http://localhost:3000/api/health` retorna saúde agregada do gateway e do Python service
  5. Um request com payload inválido (ex: sem campo `message`) retorna erro estruturado `{"error":..., "code":..., "message":...}` com HTTP 4xx — nunca chega ao Python
**Plans**: 2 plans

Plans:
- [x] 07-01-PLAN.md — pnpm workspace scaffold, Express app factory, Zod validation, error normalization (MONO-01, GW-04, GW-05)
- [x] 07-02-PLAN.md — Proxy routes: POST /api/chat, GET /api/chat/stream SSE, GET /api/health agregado (GW-01, GW-02, GW-03)

### Phase 8: Docker Compose
**Goal**: Ambos os serviços (Python FastAPI e Node gateway) rodam em containers orquestrados por Docker Compose, com persistência de dados entre restarts e o gateway só iniciando após o Python estar saudável
**Depends on**: Phase 7 (ambos os serviços devem funcionar localmente antes de containerizar)
**Requirements**: DOCKER-01, DOCKER-02, DOCKER-03, DOCKER-04, DOCKER-05
**Success Criteria** (what must be TRUE):
  1. `docker compose up --wait` sobe ambos os serviços e reporta ambos como healthy sem intervenção manual
  2. `curl -X POST http://localhost:3000/api/chat -d '{"message":"oi"}' -H 'Content-Type: application/json'` responde corretamente com ambos os serviços rodando em containers
  3. `docker compose down && docker compose up --wait` preserva histórico de conversas e memória semântica — dados do SQLite e ChromaDB persistem no volume `./data`
  4. O gateway nunca inicia se o Python service não passar no health check — `docker compose logs gateway` não mostra tentativas de conexão enquanto Python ainda está inicializando
  5. `docker build` não inclui `.env`, `.venv/`, `node_modules/`, `data/` nem `.planning/` na imagem — verificável via `docker image inspect` e ausência de segredos no layer
**Plans**: 2 plans

Plans:
- [x] 08-01-PLAN.md — Dockerfile.python multi-stage, Dockerfile.node multi-stage, .dockerignore (DOCKER-01, DOCKER-02, DOCKER-05)
- [ ] 08-02-PLAN.md — docker-compose.yml com health checks, depends_on, volumes, networking + smoke test (DOCKER-03, DOCKER-04)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 4/4 | Complete | 2026-04-02 |
| 2. Memory | v1.0 | 6/6 | Complete | 2026-04-04 |
| 3. Voice Pipeline | v1.0 | 6/6 | Complete | 2026-04-04 |
| 4. PC Control | v1.0 | 3/3 | Complete | 2026-04-05 |
| 5. Advanced Features | v1.0 | 2/2 | Complete | 2026-04-05 |
| 6. FastAPI Core | v1.1 | 2/2 | Complete   | 2026-04-05 |
| 7. Monorepo + Express Gateway | v1.1 | 2/2 | Complete   | 2026-04-06 |
| 8. Docker Compose | v1.1 | 0/2 | Complete    | 2026-04-06 |
