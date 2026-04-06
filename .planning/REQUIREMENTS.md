# Requirements — JARVIS v1.1 Monorepo + API

**Milestone:** v1.1 Monorepo + API
**Status:** Active
**Last updated:** 2026-04-05

---

## v1.1 Requirements

### MONOREPO — Estrutura pnpm Workspaces

- [ ] **MONO-01** — Usuário pode instalar todas as dependências do projeto com um único comando (`pnpm install`) via pnpm-workspace.yaml configurado na raiz com `packages/gateway`

### API — Camada HTTP Python (FastAPI)

- [x] **API-01** — Usuário pode enviar uma mensagem e receber resposta completa via `POST /chat` (wraps `ChatSession.send()`)
- [x] **API-02** — Usuário pode receber tokens em streaming via `GET /chat/stream` com SSE (Server-Sent Events) token-by-token
- [x] **API-03** — Sistema externo pode verificar se o serviço está vivo via `GET /health` (liveness probe)
- [x] **API-04** — Sistema externo pode verificar se o serviço está pronto para receber requests via `GET /health/ready` (readiness probe — checa ChromaDB + SQLite)

### GATEWAY — API Express TypeScript

- [x] **GW-01** — Usuário pode enviar mensagem ao JARVIS via `POST /api/chat` no gateway Express (proxia para FastAPI)
- [x] **GW-02** — Usuário pode receber tokens em streaming via `GET /api/chat/stream` no gateway Express (SSE passthrough sem buffering para FastAPI)
- [x] **GW-03** — Sistema externo pode verificar saúde completa via `GET /api/health` (health agregado: gateway + python service)
- [ ] **GW-04** — Erros de qualquer origem retornam shape consistente `{error, code, message}` via error normalization middleware
- [ ] **GW-05** — Requests com payload inválido são rejeitados com erro claro antes de chegar ao Python (Zod validation)

### DOCKER — Orquestração de Serviços

- [ ] **DOCKER-01** — Desenvolvedor pode construir imagem Python otimizada via Dockerfile multi-stage com `python:3.12-slim` (nunca Alpine)
- [ ] **DOCKER-02** — Desenvolvedor pode construir imagem Node otimizada via Dockerfile multi-stage com `node:22-slim`
- [ ] **DOCKER-03** — Desenvolvedor pode subir todos os serviços com `docker compose up` e o gateway só inicia após o Python estar saudável (`depends_on: service_healthy`)
- [ ] **DOCKER-04** — Dados de SQLite e ChromaDB persistem entre restarts via volume `./data:/app/data`
- [ ] **DOCKER-05** — Build de imagens não inclui `.env`, `.venv`, `node_modules`, `data/` ou `.planning/` via `.dockerignore` correto

---

## Future Requirements (deferred)

- **MONO-02** — packages/types: tipos TypeScript compartilhados entre pacotes Node
- **MONO-03** — Setup script que orquestra `pnpm install` + `pip install -e ".[dev]"` em um comando
- **API-05** — Usuário pode ler e trocar LLM backend ativo via `GET /config` + `POST /config`
- **API-06** — Múltiplas conversas paralelas via session ID threading (`session_id → ChatSession`)
- **GW-06** — Endpoints de gerenciamento de sessão (`GET /api/sessions`, `DELETE /api/sessions/{id}`)
- **GW-07** — Endpoint de busca semântica na memória (`GET /api/memory/search`)

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Autenticação / rate limiting | Uso pessoal em rede local — auth adiciona fricção sem benefício |
| WebSockets | SSE é suficiente para output unidirecional do LLM |
| Redis / message broker | Dict em memória é correto para uso single-user |
| Nginx / Traefik | Docker Compose bridge networking cobre service discovery |
| Voice pipeline no Docker | Hardware de áudio requer pass-through frágil; CLI continua no host |
| POST /api/voice (upload de áudio) | Requer multipart + STT pipeline — futuro |
| UI/UX | Milestone futuro (v1.2+) |

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| API-01 | Phase 6 | Complete |
| API-02 | Phase 6 | Complete |
| API-03 | Phase 6 | Complete |
| API-04 | Phase 6 | Complete |
| MONO-01 | Phase 7 | Pending |
| GW-01 | Phase 7 | Complete |
| GW-02 | Phase 7 | Complete |
| GW-03 | Phase 7 | Complete |
| GW-04 | Phase 7 | Pending |
| GW-05 | Phase 7 | Pending |
| DOCKER-01 | Phase 8 | Pending |
| DOCKER-02 | Phase 8 | Pending |
| DOCKER-03 | Phase 8 | Pending |
| DOCKER-04 | Phase 8 | Pending |
| DOCKER-05 | Phase 8 | Pending |
