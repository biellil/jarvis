# Phase 83: Quero coloca o langfuse - Context

**Gathered:** 2026-05-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Adicionar Langfuse observability ao backend TypeScript do JARVIS (`apps/backend-ts`).

Escopo:
- Integrar `@langfuse/langchain` CallbackHandler na invocação do LangGraph
- Capturar traces completos: nós planner + executor + todas as LLM calls (automático via callback)
- Adicionar spans manuais para operações ChromaDB (retrieval de memória)
- Adicionar spans manuais para chamadas MCP tools (PC-control)
- Suportar self-hosted Docker Compose (default) e Langfuse Cloud (opt-in via env var)
- **Fora do escopo:** cliente Python desktop-py (thin HTTP wrapper — valor negligível nesta fase)

</domain>

<decisions>
## Implementation Decisions

### D-01: Deployment — self-hosted por default, cloud via opt-in
- **Default:** Langfuse self-hosted via Docker Compose (local) — respeita constraint de privacidade do PROJECT.md
- **Opt-in cloud:** Se `LANGFUSE_HOST=https://cloud.langfuse.com` estiver no .env, usa Langfuse Cloud
- **Config pattern:** `LANGFUSE_ENABLED=true` habilita; sem a variável ou `false` = Langfuse desativado completamente
- `LANGFUSE_PUBLIC_KEY` e `LANGFUSE_SECRET_KEY` obrigatórios quando habilitado
- `LANGFUSE_HOST` opcional — default para `http://localhost:3000` (self-hosted local)
- Docker Compose para Langfuse fica em `infra/langfuse/docker-compose.yml` (não na raiz)

### D-02: Integração — CallbackHandler via @langfuse/langchain
- Package: `@langfuse/langchain` (CallbackHandler) + `@langfuse/core`
- Injetar o handler na invocação do graph via `graph.stream(input, { callbacks: [langfuseHandler] })`
- Os 3 pontos de invocação do graph:
  1. `chat.ts` L186 — nova task (stream inicial)
  2. `chat.ts` L117 — resume via chat (confirmação)
  3. `tasks.ts` L108 — resume via /tasks/:taskId/resume
- Handler criado por invocação (não singleton) para evitar context leakage entre requests concorrentes
- `flushAsync()` chamado após cada stream completar (before SSE response end) — garante envio das traces
- Se `LANGFUSE_ENABLED` é false: nenhum handler criado, zero overhead

### D-03: Escopo de rastreamento — full stack
1. **LangGraph traces (automático):** planner node + executor node + todas LLM calls capturadas pelo CallbackHandler
2. **ChromaDB/SQLite memory (manual):** spans manuais via Langfuse SDK (não CallbackHandler) nas operações de retrieval em `memory/vectors.ts` e `memory/manager.ts`
3. **MCP tool calls (manual):** spans manuais no `mcp/tool-adapter.ts` wrapping cada tool invocation

### D-04: Cliente — só backend-ts
- Desktop-py é thin HTTP wrapper, LLM/agente está todo no backend
- Python client **não** recebe Langfuse nesta fase

### Claude's Discretion
- Schema exato das variáveis de config em `config.ts` (adicionar LANGFUSE_* ao `config` object)
- Estrutura do `LangfuseCallbackHandler` — sessão por userId vs por taskId
- Nome exato da span para cada MCP tool (pode usar tool name da function call)
- Granularidade dos spans de ChromaDB (uma span por query vs por batch)
- Estrutura do docker-compose.yml (versões das imagens Langfuse/Postgres/MinIO)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pontos de invocação do LangGraph (onde injetar callbacks)
- `apps/backend-ts/src/routes/chat.ts` — L186 (nova task stream), L117 (resume via chat confirmation routing)
- `apps/backend-ts/src/routes/tasks.ts` — L108 (resume via /tasks/:taskId/resume endpoint)
- `apps/backend-ts/src/agent/graph.ts` — compilação do graph, `buildTaskGraph()`, `taskCheckpointer`

### Config e env vars
- `apps/backend-ts/src/config.ts` — config object (adicionar LANGFUSE_* aqui)
- `.env.example` — documentar as novas variáveis LANGFUSE_*

### Camada de memória (ChromaDB manual spans)
- `apps/backend-ts/src/memory/vectors.ts` — operações ChromaDB/embeddings
- `apps/backend-ts/src/memory/manager.ts` — memory manager que coordena retrieval

### MCP tool wrapping (manual spans)
- `apps/backend-ts/src/mcp/tool-adapter.ts` — adapter que invoca cada MCP tool

### Schema existente (padrão Drizzle — referência para seguir)
- `apps/backend-ts/src/memory/schema.ts` — padrão de tabelas e migrations do projeto

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `config.ts` — objeto `config` com `process.env` — padrão exato para adicionar `LANGFUSE_ENABLED`, `LANGFUSE_HOST`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`
- `AGENTIC_DISABLED=true` env-flag em `chat.ts` — padrão para feature flag (Langfuse segue o mesmo)
- `flushAsync()` deve ser chamado antes do `res.end()` nos SSE handlers

### Established Patterns
- SSE stream pattern em `chat.ts` e `tasks.ts` — `for await (const chunk of stream)` + writer; callback flush vai no finally block
- LLM factory em `factory.ts` — **não** é o ponto de injeção do CallbackHandler (o callback pertence à invocação do graph, não à criação do LLM)
- `activeGraphs` Map (taskId → graph) em tasks/chat routes — uma graph instance reutilizada por task

### Integration Points
- Injetar `{ callbacks: [langfuseHandler] }` no terceiro argumento de `graph.stream(input, config)` — os 3 call sites em chat.ts + tasks.ts
- Langfuse handler isolado em `apps/backend-ts/src/observability/langfuse.ts` (novo módulo)
- `infra/langfuse/docker-compose.yml` — novo diretório para infra Docker

</code_context>

<specifics>
## Specific Ideas

- Disabled by default — `LANGFUSE_ENABLED=false` até o usuário adicionar as keys no .env
- Self-hosted Docker Compose é a experiência principal; cloud é opt-in por env var (padrão conservador)
- Langfuse captura custo/tokens dos modelos cloud (OpenAI, Anthropic, Gemini) automaticamente via callback
- Para lmstudio (local) os tokens podem não aparecer — aceitável, é uso offline

</specifics>

<deferred>
## Deferred Ideas

- **Langfuse no desktop-py** — rastreamento de latência STT/TTS/HTTP. Valor marginal: LLM logic está no backend. Pode vir num milestone de observabilidade avançada.
- **OTEL-first integration** — API `LangfuseSpanProcessor` (v4/v5) ainda nova (< 9 meses). Reavaliar em 2026 Q4 quando API estabilizar.
- **SDK Manual root trace para sessões multi-turn** — agrupa múltiplos turnos de conversa numa única trace com `userId`. Útil quando o corpus de traces for grande o suficiente para análise de sessão.
- **Scores e feedback no Langfuse** — marcar traces como "boa resposta" via thumbs up no cliente. Futura fase de feedback loop.

</deferred>

---

*Phase: 83-quero-coloca-o-langfuse*
*Context gathered: 2026-05-27*
