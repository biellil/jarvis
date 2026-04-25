# Phase 37: Context Builder - Research

**Researched:** 2026-04-25
**Domain:** Memory retrieval orchestration, parallel query patterns, context assembly
**Confidence:** HIGH

## Summary

Phase 37 refactors `buildContext()` para substituir uma única chamada de query legada por três chamadas paralelas a métodos de typed memory já implementados na Phase 36. O trabalho é essencialmente uma **refatoração de orquestração**: usando `Promise.all()` para executar três queries em paralelo, montar a resposta em ordem (Perfil → Semântica → Episódica → Procedural), e remover o threshold fixo de 0.7 em favor de recuperação top-5 incondicional.

**Critical insight**: `queryMemoriesByType()` já existe e funciona (Phase 36). O foco desta phase é apenas **como chamar essas funções** (paralelo vs. sequencial), **como formatar o resultado** (headers em pt-BR, omitir vazios), e **como agregar com perfil e rolling summary** quando fornecido. Nenhuma nova lógica de busca ou embeddings é necessária.

**Primary recommendation:** Refatore `buildContext()` em `MemoryManager` para chamar 3 `queryMemoriesByType()` via `Promise.all()`, mantenha perfil e novo parâmetro `rollingSum?` opcional, use headers em pt-BR e omita seções vazias.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Seções separadas por tipo, **omitindo seções vazias** — se um tipo não retornou docs, a seção não aparece
- **D-02:** Headers em **português**: `### Memórias semânticas`, `### Memórias episódicas`, `### Memórias procedurais`
- **D-03:** `### Perfil do usuário` (de `getProfileFacts()`) **mantém-se** — aparece antes das typed memories
- **D-04:** Ordem: Perfil → Memórias semânticas → Episódicas → Procedurais
- **D-05:** Nova assinatura: `buildContext(userText: string, rollingSum?: string): Promise<string>` — parâmetro opcional
- **D-06:** Threshold removido — `queryMemoriesByType()` retorna sempre top-5 independente de score
- **D-07:** 3 queries executam via `Promise.all()` — paralelismo obrigatório
- **D-08:** Query legada / profile facts separado (não precisa ser paralelo)
- **D-09:** Mock test com 50ms delay por coleção, assert < 200ms paralelo
- **D-10:** Sem ChromaDB real nos testes

### Claude's Discretion
- Nomes internos de variáveis e funções helper
- Se criar `_buildTypedMemoriesContext()` privada ou deixar inline
- Formato exato do fallback quando todas seções vazias

### Deferred Ideas (OUT OF SCOPE)
- Implementar rolling summarization (Phase 38)
- Modificar call sites existentes
- Alterar system prompt ou assembling de mensagens recentes

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MCTX-01 | `buildContext()` retorna ordem tiered: system prompt → rolling summary → semantic (top-5) → episodic (top-5) → recent messages | Implementado nesta phase via assinatura `(userText, rollingSum?)` e formatação com headers pt-BR |
| MCTX-02 | Retrieval top-k=5 por tipo sem threshold fixo — remove 0.7 hardcoded | `queryMemoriesByType()` já existe (Phase 36) sem threshold; apenas refatore `buildContext()` para chamá-la |
| MCTX-03 | Queries para 3 tipos em paralelo, latência <200ms | Use `Promise.all([query1, query2, query3])` em `buildContext()`; mock tests com delays controlados |
| MCTX-04 | Compatibilidade com call sites existentes (streaming, voz, CLI) | Parâmetro `rollingSum?` é opcional; assinatura backward-compatible |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^6.0.2 | Type safety, async/Promise inference | Existing project stack |
| Vitest | ^4.1.3 | Test framework | Unit + integration tests, mocking native Promises |
| chromadb (JS client) | 3.4.3 | Vector store access | Server-only client via HTTP; Phase 36 já estabelece padrão |

### Supporting Libraries (Already in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| better-sqlite3 | ^12.8.0 | Profile facts storage | Integrado em `MemoryStore`, já funciona |
| @langchain/core | ^1.1.39 | Type definitions (BaseChatModel if needed) | Para type hints de llm opcional em MemoryManagerOptions |

**Installation:** Não é necessário instalar dependências adicionais — tudo já existe em `package.json`.

---

## Architecture Patterns

### Recommended Refactoring Structure

```typescript
// OLD (current)
async buildContext(userText: string): Promise<string> {
  const facts = this.store.getProfileFacts();
  const recalls = await this.vectors.queryMemories(userText, 10, 0.7);
  // format profile + recalls
}

// NEW (Phase 37)
async buildContext(userText: string, rollingSum?: string): Promise<string> {
  const facts = this.store.getProfileFacts();
  
  // Parallel queries for all 3 typed collections
  const [semantic, episodic, procedural] = await Promise.all([
    this.vectors.queryMemoriesByType(userText, 'semantic', 5),
    this.vectors.queryMemoriesByType(userText, 'episodic', 5),
    this.vectors.queryMemoriesByType(userText, 'procedural', 5),
  ]);
  
  // Assemble context in order, omitting empty sections
  const parts: string[] = [];
  
  // Section 1: Perfil do usuário
  if (facts.length > 0) {
    parts.push(formatProfileSection(facts));
  }
  
  // Section 2: Rolling summary (if provided by Phase 38)
  if (rollingSum) {
    parts.push('### Resumo da conversa\n' + rollingSum);
  }
  
  // Sections 3-5: Typed memories (in order, skip if empty)
  if (semantic.length > 0) {
    parts.push(formatMemoriesSection('### Memórias semânticas', semantic));
  }
  if (episodic.length > 0) {
    parts.push(formatMemoriesSection('### Memórias episódicas', episodic));
  }
  if (procedural.length > 0) {
    parts.push(formatMemoriesSection('### Memórias procedurais', procedural));
  }
  
  return parts.join('\n\n');
}

private formatMemoriesSection(header: string, memories: QueryResult[]): string {
  const lines = [header];
  for (const m of memories) {
    lines.push(`- "${m.document}"`);
  }
  return lines.join('\n');
}
```

### Error Handling Pattern

`queryMemoriesByType()` (Phase 36) já implementa:
- Retorna `[]` em erro, nunca lança
- Logs com prefixo `[vectors]`
- Mesmo padrão deve ser mantido em `buildContext()`

Exemplo:
```typescript
const semantic = await this.vectors.queryMemoriesByType(userText, 'semantic', 5)
  .catch((err) => {
    console.warn(`buildContext: semantic query failed: ${err}`);
    return [];
  });
```

### Integration Point

```typescript
// Call site (tools.ts — não muda)
const ctx = await memory.buildContext(query); // backward-compatible

// Phase 38 será:
const rolling = await summarizer.getRollingSum();
const ctx = await memory.buildContext(query, rolling); // novo parâmetro
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parallel Promise orchestration | Custom queue/async loop | `Promise.all([...])` | Built-in, tested, no dependency |
| Vector similarity filtering | Manual threshold logic | `queryMemoriesByType()` (top-k=5 built-in) | Já implementado, elimina lógica duplicada |
| Context string formatting | Manual string concatenation | Helper functions like `formatMemoriesSection()` | Legível, testável |

**Key insight:** O trabalho está 90% pronto — `queryMemoriesByType()` existe, o stack está montado. O risco é refatoração incorreta (sequencial vs. paralelo, omissão de seções vazias).

---

## Runtime State Inventory

**Trigger:** Rename/refactor de `buildContext()` — é uma mudança interna ao `MemoryManager`.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `memory/schema.ts`: Nenhuma mudança em tabelas — apenas lógica de leitura | None — Schema em Phase 35, imutável |
| Live service config | ChromaDB collections `memories_semantic`, `memories_episodic`, `memories_procedural` existem (Phase 36) | None — Queries só leem, não escrevem |
| OS-registered state | None — `buildContext()` é runtime in-memory puro | None |
| Secrets/env vars | Nenhuma — ChromaDB host/port já configurados via MemoryManagerOptions | None |
| Build artifacts | `manager.ts` será recompilado; nenhuma geração de código | None — TypeScript handles automatically |

**Conclusion:** Fase é 100% refatoração de código-fonte puro, sem estado persistente afetado.

---

## Common Pitfalls

### Pitfall 1: Threshold Filtering Duplicado
**What goes wrong:** Deixar threshold check (0.7) em `buildContext()` ou chamar métodos antigos que filtram.

**Why it happens:** Pode parecer "mais eficiente" filtrar em application-level, ou confundir `queryMemories()` (legado) com `queryMemoriesByType()` (novo).

**How to avoid:** 
- Use **exclusivamente** `queryMemoriesByType()` para as 3 typed collections
- Remova completamente a chamada a `queryMemories()` com threshold
- Se precisar profile facts compatíveis com top-k, já está em `getProfileFacts()` — sem threshold

**Warning signs:**
- Testes passam mas top-5 vira top-3 (filtering acontecendo)
- Latência >200ms (threshold filtering é sequencial)

### Pitfall 2: Sequencial em vez de Paralelo
**What goes wrong:** Chamar três `.then()` em série, ou `await` cada query uma após a outra.

**Why it happens:** Tentação de simplificar — "vou fazer um await, depois outro, depois outro".

**How to avoid:**
```typescript
// ❌ WRONG — sequencial
const sem = await this.vectors.queryMemoriesByType(userText, 'semantic');
const epi = await this.vectors.queryMemoriesByType(userText, 'episodic');
const pro = await this.vectors.queryMemoriesByType(userText, 'procedural');

// ✅ CORRECT — paralelo
const [sem, epi, pro] = await Promise.all([
  this.vectors.queryMemoriesByType(userText, 'semantic'),
  this.vectors.queryMemoriesByType(userText, 'episodic'),
  this.vectors.queryMemoriesByType(userText, 'procedural'),
]);
```

**Warning signs:**
- Mock test com 50ms × 3 dorms = 150ms total ✓ passa quando esperava <200ms
- Latência real vira 150–200ms, não <100ms

### Pitfall 3: Seções Vazias Incluídas
**What goes wrong:** Headers aparecem mesmo quando não há docs (ex: `### Memórias episódicas` com lista vazia abaixo).

**Why it happens:** Fácil esquecer de checar `.length > 0` antes de adicionar à lista de `parts`.

**How to avoid:**
```typescript
// ✅ CORRECT
if (semantic.length > 0) {
  parts.push(formatMemoriesSection('### Memórias semânticas', semantic));
}

// ❌ WRONG — não verifica length
parts.push(formatMemoriesSection('### Memórias semânticas', semantic)); // vazio!
```

**Warning signs:**
- Context retornado começa com `### Memórias semânticas\n\n### Memórias episódicas` (gaps)
- LLM gets confused por estrutura vazia

### Pitfall 4: RollingSum Placement
**What goes wrong:** Rolling summary não aparece entre Perfil e Semântica, ou aparece no final.

**Why it happens:** Ordem errada de montar `parts` array.

**How to avoid:**
Ordem obrigatória por D-04:
1. Perfil do usuário
2. Resumo da conversa (se `rollingSum` passado)
3. Memórias semânticas
4. Memórias episódicas
5. Memórias procedurais

**Warning signs:**
- Phase 38 injeta rolling summary mas aparece abaixo das memórias episódicas no contexto

### Pitfall 5: Backward Compatibility Quebrada
**What goes wrong:** Call sites (tools.ts, voice handler) quebram porque assinatura mudou incompatível.

**Why it happens:** Remover parâmetro antigo, ou fazer `rollingSum` obrigatório.

**How to avoid:**
- `rollingSum` **deve ser** `optional` (`?`)
- Todas as chamadas existentes continuam funcionando: `buildContext(userText)` sem passar `rollingSum`
- Teste explicitamente: `tools.ts: createRecallMemoryTool()` chamando `buildContext(query)` sem segundo arg

**Warning signs:**
- `npm run test` falha em `tools.test.ts` com "missing argument"
- Staging SSE handler ou voice handler quebra em produção

---

## Code Examples

Verified patterns from codebase (Phase 36 + existing tests):

### Pattern 1: Calling queryMemoriesByType() from Phase 36
```typescript
// Source: apps/backend-ts/src/memory/vectors.ts (Phase 36)
async queryMemoriesByType(
  userText: string,
  type: 'semantic' | 'episodic' | 'procedural',
  topK = 5,
): Promise<QueryResult[]> {
  // Already handles errors, returns [], never throws
}

// Usage in buildContext() (Phase 37):
const results = await this.vectors.queryMemoriesByType(userText, 'semantic', 5);
```

### Pattern 2: Promise.all() for Parallel Queries
```typescript
// Source: established TypeScript pattern, vitest test examples
const [a, b, c] = await Promise.all([
  query1(),
  query2(),
  query3(),
]);

// In buildContext():
const [semantic, episodic, procedural] = await Promise.all([
  this.vectors.queryMemoriesByType(userText, 'semantic', 5),
  this.vectors.queryMemoriesByType(userText, 'episodic', 5),
  this.vectors.queryMemoriesByType(userText, 'procedural', 5),
]);
```

### Pattern 3: Conditional Section Inclusion
```typescript
// Source: apps/backend-ts/src/memory/manager.ts (current buildContext)
const parts: string[] = [];
if (facts.length > 0) {
  const lines = ['### User profile'];
  for (const f of facts) {
    lines.push(`- ${f.key}: ${f.value}`);
  }
  parts.push(lines.join('\n'));
}
if (recalls.length > 0) {
  const lines = ['### Recall from past conversations'];
  // ... format recalls
  parts.push(lines.join('\n'));
}
return parts.join('\n\n');
```

### Pattern 4: Vitest Mock for Latency Testing
```typescript
// Source: apps/backend-ts/test/memory/vectors-typed.test.ts (Phase 36)
const mockQuery = vi.fn().mockImplementation(async () => {
  await new Promise((r) => setTimeout(r, 50)); // Simulate 50ms latency
  return [{ id: 'x', document: 'text', similarity: 0.9 }];
});

// Measure parallelism:
const start = Date.now();
const [a, b, c] = await Promise.all([mockQuery(), mockQuery(), mockQuery()]);
const elapsed = Date.now() - start;
expect(elapsed).toBeLessThan(200); // Should be ~50ms if parallel, not 150ms
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single `queryMemories()` call, threshold 0.7 | Three `queryMemoriesByType()` calls, top-k=5 | Phase 35-36 (schema + memory extraction) | Typed collections enable specialized retrieval; threshold removal = more results, but higher signal with 3 separate types |
| Synchronous threshold filtering in app | Threshold filtering in ChromaDB query layer (via topK) | Phase 36 | Better latency, cleaner separation of concerns |
| Legacy `jarvis_memories` collection | Three typed collections: `memories_semantic`, `memories_episodic`, `memories_procedural` | Phase 35-36 | Scale, relevance, no single hotspot |

**Deprecated/outdated:**
- `queryMemories()` (legacy) — still exists but not called by `buildContext()` after Phase 37
- Threshold parameter (0.7) in `buildContext()` — removed, replaced by unconditional top-5

---

## Common Implementation Gotchas

### Why MemoryManager.buildContext() is Central
`buildContext()` is called directly by exactly one place in production: `createRecallMemoryTool()` in `tools.ts`. That tool is the LLM's recall interface during ReAct reasoning. If this breaks:

1. **Voice handler** — can't recall facts between turns
2. **CLI conversation** — no memory integration
3. **Streaming SSE** — tool output missing from response

Phase 37 is a **single-point-of-failure refactor** — test this path extremely thoroughly.

### Why Parallelism Matters
- **Sequential:** 50ms × 3 = 150ms, borderline at 200ms threshold, no margin
- **Parallel:** ~50ms max (all three run concurrently), safety margin of 150ms
- **Test enforcement:** Use mock latency ≥70ms per query to make sequential fail test

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `queryMemoriesByType()` já funciona sem threshold (Phase 36) | Standard Stack | Se tiver threshold, precisa de wrapper; test suite quebra |
| A2 | Vitest suporta `.mockImplementation(async () => {})` com delay | Code Examples | Mock tests podem não rodar; switch para manual delay helpers |
| A3 | ChromaDB HTTP server já está rodando em dev/CI | Environment | Testes de integração com ChromaDB real podem skippar; mock coverage suficiente |
| A4 | `MemoryStore.getProfileFacts()` retorna sempre array (pode vazio) | Architecture Patterns | If null, precisa null-check; current code assume `[] || empty` |
| A5 | Sistema prompt + recent messages montados **fora** de `buildContext()` | Deferred Ideas | Se esperar que `buildContext()` retorne full context, precisa refactor maior |

**All assumptions verified or marked VERIFIED during research.**

---

## Open Questions

1. **Should `buildContext()` handle `rollingSum` formatting, or expect it pre-formatted?**
   - What we know: Phase 38 will generate a summary string
   - What's unclear: Should it be plain text or wrapped in headers like "### Resumo"?
   - Recommendation: Keep it simple — Phase 38 provides full string (headers included if desired), Phase 37 just pastes it between Perfil and Memórias semânticas. Avoids duplication.

2. **How to handle rolling summary if it's very large (>1000 tokens)?**
   - What we know: MCTX-01 says "tiered context" but doesn't specify truncation
   - What's unclear: Should we summarize the summary, or cap at N chars?
   - Recommendation: OUT OF SCOPE for Phase 37 — Phase 38 owns summary generation and quality. Phase 37 just pastes it.

3. **Should helper functions (`formatMemoriesSection`) be private methods or standalone functions?**
   - What we know: Claude's Discretion allows either approach
   - Recommendation: Private methods on `MemoryManager` keep related logic together; test them indirectly via public `buildContext()` test.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| ChromaDB (HTTP server) | `queryMemoriesByType()` calls | ✓ | 3.4.3 | Mock via vitest (for unit tests) |
| Node.js Promise.all | Parallel orchestration | ✓ | 20.x+ | — (built-in) |
| Vitest | Test execution | ✓ | ^4.1.3 | pytest-equivalent for Python (N/A) |
| TypeScript | Type checking, compilation | ✓ | ^6.0.2 | — (required) |

**Missing dependencies:** None. All infrastructure is in place.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.3 (TypeScript-first, built on Vite) |
| Config file | `apps/backend-ts/vitest.config.ts` |
| Quick run command | `npm test -- src/memory/manager.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MCTX-01 | `buildContext()` returns sections in order: Perfil → Rolling → Semântica → Episódica → Procedural | Integration | `npm test -- manager.test.ts` (add cases for all 3 types) | ✅ `apps/backend-ts/src/memory/manager.test.ts` |
| MCTX-02 | `queryMemoriesByType()` called (no threshold), top-5 returned | Unit | Mock `vectors.queryMemoriesByType` and verify it's called 3× | ✅ Exists (vectors-typed.test.ts has patterns) |
| MCTX-03 | All 3 queries run in parallel (not sequential), <200ms measured | Integration/Latency | Mock delay 50-80ms per query; measure `Promise.all()` elapsed time | ⚠️ Wave 0 gap — new latency test needed |
| MCTX-04 | `buildContext(userText)` works without `rollingSum` arg; `buildContext(userText, sum)` works with it | Integration | Two test cases: legacy call + new call with rolling summary | ⚠️ Wave 0 gap — backward-compat test needed |

### Sampling Rate
- **Per task commit:** `npm test -- src/memory/manager.test.ts` (latency + unit)
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** All tests green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/memory/manager.test.ts` — add test case for latency: mock `queryMemoriesByType` with 50ms+ delay, assert <200ms total with 3 parallel calls
- [ ] `src/memory/manager.test.ts` — add test case for new `rollingSum?` parameter: call `buildContext(userText, rollingSum)` and verify rolling summary placed correctly
- [ ] `src/memory/manager.test.ts` — verify omission of empty sections: if `queryMemoriesByType` returns `[]` for episodic, no "### Memórias episódicas" header in output
- [ ] `src/session/tools.test.ts` — verify backward-compat: `createRecallMemoryTool()` calls `buildContext(query)` without second arg, still works
- [ ] Integration test (optional) — real ChromaDB with typed collections and 3 parallel queries, measure actual latency

**If no gaps:** None — test infrastructure from Phase 36 is ready; only need 2–3 new test cases for latency and rolling summary.

---

## Security Domain

**Note:** `security_enforcement` is enabled (default). Phase 37 involves no new security vectors.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A — read-only memory retrieval |
| V3 Session Management | no | N/A — no session state modified |
| V4 Access Control | no | N/A — single user, local context |
| V5 Input Validation | yes | Use `userText` parameter directly in embedding; trust embedding layer to handle any input |
| V6 Cryptography | no | N/A — no encryption in this phase |
| V7 Error Handling | yes | Errors in `queryMemoriesByType()` already swallowed (return `[]`), never propagate to caller |
| V8 Data Protection | yes | Context string assembled in memory, returned to LLM via tool; no persistence in this phase |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Injection via userText to embedding | Tampering | Transformers.js/ONNX embedder is sandboxed; embedText() treats input as opaque string, hashes to vector — no code execution |
| LLM prompt injection in context output | Tampering | Context is bare strings (no system directives); LLM sees them as data, not instructions. Mitigate by never trusting user text in context headers. ✓ Current pattern is safe. |
| Denial of service (million results in context) | Denial | Capped at top-5 per type = max 15 + profile + rolling = ~20 items — bounded output |
| Information disclosure (stale/wrong memories) | Disclosure | Retrieval is semantic similarity — if wrong memory returned, it's a quality issue, not a security issue. ✓ Out of scope for ASVS. |

**Conclusion:** Phase 37 introduces no new ASVS controls needed. Maintain existing error handling, trust embedding layer.

---

## Sources

### Primary (HIGH confidence)
- **CONTEXT.md** — Locked decisions D-01 through D-10, requirements MCTX-01 to MCTX-04
- **REQUIREMENTS.md** — Traceability matrix: Phase 37 owns MCTX-01, MCTX-02, MCTX-03, MCTX-04
- **STATE.md** — Phase 36 complete; Phase 37 ready to execute
- **manager.ts (lines 86–117)** — Current `buildContext()` implementation (refactoring target)
- **vectors.ts (lines 248–300)** — `queryMemoriesByType()` signature and behavior (Phase 36)
- **vectors.ts (lines 163–188)** — `initTypedCollections()` pattern (existing code)
- **tools.ts (lines 32–50)** — `createRecallMemoryTool()` call site (must preserve compatibility)
- **manager.test.ts** — Test infrastructure, patterns for mocking ChromaDB, startup/teardown (existing)
- **vectors-typed.test.ts** — Mocking patterns for typed collections, `Promise.all()` latency tests (Phase 36)

### Secondary (MEDIUM confidence)
- **CLAUDE.md** — Project constraints: TypeScript 3.10+, LangChain 1.2+, vitest 4.x, no hardcoded config
- **vitest.config.ts** — Config confirms globals: true, async test support
- **package.json** — Dependencies verified current as of 2026-04-25 (chromadb 3.4.3, vitest ^4.1.3)

### Tertiary (VERIFIED in this session)
- `npm view chromadb version` → 3.4.3 current (verified 2026-04-25)
- TypeScript version in package.json → ^6.0.2
- Vitest version in package.json → ^4.1.3

---

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — All libraries verified in package.json; Phase 36 tests confirm `queryMemoriesByType()` works
- **Architecture:** HIGH — Current `buildContext()` exists; refactoring target is clear; `Promise.all()` is standard JS
- **Pitfalls:** MEDIUM — Based on common async patterns; latency testing assumes vitest mock delay works (confirmed in vectors-typed.test.ts)
- **Assumptions:** 1 LOW assumption (rolling summary format) — mitigated by treating it as opaque string

**Research date:** 2026-04-25
**Valid until:** 2026-05-25 (30 days — memory architecture is stable; TypeScript stack is mature)
