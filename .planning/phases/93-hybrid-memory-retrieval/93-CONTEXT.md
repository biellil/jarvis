# Phase 93: Hybrid Memory Retrieval - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Criar `HybridRetriever` que combina ChromaDB (semântico) + SQLite FTS5 (keyword) + recency signal via RRF (Reciprocal Rank Fusion), integrado transparentemente em `manager.buildContext()`. Callers de `buildContext()` não recebem nenhuma mudança de API.

Fora do escopo desta fase: per-speaker memory isolation (Phase 94), command `/memory` para inspeção manual, streaming TTS.

</domain>

<decisions>
## Implementation Decisions

### FTS5 target (HMEM-02)
- **D-01:** FTS5 virtual table indexa `typed_memories.content` — o mesmo espaço que o Chroma opera. Não indexar a tabela `messages` (histórico bruto), pois `buildContext()` já opera sobre memórias extraídas.
- **D-02:** FTS5 indexa somente a coluna `content` (não `type`). O `id` é mantido como coluna auxiliar para lookup. Virtual table: `typed_memories_fts(content, id UNINDEXED)`.
- **D-03:** Triggers criados para manter FTS sincronizado em INSERT/UPDATE/DELETE sobre `typed_memories`.

### FTS5 setup (HMEM-02)
- **D-04:** FTS5 criado no construtor de `MemoryStore` via `db.exec()` com `CREATE VIRTUAL TABLE IF NOT EXISTS`. Idempotente — sem arquivo de migração separado, sem dependência de drizzle-kit para essa table.

### RRF merge strategy (HMEM-03, HMEM-04)
- **D-05:** Pool único — todos os typed_memories (semantic + episodic + procedural) são jogados num único ranking RRF. Sem separação por tipo no retrieval.
- **D-06:** Pesos RRF documentados como default: semantic 0.6, keyword 0.25, recency 0.15.
- **D-07:** Recency como tiebreaker — não domina quando semantic+keyword concordam (HMEM-04).

### buildContext() output (HMEM-06)
- **D-08:** As 3 seções separadas (`### Memórias semânticas`, `### Memórias episódicas`, `### Memórias procedurais`) são substituídas por uma seção única `### Memórias` com os top-K resultados ranqueados por RRF.
- **D-09:** API de `buildContext(userText, rollingSum?)` não muda — nenhum parâmetro novo, nenhum tipo novo. Callers existentes (ex: `ChatSession`) não precisam de ajuste.

### NDCG benchmark (HMEM-05)
- **D-10:** 50 queries + ground truth como fixture estático (arquivo JSON) no diretório de testes. Roda como parte do suite de testes (jest/vitest).
- **D-11:** Ground truth graded: cada query tem `{ id, relevance: 0 | 1 | 2 | 3 }`. NDCG calculado com relevância graduada (0=irrelevante, 1=marginalmente relevante, 2=relevante, 3=muito relevante).
- **D-12:** Teste cria banco em memória, insere as memórias do fixture, roda retrieval hybrid vs pure-semantic, compara NDCG. Gate: hybrid NDCG ≥ baseline + 7%.

### Claude's Discretion
- Número de resultados top-K no pool unificado (pode ser 10-15 para compensar a fusão dos 3 tipos anteriores que retornavam 5 cada)
- Implementação do cálculo NDCG (pode usar lib ou implementar inline)
- Constante `k` do RRF (tipicamente 60 — padrão da literatura)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Memory system
- `apps/backend-ts/src/memory/manager.ts` — `MemoryManager.buildContext()` — método que recebe o HybridRetriever
- `apps/backend-ts/src/memory/store.ts` — `MemoryStore` — onde o FTS5 deve ser criado no constructor
- `apps/backend-ts/src/memory/schema.ts` — schema Drizzle atual — `typed_memories` table com campos `id`, `content`, `type`, `createdAt`, `extractedAt`
- `apps/backend-ts/src/memory/vectors.ts` — `MemoryVectors` — ChromaDB integration atual

### Requirements
- `.planning/REQUIREMENTS.md` §HMEM-01..HMEM-06 — requisitos da fase

### Prior context
- `.planning/phases/90-polish-stability/90-CONTEXT.md` — decisions from Phase 90 (polish)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MemoryStore` (store.ts): classe com `db` (better-sqlite3 instance) — ideal para `.exec()` no constructor
- `MemoryVectors.queryMemoriesByType()` (vectors.ts): retorna `QueryResult[]` com `document` e `id` — fonte do semantic ranking
- `buildContext()` (manager.ts:124): método atual que faz 3 queries paralelas ao Chroma — será refatorado

### Established Patterns
- Queries paralelas com `Promise.all` para as 3 collections (semantic/episodic/procedural)
- Seções condicionais no output de `buildContext()` — se vazio, omite a seção
- `MemoryManagerOptions` para configurar comportamento via construtor

### Integration Points
- `MemoryManager.buildContext()` → chamado por `ChatSession` (graph.ts) — API não muda
- `MemoryStore` constructor → onde FTS5 e triggers são criados com `IF NOT EXISTS`
- `MemoryVectors.queryMemoriesByType()` → fornece o ranked list semântico para o RRF

</code_context>

<specifics>
## Specific Ideas

- O `HybridRetriever` pode ser uma nova classe em `apps/backend-ts/src/memory/hybrid-retriever.ts` — separada de `manager.ts` para testabilidade isolada
- Recency signal: usar `createdAt` de `typed_memories` (mais estável que `extractedAt` que pode ser reprocessado)

</specifics>

<deferred>
## Deferred Ideas

Nenhuma — discussão ficou dentro do escopo da fase.

</deferred>

---

*Phase: 93-hybrid-memory-retrieval*
*Context gathered: 2026-06-10*
