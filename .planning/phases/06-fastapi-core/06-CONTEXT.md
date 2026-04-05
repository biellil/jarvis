# Phase 6: FastAPI Core - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Adicionar camada HTTP ao JARVIS Python existente — expor `ChatSession` via FastAPI com:
- `POST /chat` — resposta completa (wraps `ChatSession.send()`)
- `GET /chat/stream` — tokens em streaming via Server-Sent Events (SSE)
- `GET /health` — liveness probe
- `GET /health/ready` — readiness probe (checa ChromaDB + SQLite)

O CLI (`python -m jarvis`) deve continuar funcionando **identicamente** ao v1.0. A API HTTP é uma camada nova por cima, sem modificar o comportamento existente.

</domain>

<decisions>
## Implementation Decisions

### Sessão HTTP
- **D-01:** Sessão única global — um `ChatSession` compartilhado pelo processo inteiro. Todos os requests HTTP continuam a mesma conversa (igual ao CLI). Single-worker uvicorn garante que não há concorrência. Não implementar session pool por ID nesta fase (API-06 está nos deferred).

### Streaming
- **D-02:** Adicionar `send_stream(user_input: str)` como método separado em `ChatSession` — usa `asyncio.Queue` internamente para capturar tokens e expô-los como async generator. O método `send()` original é preservado **100% intocado** — CLI não muda. O endpoint SSE do FastAPI consome o generator de `send_stream()`.

### Entrada do Servidor
- **D-03:** Módulo dedicado `src/jarvis/api/` com entrypoint `jarvis.api:app`. Inicialização: `python -m jarvis.api` ou `uvicorn jarvis.api:app --host 0.0.0.0 --port 8000`. CLI (`python -m jarvis`) e API são entrypoints completamente separados. O `__main__.py` existente não é modificado. Docker CMD apontará para uvicorn.

### Banco de Dados
- **D-04:** API HTTP usa os mesmos `data/jarvis.db` (SQLite) e `data/chroma/` (ChromaDB) que o CLI. Paths configurados via `.env` através de `Settings.sqlite_path` e `Settings.chroma_path` — sem vars adicionais. A API lembra tudo que o CLI lembrou e vice-versa.

### Claude's Discretion
- Estrutura interna do módulo `jarvis/api/` (roteamento, organização de arquivos)
- Tratamento de erros HTTP (status codes, formato de erro)
- Configuração de porta via `Settings` (adicionar `api_host` e `api_port` com defaults sensatos)
- Validação de payload do `POST /chat` (Pydantic model)
- Lifecycle do `ChatSession` no startup do FastAPI (lifespan event)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — Requirements API-01, API-02, API-03, API-04 com success criteria detalhados

### Código existente crítico
- `src/jarvis/core/session.py` — `ChatSession.send()` (linha 114) — interface a ser wrappada; `send_stream()` será adicionado aqui
- `src/jarvis/config.py` — `Settings` singleton — padrão de configuração a seguir para novos campos de API
- `src/jarvis/__main__.py` — Entrypoint CLI existente — **não modificar**

### Decisões de arquitetura herdadas (STATE.md)
- Config singleton: `from jarvis.config import settings` — nunca ler `os.environ` diretamente
- `asyncio.to_thread()` para chamadas bloqueantes (ARCH-02)
- Single uvicorn worker obrigatório — in-memory session_store quebra com múltiplos workers
- FastAPI 0.135.3 + uvicorn[standard] 0.43.0 — SSE via `EventSourceResponse` nativa (sem sse-starlette)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ChatSession` (`src/jarvis/core/session.py`): Classe principal a ser exposta. `send()` retorna `str` completo, será complementado por `send_stream()`.
- `Settings` (`src/jarvis/config.py`): Singleton pydantic-settings. Novos campos de API (`api_host`, `api_port`) devem seguir o mesmo padrão.
- `MemoryStore` + `MemoryVectors`: Já inicializados pelo `ChatSession` — não precisa instanciar separado na API.

### Established Patterns
- Configuração via `Settings` singleton — toda config nova segue esse padrão
- `asyncio.to_thread()` para operações bloqueantes (ARCH-02 compliance)
- Inicialização com validação via `core/startup.py`

### Integration Points
- `src/jarvis/api/` (novo módulo) se integra ao `ChatSession` via import direto
- O FastAPI `lifespan` event cria o `ChatSession` global e o fecha no shutdown
- `POST /chat` chama `session.send()` (método existente)
- `GET /chat/stream` chama `session.send_stream()` (método novo)
- `GET /health/ready` verifica `data/jarvis.db` existe + ChromaDB responde

</code_context>

<specifics>
## Specific Ideas

- GET `/chat/stream?message=oi` (query param) — conforme success criteria do ROADMAP.md (não POST para o stream)
- `python -m jarvis.api` como comando de desenvolvimento — simétrico ao `python -m jarvis`
- `GET /health` retorna `{"status": "ok"}` — shape exato conforme success criteria
- `GET /health/ready` verifica operacionalidade real do ChromaDB e SQLite antes de retornar healthy

</specifics>

<deferred>
## Deferred Ideas

- **Session pool por ID** (`session_id → ChatSession`) — API-06 nos deferred requirements, não entra na Phase 6
- **GET /config + POST /config** — API-05 nos deferred
- **Autenticação / rate limiting** — Out of scope explícito (uso pessoal em rede local)
- **WebSockets** — Out of scope (SSE é suficiente para output unidirecional)

</deferred>

---

*Phase: 06-fastapi-core*
*Context gathered: 2026-04-05*
