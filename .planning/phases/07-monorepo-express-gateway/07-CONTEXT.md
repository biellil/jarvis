# Phase 7: Monorepo + Express Gateway - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Adicionar estrutura pnpm workspaces ao repositório Python existente e criar um gateway Express/TypeScript que:
- Valida payloads de entrada via Zod (GW-05)
- Proxia `POST /api/chat` → FastAPI `POST /chat` (GW-01)
- Proxia `GET /api/chat/stream` → FastAPI `GET /chat/stream` **sem buffering** de SSE (GW-02)
- Expõe health agregado em `GET /api/health` (GW-03)
- Normaliza erros de qualquer origem para shape `{error, code, message}` (GW-04)
- Instala tudo via `pnpm install` na raiz (MONO-01)

O código Python existente (`src/jarvis/`, `pyproject.toml`) **não é modificado**. O gateway é uma camada Nova por cima do FastAPI.

</domain>

<decisions>
## Implementation Decisions

### Estrutura do Workspace
- **D-01: Layout `packages/gateway`** — `pnpm-workspace.yaml` e `package.json` (raiz) ficam na raiz do repo convivendo com `pyproject.toml` (Python). O gateway fica em `packages/gateway/`. Python e Node coexistem na mesma raiz sem conflito — cada um tem seu próprio arquivo de manifesto.

  Layout resultante:
  ```
  jarvis/
    pyproject.toml         # Python (inalterado)
    pnpm-workspace.yaml    # novo — declara packages: ['packages/*']
    package.json           # raiz pnpm — engines, scripts de dev
    packages/
      gateway/
        package.json
        tsconfig.json
        src/
    src/                   # Python (inalterado)
    tests/                 # Python (inalterado)
    data/                  # SQLite + ChromaDB (inalterado)
  ```

### Configuração do Gateway
- **D-02: `.env` compartilhado na raiz** — Um único `.env` na raiz do repositório serve tanto o Python quanto o Node. O gateway lê `../../.env` via `dotenv` (ou via `--env-file` no script npm). Nenhuma duplicação de vars. Vars relevantes para o gateway:
  - `FASTAPI_URL=http://localhost:8000` — onde o FastAPI está ouvindo
  - `GATEWAY_PORT=3000` — porta que o Express expõe
  Sem `packages/gateway/.env` separado.

### Claude's Discretion
- Biblioteca de proxy para SSE passthrough (http-proxy-middleware vs undici vs implementação manual) — escolher o que garante stream sem buffering
- Build strategy TypeScript: tsx para dev, tsc + node para prod/Docker
- Estrutura interna de `packages/gateway/src/` (rotas, middlewares, organização de arquivos)
- Scripts npm na raiz (`dev`, `build`, `start`) para orquestrar o gateway via pnpm filter
- Versionamento do Node e pnpm (engines field em package.json)
- Tipagem Zod dos payloads (schema dos requests GW-05)
- Shape exato de erros normalizados GW-04 (`{error: boolean, code: string, message: string}`)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — Requirements MONO-01, GW-01 a GW-05 com success criteria

### Código existente crítico
- `src/jarvis/api/routes/` — Rotas FastAPI que o gateway vai proxiar (contratos de request/response)
- `src/jarvis/config.py` — Settings Python que lê do `.env` raiz (padrão de config a espelhar no Node)
- `.env` (raiz, se existir) ou `.env.example` — vars que já existem e que o gateway vai compartilhar

### Decisões de arquitetura herdadas (STATE.md + Phase 6 CONTEXT)
- FastAPI roda em `localhost:8000` — gateway sempre proxia para lá
- Sem auth — uso pessoal em rede local (REQUIREMENTS.md Out of Scope)
- Config via `.env` — nunca hardcode de URL/porta (ARCH decision v1.0)
- SSE endpoint no FastAPI: `GET /chat/stream?message=...` (query param, não body)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/jarvis/api/routes/` — contratos dos endpoints FastAPI que o gateway vai espelhar em `/api/*`
- `.env` na raiz — gateway lê do mesmo arquivo via dotenv com path relativo

### Established Patterns
- Config via variáveis de ambiente (nunca hardcode) — padrão Python a replicar em Node
- Porta configurável via settings (FastAPI usa `api_port`, gateway usará `GATEWAY_PORT`)

### Integration Points
- Gateway ↔ FastAPI: HTTP interno `http://localhost:${FASTAPI_URL}` para requests síncronos
- Gateway ↔ FastAPI: SSE passthrough `GET /chat/stream` — pipe sem acumular body
- `GET /api/health` chama `GET /health/ready` do FastAPI e agrega com status próprio do gateway

### Estrutura atual do repo (pré-Phase 7)
```
jarvis/
  pyproject.toml
  src/jarvis/api/       # FastAPI — porta 8000
  tests/
  data/
```

</code_context>

<specifics>
## Specific Ideas

- `pnpm install` na raiz instala todas as deps Node de todos os packages (MONO-01)
- `POST /api/chat` proxia para `POST /chat` do FastAPI — body idêntico passado adiante
- `GET /api/chat/stream?message=oi` proxia para `GET /chat/stream?message=oi` — SSE pipe sem buffering
- `GET /api/health` retorna shape agregado: `{gateway: "ok", python: <status do FastAPI /health/ready>}`
- Payload inválido (sem `message`) → rejeitar no gateway com 400 antes de bater no Python
- Shape de erro: `{error: true, code: "VALIDATION_ERROR", message: "..."}` — nunca vazar stack trace

</specifics>

<deferred>
## Deferred Ideas

- **MONO-02** — `packages/types` com tipos TypeScript compartilhados — REQUIREMENTS deferred
- **MONO-03** — Setup script unificado `pnpm install` + `pip install -e ".[dev]"` — REQUIREMENTS deferred
- **GW-06** — Endpoints de gerenciamento de sessão — REQUIREMENTS deferred
- **GW-07** — Busca semântica na memória via gateway — REQUIREMENTS deferred
- **Autenticação / rate limiting** — Out of scope explícito (uso pessoal em rede local)
- **WebSockets no gateway** — Out of scope (SSE é suficiente)

</deferred>

---

*Phase: 07-monorepo-express-gateway*
*Context gathered: 2026-04-05*
