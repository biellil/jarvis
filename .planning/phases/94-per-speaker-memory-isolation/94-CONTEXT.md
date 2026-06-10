# Phase 94: Per-Speaker Memory Isolation - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Threadar `speaker_id` ponta a ponta — do header `x-jarvis-speaker` (já emitido pelo desktop-py, Phase 89) através do gateway → backend-ts → escritas de memória (`messages`, `typed_memories` e metadata do ChromaDB) — e usá-lo como chave de filtro no `HybridRetriever` (Phase 93) para que o contexto **automático** de uma pessoa nunca contenha memórias privadas de outra.

Inclui também uma capacidade de **recall cruzado explícito**: quando o usuário menciona outra pessoa nominalmente ("o que a Maria me pediu?"), a IA pode consultar as memórias daquele falante sob demanda — sem nunca cruzar dados automaticamente.

**Fora de escopo desta fase:** streaming TTS (Phase 95); métricas/performance (Phase 96); comando `/memory` de inspeção manual; purge/limpeza de memórias órfãs por tempo; voice-print re-attribution de memórias `unknown` para falantes nomeados.

</domain>

<decisions>
## Implementation Decisions

### Modelo de três estados (já resolvido no client — Phase 89)
- **D-01:** O header `x-jarvis-speaker` já implementa o modelo de confiança no lado Python. `identify_speaker()` retorna `name = <nome do perfil>` somente com confiança ≥ 0.75; retorna literal `"unknown"` tanto para baixa confiança quanto para nenhum match. **PSPK-04 está satisfeito na origem** — o backend só precisa bucketizar valor de header `"unknown"`/ausente como `unknown_speaker`. NÃO criar header de confiança separado.

### Escopo de retrieval automático (PSPK-03, PSPK-04) — Opção A (Estrito)
- **D-02:** Contexto **automático** (`buildContext()` a cada turno) é estritamente isolado: falante reconhecido vê SOMENTE as próprias memórias; falante `unknown_speaker` vê SOMENTE memórias `unknown_speaker`. Sem mistura automática em nenhuma direção. Satisfaz literalmente os critérios 1 e 2 da fase.
- **D-03:** O filtro de speaker é aplicado dentro do `HybridRetriever` em TODOS os ramos: ChromaDB (3 collections typed via metadata `where`), FTS5 (SQL `WHERE speaker_id = ?`) e recency. Nada que vaze entre buckets antes do RRF.

### Recall cruzado explícito (capacidade nova nesta fase) — A2 + B1 + C1
- **D-04:** O `retrieve()` do `HybridRetriever` passa a ser parametrizado por speaker (ex: `retrieve(queryText, { speakerId, crossSpeaker?: targetSpeakerId | 'all' })`). O `buildContext()` automático sempre chama com o speaker atual e modo estrito (D-02). O recall cruzado é um caminho **separado e deliberado**.
- **D-05:** **Quem pode cruzar (A2):** qualquer falante **reconhecido** (high-confidence). Falante `unknown_speaker` NÃO pode cruzar — fica estrito.
- **D-06:** **Como dispara (B1):** somente quando o usuário **menciona explicitamente outra pessoa** na fala ("o que o João falou sobre X?"). Sem menção = isolamento estrito. A IA resolve o nome mencionado → `speaker_id` e consulta aquele bucket. A capacidade é exposta via a ferramenta `recall_memory` existente (`tools.ts`), estendida com um parâmetro de speaker-alvo opcional.
- **D-07:** **Escopo (C1):** construir a fundação de isolamento (speaker_id em tudo + filtro parametrizado) E expor o recall cruzado **nesta fase**.
- **D-08:** **Interpretação de critério (para o verifier):** os critérios 1 e 2 ("memórias de B não aparecem no contexto de A") referem-se ao **contexto automático** (`buildContext`). O recall cruzado explícito é um caminho iniciado pelo usuário e intencional — não é contaminação e não viola os critérios. Modelo mental: assistente pessoal doméstico onde membros reconhecidos podem perguntar uns sobre os outros, mas o assistente nunca mistura por conta própria.

### Backfill de dados v3.5 (PSPK-01, PSPK-02) — Opção B (patch de metadados)
- **D-09:** Migração única e idempotente que marca dados pré-existentes como `speaker_id = "unknown"` SEM apagar nem re-gerar embeddings. SQLite: `UPDATE` das colunas novas (default/backfill `unknown`/`null`). ChromaDB: `collection.update(ids, { metadatas: { speaker_id: "unknown" } })` em batches (≤100) nas 3 collections typed — preserva os vetores existentes (passar só `ids + metadatas` NÃO re-embeda). Re-rodar é seguro (sobrescreve `"unknown"`→`"unknown"`).
- **D-10:** Após o backfill, todas as queries usam filtro simples `speaker_id == X` (evita semântica frágil de chave-ausente do ChromaDB).

### Tabelas que recebem speaker_id (PSPK-01, PSPK-02, PSPK-03)
- **D-11:** Adicionar `speaker_id` em: (a) `messages` (PSPK-01, + índice); (b) `typed_memories` (necessário para o filtro do `HybridRetriever` funcionar, já que ele opera sobre typed_memories e não sobre messages); (c) metadata dos embeddings ChromaDB das 3 collections typed (PSPK-02). Coluna nullable; linhas v3.5 backfilled conforme D-09.

### Formato do speaker_id (PSPK-04, PSPK-05) — Opção B (re-normaliza no backend)
- **D-12:** O backend re-aplica a mesma normalização do `_safe_profile_name` do Python — **trim + espaço→underscore, SEM lowercasing** (porque `_NAME_RE` no Python é case-sensitive; "Ana" e "ana" podem ser perfis distintos). Helper único em backend-ts, mantido em sincronia conceitual com o Python.
- **D-13:** `"unknown"` é valor reservado para o bucket `unknown_speaker`. Bloquear cadastro de perfil de voz com nome literal `"unknown"` (validação one-line no enrollment do desktop-py, consistente com o contrato `_safe_profile_name`).
- **D-14:** O nome (normalizado) É a chave estável de identidade. Sem UUID surrogate — isso é essencial para a recuperação por re-enrollment do PSPK-05.

### Órfãos ao deletar perfil (PSPK-05) — Opção d (comportamental/implícito)
- **D-15:** Deletar um perfil de voz **não toca nas memórias** no backend. A recuperação é automática: como `speaker_id == nome`, re-cadastrar o mesmo nome re-vincula as memórias instantaneamente no próximo request. PSPK-05 é satisfeito como requisito comportamental ("memórias sobrevivem e são recuperáveis"), sem flag stored e sem acoplamento cross-process.
- **D-16:** **Caminho de upgrade documentado:** se uma fase futura precisar *filtrar/purgar* memórias órfãs explicitamente, o caminho é um endpoint isolado `POST /memory/speaker/:id/orphan` chamado no delete (não muda o fluxo de recuperação por re-enrollment). Fora de escopo agora.

### Plumbing (mecânico — detalhes para o planner)
- **D-17:** Gateway (`apps/gateway/src/routes/chat.ts`) passa a encaminhar `x-jarvis-speaker` para o backend, seguindo o mesmo padrão do `x-jarvis-client-id` existente.
- **D-18:** Backend lê `x-jarvis-speaker` nas rotas POST `/chat` e GET `/chat/stream` (`apps/backend-ts/src/routes/chat.ts`) e propaga via `ChatSession.setSpeaker(...)` (espelhando `setClientId`). O speaker do request alimenta tanto o write path (`saveTurn`/`saveTypedMemory`/vectors) quanto o read path (`buildContext`) no MESMO request.

### Claude's Discretion
- Mecanismo exato do filtro ChromaDB (`where` clause) vs estrutura do RRF — desde que nenhum bucket vaze antes da fusão.
- Forma do parâmetro de speaker em `retrieve()` / assinatura do `recall_memory` estendido.
- Como a migração de backfill é disparada (no constructor do `MemoryStore` à la FTS5 da Phase 93, ou script dedicado) — desde que idempotente.
- Estratégia de índice SQLite para `speaker_id` (composto com createdAt, etc.).
- Como o LLM resolve "nome mencionado" → speaker_id no recall cruzado (prompt/tool description).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Memory system (backend-ts) — núcleo da fase
- `apps/backend-ts/src/memory/schema.ts` — schema Drizzle; `messages` (linhas ~23-29) e `typed_memories` (linhas ~92-104) ganham `speaker_id`
- `apps/backend-ts/src/memory/store.ts` — `saveMessages()` (~189-209), `saveTypedMemory()`; FTS5 criado no constructor (Phase 93) — filtro keyword por speaker entra aqui
- `apps/backend-ts/src/memory/manager.ts` — `buildContext()` (~149, chama `retriever.retrieve`); `saveTurn()`; `saveTypedMemory()`; attach de metadata ChromaDB (~95-101 mensagens, ~214-218 typed)
- `apps/backend-ts/src/memory/hybrid-retriever.ts` — `retrieve(queryText)` (~38) — recebe parâmetro de speaker + filtro (D-03, D-04)
- `apps/backend-ts/src/memory/vectors.ts` — `MemoryVectors.addMemory()/addTypedMemory()` — metadata + `where` filter; alvo do backfill ChromaDB (D-09)
- `apps/backend-ts/src/session/chat-session.ts` — padrão `setClientId` (~381 `saveTurn`); adicionar `setSpeaker` (D-18)
- `apps/backend-ts/src/session/tools.ts` — tool `recall_memory` (~39) — estendida para recall cruzado explícito (D-06)
- `apps/backend-ts/src/routes/chat.ts` — POST `/chat` (~47 lê `x-jarvis-client-id`), GET `/chat/stream` (~79) — ler `x-jarvis-speaker` aqui (D-18)

### Gateway
- `apps/gateway/src/routes/chat.ts` — encaminha `x-jarvis-client-id` (~15, ~72); deve encaminhar `x-jarvis-speaker` também (D-17)

### Desktop-py (origem do speaker_id)
- `apps/desktop-py/src/jarvis_desktop/speaker.py` — `identify_speaker()` retorna `name="unknown"` em baixa-confiança/sem-match (~315-320); `_safe_profile_name` (sanitização); `list_profiles()`; enrollment (bloquear nome "unknown" — D-13)
- `apps/desktop-py/src/jarvis_desktop/chat.py` — `build_request_headers()` (~119-138) envia `x-jarvis-speaker = name`; `_speaker_prefix()` (~534-551) com modelo `[Name]:`/`[Name?]:`/`[unknown]:`

### Requirements
- `.planning/REQUIREMENTS.md` §PSPK-01..PSPK-05 — requisitos da fase

### Prior context
- `.planning/phases/93-hybrid-memory-retrieval/93-CONTEXT.md` — design do `HybridRetriever`, RRF (semantic 0.6 / keyword 0.25 / recency 0.15, k=60), FTS5 sobre `typed_memories`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `HybridRetriever.retrieve()` (hybrid-retriever.ts:~38): ponto único de fusão — parametrizar com speaker aqui cobre todos os ramos de busca
- `ChatSession.setClientId()` (chat-session.ts): padrão exato a espelhar para `setSpeaker()`
- Encaminhamento de `x-jarvis-client-id` no gateway (chat.ts:~15,72): template para encaminhar `x-jarvis-speaker`
- `recall_memory` tool (tools.ts:~39): já existe — estender para recall cruzado em vez de criar tool nova
- Padrão de FTS5 idempotente no constructor do `MemoryStore` (Phase 93): template para migração de backfill idempotente
- `MemoryVectors` (vectors.ts): wrapper do ChromaDB JS — `collection.update()` suporta patch de metadata sem re-embed

### Established Patterns
- Headers `x-jarvis-*` propagados desktop-py → gateway → backend (client-id já faz isso)
- Schema via Drizzle; FTS5 via `db.exec()` `IF NOT EXISTS` no constructor
- Queries paralelas (`Promise.all`) nas 3 collections typed, fundidas por RRF
- API de `buildContext()` estável — callers não mudam (Phase 93 D-09)

### Integration Points
- `x-jarvis-speaker` (desktop-py) → gateway forward → backend route → `ChatSession.setSpeaker` → write path + read path no mesmo request
- `HybridRetriever` filtra por `speaker_id` (ChromaDB `where` + FTS5 `WHERE`)
- ChromaDB 3 collections typed: metadata ganha `speaker_id`; backfill via `collection.update`

</code_context>

<specifics>
## Specific Ideas

- **Three-state já pronto:** não reinventar confiança no backend — o header `"unknown"` é a única sinalização necessária (D-01).
- **Recall cruzado:** caminho explícito e separado do automático; o automático NUNCA cruza (D-02/D-08). Membros reconhecidos podem perguntar uns sobre os outros mencionando o nome ("o que a Maria pediu?").
- **Sem apagar dados:** backfill marca, não deleta; desconhecidos permanecem como `unknown` (D-09) — pedido explícito do usuário.
- **Nome = chave estável:** recuperação de órfãos por re-enrollment depende disso; sem UUID (D-14/D-15).

</specifics>

<deferred>
## Deferred Ideas

- **Endpoint explícito de orphan** (`POST /memory/speaker/:id/orphan`) — só se uma fase futura precisar filtrar/purgar órfãos explicitamente (D-16).
- **Purge de memórias órfãs por tempo / grace period** — fora de escopo.
- **Re-attribution de memórias `unknown` para falantes nomeados** (via voice-print/contexto) — pipeline de qualidade de memória, fase futura.
- **Comando `/memory`** de inspeção/edição manual — milestone v3.6 menciona, mas é fase própria.

</deferred>

---

*Phase: 94-per-speaker-memory-isolation*
*Context gathered: 2026-06-10*
