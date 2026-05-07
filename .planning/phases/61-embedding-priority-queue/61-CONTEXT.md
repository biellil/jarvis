# Phase 61: Embedding Priority Queue - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Envolver todas as chamadas de embedding de memória (embedText via vectors.ts) em um EmbeddingQueue singleton baseado em p-queue, de modo que requests de chat sempre preemptam tarefas de embedding em andamento. saveTurn torna-se fire-and-forget via queue. AbortController gerencia limpeza de estado (não necessariamente interrupção nativa do pipeline).

Fora de escopo: mudança de provider de embedding (continua @xenova/transformers), controle de prioridade por sessão, métricas de latência expostas na UI.

</domain>

<decisions>
## Implementation Decisions

### Queue Architecture
- **D-01:** Criar `apps/backend-ts/src/memory/embedding-queue.ts` como singleton — exporta `enqueueEmbed()` e uma instância p-queue. `vectors.ts` chama `enqueueEmbed()` em vez de chamar `embedText()` diretamente. Ponto único de controle para prioridade e limpeza.
- **D-02:** Prioridade: embedding = 1, chat = 10 (via `queue.pause()`/`queue.resume()` — ver D-04).

### saveTurn
- **D-03:** `saveTurn()` torna-se fire-and-forget via `EmbeddingQueue`: `chat-session.ts` passa a chamar `void memory.saveTurn(...)`. SQLite (`store.saveMessages`) permanece síncrono/imediato dentro de saveTurn antes do enqueue de embedding — garantia de persistência SQL sem bloquear resposta.

### Mecanismo de Preempção
- **D-04:** `queue.pause()` antes da chamada LLM no chat handler; `queue.resume()` após receber a resposta. Novas tarefas de embed enfileiram mas não iniciam durante o processamento LLM. Simples, sem AbortController no hot path do chat.

### AbortController
- **D-05:** Investigar se `pipeline()` do `@xenova/transformers` aceita `AbortSignal`. Se sim, passar signal. Se não (best-effort): AbortController gerencia apenas o Map de tasks ativas — ao abortar, resultado do embed é descartado silenciosamente, a tarefa completa mas não persiste. Nunca lança erro para o caller.
- **D-06:** Cleanup obrigatório: cada task criada tem um AbortController associado. Ao completar ou abortar, remover do Map. Validar no soak test (Phase 56 envelope: heap <100MB, RSS <200MB).

### Claude's Discretion
- Nome exato das funções exportadas por `embedding-queue.ts` (`enqueueEmbed`, `enqueueEmbedBatch`, ou apenas `embeddingQueue.add()`)
- Concurrency do p-queue (1 é o mais seguro para serializar; pode ser 2 se soak test mostrar CPU headroom)
- Se `saveTurn` deve separar explicitamente a parte SQLite (síncrona) da parte Chroma (queue) ou manter o método intacto e só mudar o call site para `void`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §LLM-PRIO-01, §LLM-PRIO-02 — Requisitos que esta fase entrega

### Implementação de Embedding (pontos de modificação)
- `apps/backend-ts/src/memory/embeddings.ts` — `embedText()` e `embedBatch()` — usar onnxruntime via @xenova/transformers
- `apps/backend-ts/src/memory/vectors.ts` — chama `embedText()` em `addMemory()`, `addTypedMemory()`, `queryMemoriesByType()` — pontos de substituição para `enqueueEmbed()`

### Chat Session (call sites)
- `apps/backend-ts/src/session/chat-session.ts` — `void _extractAndWriteMemories()`, `void runRollingSummarization()`, `await saveTurn()` — pontos de mudança para fire-and-forget e pause/resume

### Padrão AbortController (referência)
- `apps/backend-ts/src/session/request-file-action.ts` — padrão AbortSignal.timeout estabelecido em Phase 55
- `.planning/STATE.md` §Accumulated Context — "AbortController para cancelar operações async in-flight (padrão anti-race-condition)"

### Soak Test Envelope
- `.planning/phases/56-always-listening-soak-test/` — critério QA-01: heap <100MB, RSS <200MB

### Package já instalado
- `apps/backend-ts/package.json` — confirmar presença de `p-queue@8.4.0`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `embedText()` em `embeddings.ts` — função pura, aceita string, retorna Float32Array; candidata a receber AbortSignal se @xenova suportar
- Padrão de singleton já estabelecido: `extractorPromise` em `embeddings.ts` — modelo carregado uma vez; EmbeddingQueue segue o mesmo padrão
- `AbortController` pattern: Phase 54/55 estabeleceu o padrão; `request-file-action.ts` tem exemplo de AbortSignal.timeout

### Established Patterns
- Fire-and-forget: `void` context com try/catch interno já é padrão no codebase (`_extractAndWriteMemories`, `runRollingSummarization`)
- Singleton de recursos: `extractorPromise` (embeddings.ts), `audioContextSingleton` (Phase 53) — EmbeddingQueue segue o mesmo padrão de módulo com estado de módulo
- Map<id, AbortController> para cleanup: padrão Phase 53-54

### Integration Points
- `vectors.ts`: substituir chamadas diretas a `embedText()` por `enqueueEmbed()` em `addMemory()` e `addTypedMemory()` (calls de query não precisam do queue — são no hot path do chat)
- `chat-session.ts`: adicionar `embeddingQueue.pause()` antes do LLM call e `embeddingQueue.resume()` no finally
- `chat-session.ts`: mudar `await memory.saveTurn()` para `void memory.saveTurn()` (ou separar SQLite de Chroma)

### Observação Crítica
- Chamadas de QUERY (`queryMemoriesByType`, `queryMemories`) NÃO devem passar pelo queue de baixa prioridade — são necessárias para montar contexto do chat e estão no hot path. Apenas chamadas de WRITE (addMemory, addTypedMemory) vão para o queue.

</code_context>

<specifics>
## Specific Ideas

- STATE.md já documenta a decisão arquitetural: "p-queue com priority 1 (embed) vs 10 (chat); AbortController cleanup mandatory; monitor in soak test" — confirma todas as escolhas feitas na discussão.
- `p-queue@8.4.0` já está listado como novo package do v2.3 no STATE.md — não requer instalação adicional.

</specifics>

<deferred>
## Deferred Ideas

Nenhuma ideia fora do escopo surgiu durante a discussão.

</deferred>

---

*Phase: 61-embedding-priority-queue*
*Context gathered: 2026-05-07*
