# Phase 6: FastAPI Core - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-05
**Phase:** 06-fastapi-core
**Areas discussed:** Estado da sessão HTTP, Bridge do streaming, Entrada do servidor, Dados compartilhados

---

## Estado da Sessão HTTP

| Option | Description | Selected |
|--------|-------------|----------|
| Sessão única global | Um ChatSession compartilhado por processo. Todos os requests HTTP continuam a mesma conversa — igual ao CLI. | ✓ |
| Stateless por-request | Cada POST /chat cria um ChatSession novo. Sem histórico entre requests. | |
| Session pool por ID | session_id → ChatSession em dict. Múltiplas conversas paralelas. API-06 está nos deferred. | |

**User's choice:** Sessão única global
**Notes:** Escolha recomendada. Single-worker uvicorn garante ausência de concorrência. Mais simples e reflete o comportamento natural do CLI.

---

## Bridge do Streaming

| Option | Description | Selected |
|--------|-------------|----------|
| asyncio.Queue + send_stream() | Novo método em ChatSession usando asyncio.Queue. send() original preservado 100% intocado. | ✓ |
| Modificar send() com callback | Parâmetro opcional on_token: Callable adicionado ao send() existente. | |
| Endpoint SSE lê do LLM direto | Endpoint FastAPI chama LLM diretamente, bypassa ChatSession para streaming. | |

**User's choice:** asyncio.Queue + send_stream()
**Notes:** Preserva integridade do send() existente. CLI e 234 testes não são afetados.

---

## Entrada do Servidor

| Option | Description | Selected |
|--------|-------------|----------|
| Módulo dedicado | python -m jarvis.api ou uvicorn jarvis.api:app. Entrypoints separados. | ✓ |
| Flag --serve no CLI | python -m jarvis --serve. Um entrypoint, duas responsabilidades. | |
| Script dedicado na raiz | scripts/serve.py ou Makefile. Menos idiomático para Docker. | |

**User's choice:** Módulo dedicado
**Notes:** Separação limpa. Docker CMD aponta para uvicorn jarvis.api:app. CLI inalterado.

---

## Dados Compartilhados

| Option | Description | Selected |
|--------|-------------|----------|
| Mesmo banco, mesma configuração | data/jarvis.db e data/chroma/ compartilhados entre CLI e API. | ✓ |
| Banco separado por env var | API_SQLITE_PATH e API_CHROMA_PATH separados. Isolamento por padrão. | |

**User's choice:** Mesmo banco, mesma configuração
**Notes:** API e CLI compartilham memória — comportamento consistente e sem config adicional.

---

## Claude's Discretion

- Estrutura interna do módulo `jarvis/api/` (roteamento, organização de arquivos)
- Tratamento de erros HTTP (status codes, formato de erro)
- Configuração de porta via `Settings` (adicionar `api_host` e `api_port` com defaults)
- Validação de payload Pydantic para `POST /chat`
- Lifecycle do `ChatSession` via FastAPI lifespan event

## Deferred Ideas

- Session pool por ID (API-06 — deferred requirements)
- GET /config + POST /config (API-05 — deferred)
- Autenticação / rate limiting (out of scope explícito)
- WebSockets (out of scope — SSE suficiente)
