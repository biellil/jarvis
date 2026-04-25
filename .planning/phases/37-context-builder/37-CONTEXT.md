# Phase 37: Context Builder - Context

**Gathered:** 2026-04-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Refatorar `buildContext()` no `MemoryManager` para recuperação tipada e paralela: substitui a chamada única a `queryMemories()` (coleção legada, threshold 0.7) por três chamadas a `queryMemoriesByType()` em paralelo (`Promise.all`), top-k=5 por tipo, sem threshold fixo. Adiciona parâmetro opcional `rollingSum?` para Phase 38 plugar o summary. Profile facts (`getProfileFacts()`) permanecem no contexto ao lado das typed memories.

**O que NÃO é esta fase:** implementar rolling summarization (Phase 38), modificar call sites existentes, alterar como o system prompt ou mensagens recentes são montados.

</domain>

<decisions>
## Implementation Decisions

### Formato do contexto retornado por buildContext()

- **D-01:** Seções separadas por tipo, **omitindo seções vazias** — se um tipo não retornou docs, a seção não aparece no string.
- **D-02:** Headers em **português**: `### Memórias semânticas`, `### Memórias episódicas`, `### Memórias procedurais`.
- **D-03:** `### Perfil do usuário` (de `getProfileFacts()`) **é mantido** — aparece antes das typed memories. Fatos de profile e typed memories são complementares e não se excluem.
- **D-04:** Ordem das seções no string retornado: Perfil do usuário → Memórias semânticas → Memórias episódicas → Memórias procedurais.

### Assinatura de buildContext()

- **D-05:** Nova assinatura: `buildContext(userText: string, rollingSum?: string): Promise<string>`. Parâmetro `rollingSum` é opcional — call sites atuais permanecem compatíveis (MCTX-04). Quando passado, o rolling summary aparece entre o perfil e as memórias semânticas.
- **D-06:** Threshold de similarity removido — `queryMemoriesByType()` sempre retorna top-5 independente de score (MCTX-02).

### Paralelismo e latência

- **D-07:** Os 3 queries para typed collections executam via `Promise.all()` — nunca sequencialmente (MCTX-03).
- **D-08:** Query para legado `queryMemories()` / profile facts pode continuar separado (não precisa ser paralelo com os typed).

### Estratégia de teste de latência

- **D-09:** Testar com mock que adiciona 50ms de delay por coleção. Assert que `Promise.all()` completa em `< 200ms`. Nota para o planner: 50ms × 3 = 150ms sequencial ainda passa 200ms — considerar aumentar para 80ms para que o teste só passe se paralelo (80ms × 3 = 240ms > 200ms, mas ~80ms paralelo < 200ms).
- **D-10:** Não usar ChromaDB real nos testes de latência — mock determinístico para CI.

### Claude's Discretion

- Nomes internos das variáveis e funções helper dentro de `buildContext()`.
- Se criar função privada `_buildTypedMemoriesContext()` ou deixar inline.
- Formato exato do fallback quando todas as seções estão vazias (pode retornar `''` como hoje).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — Requisitos MCTX-01 a MCTX-04 definem o contrato exato desta fase

### Código existente a modificar
- `apps/backend-ts/src/memory/manager.ts` — `buildContext()` atual (linhas 86-117) — ALVO DA REFATORAÇÃO
- `apps/backend-ts/src/memory/vectors.ts` — `queryMemoriesByType()` (já implementado em Phase 36) — método a usar
- `apps/backend-ts/src/memory/vectors.ts` — `queryMemories()` (legado, linhas 109+) — mantido mas não mais chamado por buildContext

### Call sites existentes (MCTX-04 — não devem ser modificados)
- `apps/backend-ts/src/session/tools.ts` — `createRecallMemoryTool()` chama `memory.buildContext(query)` — deve continuar funcionando sem alteração

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `vectors.ts: queryMemoriesByType(userText, type, topK)` — já implementado na Phase 36, pronto para uso direto
- `vectors.ts: queryMemories(queryText, nResults, threshold?)` — legado, ainda chamado por buildContext() atual — pode ser mantido para outros usos futuros
- `manager.ts: getProfileFacts()` — retorna `ProfileFact[]`, mantido como fonte complementar

### Established Patterns
- Error handling: `queryMemoriesByType()` já retorna `[]` em caso de erro e nunca lança — mesmo padrão deve ser seguido em `buildContext()`
- Prefixo `[vectors]` nos logs de warn — manter padrão nos logs de `buildContext()`
- Testes com vitest + mock de classe: padrão estabelecido nas Phases 35 e 36

### Integration Points
- `buildContext()` é chamado apenas por `tools.ts: createRecallMemoryTool()` em produção
- A assinatura `(userText: string): Promise<string>` deve ser backward-compatible — o novo `rollingSum?` é opcional e não quebra nada

</code_context>

<specifics>
## Specific Ideas

- Headers em português foram escolhidos para consistência com o system prompt do JARVIS que já é em pt-BR
- O parâmetro `rollingSum?` é a interface exata que Phase 38 vai usar — o planner deve documentar isso no PLAN como contrato entre fases
- Teste de latência: considerar usar `vi.setSystemTime()` ou delay manual com `setTimeout` dentro do mock para controlar tempo de forma determinística

</specifics>

<deferred>
## Deferred Ideas

Nenhuma ideia de escopo adicional surgiu durante a discussão — foco mantido na refatoração de buildContext().

</deferred>

---

*Phase: 37-context-builder*
*Context gathered: 2026-04-25*
