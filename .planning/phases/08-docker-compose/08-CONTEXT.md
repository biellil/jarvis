# Phase 8: Docker Compose - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Containerizar os dois serviços existentes (FastAPI Python + Express Node gateway) com Docker Compose:
- `Dockerfile` multi-stage para o Python service (`python:3.12-slim`)
- `Dockerfile` multi-stage para o Node gateway (`node:22-slim`, tsc+node)
- `docker-compose.yml` com health checks, depends_on, volume e rede
- `.dockerignore` correto em ambos os contextos
- Somente modo produção — sem dev compose

O código Python e Node **não é modificado**. Docker é uma camada de empacotamento por cima de serviços já funcionando localmente.

</domain>

<decisions>
## Implementation Decisions

### Modo Docker
- **D-01: Somente produção** — Um único `docker-compose.yml` com imagens compiladas. Sem `docker-compose.dev.yml`. Desenvolvimento local continua sem Docker (`python -m jarvis.api` + `pnpm dev`). Mantém simplicidade — não há necessidade de hot-reload dentro de container para uso pessoal.

### Build Strategy do Node
- **D-02: tsc + node (multi-stage)** — Stage 1: instala devDependencies + compila com `tsc`. Stage 2: copia `dist/` + instala somente `dependencies` (sem devDeps). Executa `node dist/index.js`. Imagem final menor, sem esbuild/tsx/vitest na produção.

### Python Service
- **D-03: `python:3.12-slim` base** — Nunca Alpine (musl quebra onnxruntime, ctranslate2, numpy). Multi-stage: stage builder instala deps Python, stage runtime recopia site-packages + instala system libs explicitamente (`libgomp1`, `libsndfile1`, `libportaudio2`, `espeak-ng`, `curl`).
- **D-04: Single worker uvicorn** — `CMD ["uvicorn", "jarvis.api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]`. Obrigatório per D-01 da Phase 6 (in-memory session_store quebra com múltiplos workers).

### Networking
- **D-05: FastAPI exposto apenas internamente** — `expose: ["8000"]` no python-service (sem `ports:`). Somente o gateway tem `ports: ["3000:3000"]`. Comunicação interna via bridge network `jarvis-net` usando service name DNS (`http://python-service:8000`). O `.env` de produção deve ter `FASTAPI_URL=http://python-service:8000`.
- **D-06: LM Studio via `host.docker.internal`** — No Linux, `extra_hosts: ["host.docker.internal:host-gateway"]` no python-service para conectar ao LM Studio rodando no host. A var `LM_STUDIO_URL` no `.env` deve apontar para `http://host.docker.internal:1234/v1`.

### Persistência
- **D-07: Volume `./data:/app/data`** — Um único volume bind mount no python-service para SQLite (`jarvis.db`) e ChromaDB (`chroma/`). Dados persistem entre `docker compose down && up`. Gateway não precisa de volume — é stateless.

### Variáveis de Ambiente
- **D-08: `env_file: .env`** — Ambos os serviços usam `env_file: .env` no `docker-compose.yml`. `.env` **nunca** entra na imagem Docker (`.dockerignore` obrigatório). Sem hardcode de secrets no Dockerfile ou docker-compose.yml.

### Health Checks
- **D-09: Health check com start_period longo** — Python service: `healthcheck` via `curl -f http://localhost:8000/health/ready` com `start_period: 60s` (ChromaDB + sentence-transformers init pode levar 15-60s). Gateway: `depends_on: python-service: condition: service_healthy`.

### Claude's Discretion
- Intervalos e retries do healthcheck (interval, timeout, retries)
- Estrutura de multi-stage naming (builder/runtime ou stage names)
- `.dockerignore` paths completos para ambos os contextos
- Ordem das camadas Docker para cache eficiente (COPY pyproject.toml antes de COPY src/)
- Build args vs env vars para configuração de build

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — Requirements DOCKER-01 a DOCKER-05 com success criteria

### Código existente crítico
- `src/jarvis/api/__main__.py` — Entrypoint uvicorn (workers=1, host/port via settings)
- `src/jarvis/config.py` — Settings Python (api_host, api_port, sqlite_path, chroma_path)
- `apps/gateway/src/index.ts` — Entrypoint Express (GATEWAY_PORT)
- `apps/gateway/src/config.ts` — Config Node (FASTAPI_URL, GATEWAY_PORT)
- `apps/gateway/package.json` — Scripts de build (tsc) e dependências
- `apps/gateway/tsconfig.json` — Config TypeScript (outDir, target)
- `pyproject.toml` — Dependências Python (fastapi, uvicorn, etc.)
- `.env.example` — Vars de ambiente existentes

### Decisões de arquitetura herdadas
- Phase 6 CONTEXT.md: D-01 (single worker), D-03 (módulo `jarvis.api`)
- STATE.md: `python:3.12-slim`, `host.docker.internal`, voice pipeline fora do Docker

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/jarvis/api/__main__.py` — Já usa `settings.api_host` / `settings.api_port` — Docker CMD pode usar uvicorn diretamente
- `apps/gateway/package.json` scripts: `build: tsc`, `start: node --env-file ../../.env dist/index.js` — adaptável para Docker (sem `--env-file`, usar `env_file:` do Compose)

### Established Patterns
- Config via `.env` compartilhado na raiz (Phase 7 D-02) — mantido no Docker via `env_file:`
- `FASTAPI_URL` no gateway config — trocar para `http://python-service:8000` em produção Docker

### Integration Points
- Python service: `data/` dir montado como volume — `sqlite_path` e `chroma_path` nas Settings devem apontar para `/app/data/`
- Gateway: sem estado — lê `FASTAPI_URL` do env, aponta para `http://python-service:8000` no Docker
- LM Studio: `LM_STUDIO_URL=http://host.docker.internal:1234/v1` no `.env` para uso dentro de container no Linux

### Estrutura atual do repo (pós-Phase 7)
```
jarvis/
  pyproject.toml           # Python deps
  pnpm-workspace.yaml      # workspace: apps/*, packages/*
  package.json             # root pnpm scripts
  src/jarvis/api/          # FastAPI service (porta 8000)
  apps/gateway/            # Express gateway (porta 3000)
  data/                    # SQLite + ChromaDB (persistência local)
  .env                     # vars compartilhadas
  .env.example
```

</code_context>

<specifics>
## Specific Ideas

- `docker compose up --wait` como comando principal — `--wait` espera todos os healthchecks passarem
- `docker compose down && docker compose up --wait` deve preservar `./data` (volume bind mount, não named volume)
- `FASTAPI_URL=http://python-service:8000` no docker-compose.yml ou em um `.env.docker` separado para override
- `docker build` nunca deve incluir `.env` — verificável inspecionando layers da imagem
- Gate de smoke test: `docker compose exec python-service python -c "import faster_whisper; print('OK')"` deve sair 0

</specifics>

<deferred>
## Deferred Ideas

- `docker-compose.dev.yml` com hot-reload — decidido fora de escopo (D-01)
- Makefile com atalhos — não selecionado para discussão nessa fase
- CI/CD pipeline com Docker build — milestone futuro
- Docker Hub / registry push — milestone futuro
- Multi-arch builds (amd64/arm64) — milestone futuro

</deferred>

---

*Phase: 08-docker-compose*
*Context gathered: 2026-04-06*
