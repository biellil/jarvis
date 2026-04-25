# Phase 38: Rolling Summarization - Context

**Gathered:** 2026-04-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementar rolling summarization no `MemoryManager`: quando uma conversa acumula 20 mensagens, as 10 mais antigas são deletadas do SQLite e substituídas por 1 entry na tabela `summaries`. O rolling summary é cacheado no `MemoryManager` e injetado no `buildContext()` entre o system prompt e as typed memories — usando a interface `rollingSum?` já preparada na Phase 37.

**O que NÃO é esta fase:** alterar o schema do SQLite (tabela `summaries` já existe), mudar a assinatura de `buildContext()`, modificar call sites existentes como `tools.ts`.

</domain>

<decisions>
## Implementation Decisions

### Trigger de Sumarização

- **D-01:** Trigger = **fire-and-forget após cada turn**. Dentro de `ChatSession.send()` e `sendStream()`, após `await this.memory.saveTurn(...)`, chamar `void this.memory.runRollingSummarization(this._convId)` (igual ao padrão `_extractAndWriteMemories` de Phase 36). Zero impacto no pipeline de voz.
- **D-01b:** O método verifica se a contagem de mensagens atingiu o threshold ANTES de chamar o LLM — se não atingiu, retorna imediatamente sem custo.

### O que "Sumarizar" faz no SQLite

- **D-02:** Sumarização = **DELETE** das 10 rows mais antigas em `messages` WHERE conversationId = convId + **INSERT** 1 row na tabela `summaries` (já existe com campos: id, conversationId, content, createdAt). Raw messages são removidos permanentemente.
- **D-03:** O texto do sumário é gerado por **`MemoryManager` usando `this.llm`** (disponível desde Phase 36). Nenhuma classe separada necessária — método privado `_generateRollingSummary()` ou lógica inline no método principal.

### Como buildContext() Acessa o Summary

- **D-04:** `MemoryManager` guarda **`private _latestSummary: string | null = null`**. Após cada sumarização bem-sucedida, o campo é atualizado com o texto gerado. `buildContext()` usa `rollingSum ?? this._latestSummary ?? undefined` — call sites existentes (tools.ts) não precisam de nenhuma alteração.
- **D-04b:** Na inicialização, `MemoryManager` pode opcionalmente buscar o summary mais recente do SQLite para popular `_latestSummary` (para sobreviver a restarts). Claude's discretion se implementar no startup.

### Threshold de Mensagens

- **D-05:** Threshold = **20 mensagens** contadas via `COUNT(*) FROM messages WHERE conversationId = convId AND role IN ('user', 'assistant')`. Contagem por sessão corrente (convId atual), não acumulada cross-session.
- **D-06:** A cada trigger, sumarizar as **10 msgs mais antigas** (ORDER BY id ASC LIMIT 10). Após sumarização, o ciclo pode repetir se ainda houver >= 20 msgs remanescentes — mas isso só acontece em conversas muito longas.

### Claude's Discretion

- Nome exato do método público no MemoryManager (ex: `runRollingSummarization`, `checkAndSummarize`, etc.)
- Se popular `_latestSummary` no startup buscando do SQLite (D-04b)
- Prompt exato para o LLM ao gerar o sumário
- Se encapsular em `try/catch` silencioso (MEM-05) ou propagar erros — recomendado: mesmo padrão silencioso dos outros métodos

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos desta fase
- `.planning/REQUIREMENTS.md` — MSUM-01, MSUM-02, MSUM-03 (definição exata do comportamento)

### Código a modificar
- `apps/backend-ts/src/memory/manager.ts` — MemoryManager (adicionar método de sumarização + `_latestSummary`) — ALVO PRINCIPAL
- `apps/backend-ts/src/session/chat-session.ts` — `send()` e `sendStream()` (adicionar void call ao trigger)
- `apps/backend-ts/src/memory/store.ts` — pode precisar de `getOldestMessages(convId, limit)` e `deleteMessages(ids)` e `countMessages(convId)` — verificar se já existem antes de adicionar

### Código existente relevante (leitura obrigatória)
- `apps/backend-ts/src/memory/schema.ts` — tabela `summaries` (já existe, linhas 39-52), tabela `messages` (linhas 23-37)
- `apps/backend-ts/src/memory/extractor.ts` — padrão fire-and-forget de Phase 36 para replicar
- `apps/backend-ts/src/memory/manager.ts` — `_extractAndWriteMemories()` (linhas ~180+) — padrão de fire-and-forget void call a replicar
- `apps/backend-ts/src/session/chat-session.ts` — `send()` e `sendStream()` (onde void call será adicionado)

### Interface preparada na Phase 37
- `apps/backend-ts/src/memory/manager.ts` — `buildContext(userText, rollingSum?)` — interface já pronta, D-04 define como populá-la

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MemoryStore.saveSummary(convId, content)` — já existe, pronto para uso
- `MemoryManager._extractAndWriteMemories()` — template de fire-and-forget void async method com try/catch silencioso
- `MemoryManager.llm` — referência ao LLM disponível desde Phase 36 (para chamar para gerar sumário)
- `buildContext(userText, rollingSum?: string)` — interface preparada em Phase 37, D-05 define rollingSum como `this._latestSummary`

### Established Patterns
- Fire-and-forget: `void this.method()` na call site, método async com `try/catch` interno que só loga erros (MEM-05)
- MemoryStore errors: sempre `try/catch` com `console.warn` — nunca throw
- Testes: vitest com mock de MemoryStore para testes unitários (sem SQLite real)

### Integration Points
- `ChatSession.send()` e `sendStream()` — adicionar `void this.memory.runRollingSummarization(this._convId)` após o `saveTurn()` existente
- `MemoryManager.buildContext()` — usar `rollingSum ?? this._latestSummary` no lugar de `rollingSum` apenas

</code_context>

<specifics>
## Specific Ideas

- O padrão de fire-and-forget já estabelecido na Phase 36 (`_extractAndWriteMemories`) é o template exato para implementar o trigger — mesmo lugar no `send()`/`sendStream()`, mesmo estilo de void call
- O campo `_latestSummary` é análogo ao padrão de cache da classe — valor carregado/atualizado pelo background, consumido pelo buildContext sem custo extra de query

</specifics>

<deferred>
## Deferred Ideas

Nenhuma ideia fora do escopo surgiu durante a discussão.

</deferred>

---

*Phase: 38-rolling-summarization*
*Context gathered: 2026-04-25*
