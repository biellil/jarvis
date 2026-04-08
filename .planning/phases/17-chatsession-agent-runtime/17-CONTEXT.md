# Phase 17: ChatSession + Agent Runtime — Context

**Gathered:** 2026-04-08
**Status:** Ready for planning
**Source:** /gsd-discuss-phase 17 (interativo)

<domain>
## Phase Boundary

Esta fase entrega o **agente conversacional do backend TypeScript** rodando em LangGraph com streaming SSE, mantendo paridade 1:1 com o backend Python (`src/jarvis/api/routes/chat.py` + `src/jarvis/core/session.py`).

**Dentro de escopo:**
- `ChatSession` em TS que encapsula histórico em memória, chamadas LLM streaming, e ciclo ReAct via `@langchain/langgraph`.
- Endpoints `POST /chat` (JSON) e `GET /chat/stream?message=...` (SSE) no Express, espelhando o FastAPI.
- Lock global (uma request por vez, 429 quando ocupado).
- Integração com `MemoryManager` da Fase 16 — exposta como **tool** `recall_memory` ao invés de injeção determinística.
- Persistência incremental de mensagens no SQLite via `MemoryStore` (Fase 16).
- Smoke test ponta-a-ponta do ciclo ReAct (a tool `recall_memory` exercita Reason → Act → Observe).

**Fora de escopo:**
- Migração das 9 PC tools (Fase 18).
- `POST /chat/audio` (Fase 19, voz).
- Compressão de histórico via rolling summary — fica como follow-up; nesta fase a `ChatSession` mantém `history` simples sem compressão.
- Multi-conversa, multi-tenant, sessionId do cliente — single-user single-session, igual Python.

</domain>

<decisions>
## Implementation Decisions

### Tools no agente (Q1)
**1b — Agente com 1 tool real (`recall_memory`)**

O agente da Fase 17 fica armado com **uma tool**: `recall_memory(query: string)` que internamente chama `MemoryManager.buildContext(query)` e devolve o resultado. Isso:
- Exercita o ciclo ReAct ponta-a-ponta nesta fase (smoke test real).
- Atende a decisão Q4 (agente decide quando puxar memória).
- Quando a Fase 18 chegar, é só adicionar as PC tools ao array `tools: [...]` — encanamento já validado.

### Endpoints (Q2)
**2a — Espelho exato do Python**

Dois endpoints, idênticos a `apps/backend-py`:
- `POST /chat` body `{"message": "..."}` → response `{"message": "..."}`
- `GET /chat/stream?message=...` → SSE com eventos `data: <token>` por token (raw text, sem JSON wrapping, sem campo `event:`)

`EventSource` do navegador é GET-only — por isso o stream usa GET. Mensagem na query string aceita o limite prático (~2KB), igual Python.

### Sessão / lifecycle (Q3)
**3c — Sessão única global**

Servidor mantém **uma** `ChatSession` viva em `app.state.session` (criada no startup do Express). Toda request entra nessa instância única. Não tem `sessionId` nem `conversationId` no request — single-user, single-session. A `ChatSession` cria **uma conversa nova no SQLite** quando o servidor sobe, e usa esse `conversationId` durante toda a vida do processo. Restart → nova conversa. Mensagens persistem; o que muda é a fronteira "essa conversa começou às X".

Lock global tipo `Mutex`/promise chain protege contra requests concorrentes. **429** com `detail: "Session busy — try again later"` igual Python.

### Memória no agente (Q4)
**4b — Memória como tool, agente decide**

`recall_memory` é exposta como tool LangChain. O agente decide quando chamar:
```typescript
const recallMemory = tool(
  async ({ query }) => {
    const ctx = await memoryManager.buildContext(query);
    return ctx || "Nenhuma memória relevante encontrada.";
  },
  {
    name: "recall_memory",
    description: "Busca memórias relevantes de conversas passadas e fatos do perfil do usuário. Use quando precisar lembrar algo que o usuário disse antes ou referenciar preferências dele.",
    schema: z.object({ query: z.string() }),
  }
);
```

Histórico da conversa atual fica em memória na `ChatSession` como `BaseMessage[]` (igual `self.history` no Python), sem precisar de query SQLite a cada turn.

### Paridade Python (Q5)
**5a — Espelho exato**

Request/response shape, status codes, formato SSE, headers — tudo igual `apps/backend-py/src/jarvis/api/routes/chat.py`. Lock global no mesmo modo. Cutover na Fase 21 vira "trocar a porta no gateway". Validação E2E na Fase 20 não precisa de adapter.

### Divergência consciente: 4b ↔ 5a
**Conflito:** Python injeta memória determinístico no system prompt a cada turn (`augmented_system` + profile facts + vector recall). TS vai delegar isso pro agente via tool calling.

**Aceito porque:**
- Fase 20 valida **comportamento de chat** (mesma resposta pra mesma entrada), não a forma exata de prompt interno.
- A divergência é interna ao agente — request/response externos continuam idênticos.
- O agente pode dar respostas levemente diferentes, mas o usuário valida via UAT.
- Vale documentar como **deviation** no PLAN.md e revisitar na Fase 20 se causar regressão.

### Histórico e compressão
- `ChatSession` mantém `history: BaseMessage[]` em memória durante a vida do processo.
- **Sem compressão de rolling summary nesta fase** (Python tem em `D-05` mas é otimização). Se context window estourar, falha de forma visível e a gente trata em follow-up.
- Mensagens são salvas no SQLite incrementalmente via `MemoryStore.saveMessages()` após cada turn (igual Python `D-05`).

### Modelo / LLM
- Usa o `createLLM` factory da Fase 15 — provider vem de env vars (`LLM_PROVIDER`, `LM_STUDIO_URL`, etc.).
- Streaming via `.stream()` da LangChain.js 1.x.
- System prompt fixo, igual o `SYSTEM_PROMPT` do Python (replicar de `src/jarvis/core/session.py`).

### Claude's Discretion
- Implementação interna do lock (`async-mutex`, `p-lock`, ou homemade Promise chain).
- Como envolver `createReactAgent` da `@langchain/langgraph` no fluxo de stream.
- Estrutura de pastas em `apps/backend-ts/src/session/` (provavelmente `chat-session.ts`, `tools.ts`, `system-prompt.ts`).
- Naming dos testes (vitest, padrão `*.test.ts` ao lado do código).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Python source de paridade
- `src/jarvis/api/routes/chat.py` — endpoints `POST /chat`, `GET /chat/stream`, lock, 429
- `src/jarvis/api/models.py` — `ChatRequest`, `ChatResponse` (shape de request/response)
- `src/jarvis/core/session.py` — `ChatSession`, `send()`, `send_stream()`, `history`, augmented system prompt, profile/vector injection, post-turn profile extraction
- `src/jarvis/llm/factory.py` — referência do factory pattern (já replicado em TS na Fase 15)

### TypeScript já existente (Fases 14-16)
- `apps/backend-ts/src/llm/factory.ts` — `createLLM()` para construir o ChatModel
- `apps/backend-ts/src/memory/manager.ts` — `MemoryManager` (facade SQLite + ChromaDB + profile)
- `apps/backend-ts/src/memory/store.ts` — `MemoryStore.saveMessages()` para persistir mensagens
- `apps/backend-ts/src/memory/index.ts` — barrel de exports
- `apps/backend-ts/src/app.ts` / `src/index.ts` — Express setup, onde plugar `app.locals.session`

### LangChain.js / LangGraph
- `@langchain/langgraph` `createReactAgent` — agente ReAct com tools
- `@langchain/core/messages` — `HumanMessage`, `AIMessage`, `SystemMessage`, `ToolMessage`, `BaseMessage`
- `@langchain/core/tools` — `tool()` helper para definir `recall_memory`

### Decisões de milestone (já travadas)
- LangChain.js **1.x** (Phase 15 D)
- Backend TS na porta **8001** (Phase 14)
- Drizzle ORM + better-sqlite3 + ChromaDB (Phase 16)
- Express 5 + Node 22 LTS (v1.1 herdado)

</canonical_refs>

<specifics>
## Specific Ideas

- A tool `recall_memory` deve ter `description` em **português** explicando claramente quando usar — o LLM (especialmente o LM Studio local) pode ser sensível ao idioma da descrição.
- O `SYSTEM_PROMPT` deve ser portado **literalmente** do Python (provavelmente em pt-BR já). Verificar em `src/jarvis/core/session.py`.
- O lock deve liberar mesmo em caso de erro (try/finally), pra não deixar o servidor travado em 429 perpétuo.
- SSE: enviar `\n\n` ao final de cada evento (especificação). Express precisa de `res.flushHeaders()` e `res.write()` por chunk; não usar `res.json()`.
- Streaming token: `for await (const chunk of llm.stream(messages))` da LangChain.js 1.x já dá tokens individuais.

</specifics>

<deferred>
## Deferred Ideas

- **Compressão de histórico (rolling summary)** — Python tem `D-05`, fica pra v1.4 ou follow-up. Nesta fase, history cresce indefinido durante a vida do processo.
- **Multi-conversa / sessionId** — refactor pequeno se um dia precisar; não pra v1.3.
- **POST /chat/audio** — Fase 19 (voz).
- **PC tools (`open_app`, `move_file`, etc.)** — Fase 18.
- **Vision (multimodal images)** — Phase 5 do Python (`VISION-01`); fora do escopo desta fase, e nem tenho certeza se entra na v1.3 (verificar roadmap).
- **Concorrência real** (sem lock global) — deixa pra v1.4 se virar requisito.
- **Bug conhecido da Fase 16:** `MemoryVectorsOptions` não aceita `collection` — coleção hardcoded. Não bloqueia Fase 17 (single-user, single-collection serve), mas vale fixar antes de qualquer cenário multi-coleção.

</deferred>

---

*Phase: 17-chatsession-agent-runtime*
*Context gathered: 2026-04-08 via /gsd-discuss-phase*
