# Phase 14: TypeScript Backend Scaffolding - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Infraestrutura básica para o novo backend TypeScript — criar `apps/backend-ts` no monorepo com package structure, servidor HTTP Express rodando na porta 8001, health endpoint, build system, e Docker Compose configurado para rodar em paralelo com o backend Python.

**Escopo:** Apenas scaffolding e infraestrutura. LLM, Memory, Tools ficam para phases futuras (15-19).

</domain>

<decisions>
## Implementation Decisions

### Package Structure
- **D-01:** Usar estrutura flat `src/` igual ao gateway — `src/index.ts`, `src/server.ts`, `src/routes/`, etc.
- **D-02:** Seguir pattern do gateway: `@jarvis/backend-ts` como package name no monorepo
- **D-03:** Código em camadas (`src/api/`, `src/llm/`, `src/memory/`) fica para quando essas camadas existirem (Phase 15+)

### HTTP Server
- **D-04:** Express 5.x (mesma versão do gateway) para consistência
- **D-05:** Porta 8001 (documentado no REQUIREMENTS.md) — Python=8000, Gateway=3000, TS=8001
- **D-06:** Endpoint GET /health retorna `{"status":"ok"}` com status 200
- **D-07:** Estrutura preparada para SSE streaming (GET /chat/stream) mas implementação vem no Phase 17

### Build System & Development
- **D-08:** Development mode: `tsx --watch src/index.ts` (igual gateway — hot-reload instantâneo, sem build explícito)
- **D-09:** Production build: `tsc` compila para `dist/` (igual gateway)
- **D-10:** Scripts pnpm: `dev` (tsx watch), `build` (tsc), `start` (node dist), `test` (vitest)
- **D-11:** TypeScript strict mode obrigatório (`tsconfig.json` herda de `@tsconfig/node22`)

### Docker & Native Modules
- **D-12:** Base image: `node:22-slim` (consistência com Dockerfile.node existente)
- **D-13:** Multi-stage build: builder stage instala build tools (python3, make, g++) para compilar native modules (better-sqlite3, @nut-tree-fork/nut-js virão no Phase 16/18)
- **D-14:** Runtime stage: apenas production deps + compiled JS (otimização de tamanho)
- **D-15:** `.npmrc` com `shamefully-hoist=true` no package root (requisito para native modules no pnpm — documentado em REQUIREMENTS.md INFRA-03)

### Docker Compose Integration
- **D-16:** Novo serviço `backend-ts` na porta 8001 (exposed internamente, não publicada até Phase 21)
- **D-17:** Health check: `curl -f http://localhost:8001/health` (mesmo pattern do python-service)
- **D-18:** Mesma network `jarvis-net` que Python + Gateway (comunicação interna)
- **D-19:** Volume `./data` montado em `/app/data` (preparado para SQLite/ChromaDB no Phase 16)
- **D-20:** `extra_hosts: host-gateway` para acessar LM Studio no host via `host.docker.internal`

### Claude's Discretion
- Error handling strategy (middleware structure, error normalization)
- Logging approach (console.log vs structured logging library)
- Test framework setup (vitest já usado no gateway — seguir padrão)
- TypeScript config details (target, module, lib — seguir gateway)
- Package.json engines exact versions (Node 22.x, pnpm 10.x)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Scaffolding & Infrastructure — INFRA-01 through INFRA-06

### Existing Patterns
- `apps/gateway/package.json` — package structure template (scripts, dependencies pattern)
- `apps/gateway/tsconfig.json` — TypeScript config template
- `apps/gateway/src/index.ts` — Express server entrypoint pattern
- `Dockerfile.node` — Multi-stage Docker build pattern
- `docker-compose.yml` — Service orchestration pattern

### Constraints from PROJECT.md
- `.planning/PROJECT.md` §Constraints — Node.js + TypeScript stack, multi-LLM abstraction, cross-platform code isolation

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Gateway package.json** (`apps/gateway/package.json`) — Scripts pattern: `dev` (tsx watch), `build` (tsc), `start` (node dist), `test` (vitest)
- **Gateway tsconfig.json** (`apps/gateway/tsconfig.json`) — Extends `@tsconfig/node22`, type: module, strict mode
- **Dockerfile.node** — Multi-stage build pattern: builder (all deps + compile) → runtime (prod deps only)
- **Docker Compose pattern** — Health check com curl, depends_on com condition, volumes para persistência

### Established Patterns
- **Express 5.x** — Gateway já usa, mesma versão para consistência
- **Node 22 LTS** — Engine constraint no root package.json
- **pnpm workspaces** — Monorepo já configurado em `pnpm-workspace.yaml`
- **Multi-stage Docker** — Otimização de imagem final (builder stage com devDeps, runtime stage limpo)

### Integration Points
- **pnpm-workspace.yaml** — Adicionar `apps/backend-ts` ao workspace (já lista `apps/*`)
- **docker-compose.yml** — Adicionar serviço `backend-ts` ao lado de `python-service` e `gateway`
- **Root package.json** — Opcionalmente adicionar scripts de atalho apontando para backend-ts

### Known Constraints
- **Native modules** — better-sqlite3 e @nut-tree-fork/nut-js (virão no Phase 16/18) precisam de `.npmrc` com `shamefully-hoist=true`
- **Port allocation** — 8000=Python, 3000=Gateway, 8001=TS backend (documentado em REQUIREMENTS.md)
- **Node 22 required** — Gateway usa `node:22-slim`, manter consistência
- **Volume mount** — `./data` compartilhado entre Python e TS backends para SQLite/ChromaDB

</code_context>

<specifics>
## Specific Ideas

Nenhum requisito específico — abordagens padrão aceitáveis.

Backend-ts deve seguir os mesmos padrões arquiteturais do gateway (Express + TypeScript + strict mode) mas com estrutura preparada para complexidade futura (LLM orchestration, memory management, tool execution).

</specifics>

<deferred>
## Deferred Ideas

Nenhuma — discussão permaneceu dentro do escopo da fase.

Funcionalidades de LLM, Memory, Tools, Voice pipeline foram mencionadas apenas como contexto para preparar a estrutura, mas implementação delas está corretamente scoped nas phases 15-19.

</deferred>

---

*Phase: 14-typescript-backend-scaffolding*
*Context gathered: 2026-04-07*
