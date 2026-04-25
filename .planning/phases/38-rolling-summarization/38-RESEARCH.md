# Phase 38: Rolling Summarization - Research

**Researched:** 2026-04-25
**Domain:** Memory compression and context assembly (TypeScript/LangChain)
**Confidence:** HIGH

## Summary

Phase 38 implements rolling summarization in `MemoryManager` to prevent unbounded conversation growth. When a session accumulates 20 messages, the 10 oldest are deleted and replaced with a single compressed summary. The rolling summary is cached in `MemoryManager._latestSummary` and injected into `buildContext()` between the system prompt and typed memories — using the `rollingSum?` interface already prepared in Phase 37.

Implementation is **fire-and-forget** like Phase 36's memory extraction: trigger runs after each turn in `ChatSession.send()` and `sendStream()` via `void this.memory.runRollingSummarization(convId)`, never blocking the voice pipeline. The method checks message count before calling the LLM — if threshold not met, returns immediately with zero cost.

**Primary recommendation:** Follow the established fire-and-forget pattern from Phase 36 (`_extractAndWriteMemories`). Implement `runRollingSummarization()` as a private async method that (1) counts messages, (2) if >= 20: fetches oldest 10, generates summary via LLM, deletes old messages, saves summary, updates `_latestSummary` cache. All errors caught and logged (MEM-05 parity).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Trigger = **fire-and-forget após cada turn**. Dentro de `ChatSession.send()` e `sendStream()`, após `await this.memory.saveTurn(...)`, chamar `void this.memory.runRollingSummarization(this._convId)` (igual ao padrão `_extractAndWriteMemories` de Phase 36). Zero impacto no pipeline de voz.

**D-01b:** O método verifica se a contagem de mensagens atingiu o threshold ANTES de chamar o LLM — se não atingiu, retorna imediatamente sem custo.

**D-02:** Sumarização = **DELETE** das 10 rows mais antigas em `messages` WHERE conversationId = convId + **INSERT** 1 row na tabela `summaries` (já existe com campos: id, conversationId, content, createdAt). Raw messages são removidos permanentemente.

**D-03:** O texto do sumário é gerado por **`MemoryManager` usando `this.llm`** (disponível desde Phase 36). Nenhuma classe separada necessária — método privado `_generateRollingSummary()` ou lógica inline no método principal.

**D-04:** `MemoryManager` guarda **`private _latestSummary: string | null = null`**. Após cada sumarização bem-sucedida, o campo é atualizado com o texto gerado. `buildContext()` usa `rollingSum ?? this._latestSummary ?? undefined` — call sites existentes (tools.ts) não precisam de nenhuma alteração.

**D-05:** Threshold = **20 mensagens** contadas via `COUNT(*) FROM messages WHERE conversationId = convId AND role IN ('user', 'assistant')`. Contagem por sessão corrente (convId atual), não acumulada cross-session.

**D-06:** A cada trigger, sumarizar as **10 msgs mais antigas** (ORDER BY id ASC LIMIT 10). Após sumarização, o ciclo pode repetir se ainda houver >= 20 msgs remanescentes — mas isso só acontece em conversas muito longas.

### Claude's Discretion

- Nome exato do método público no MemoryManager (ex: `runRollingSummarization`, `checkAndSummarize`, etc.)
- Se popular `_latestSummary` no startup buscando do SQLite (D-04b)
- Prompt exato para o LLM ao gerar o sumário
- Se encapsular em `try/catch` silencioso (MEM-05) ou propagar erros — recomendado: mesmo padrão silencioso dos outros métodos

### Deferred Ideas

Nenhuma ideia fora do escopo surgiu durante a discussão.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MSUM-01 | A cada 20 mensagens, sumariza as 10 mais antigas e substitui por entry de summary no SQLite | MemoryStore.saveSummary() já existe; database schema `summaries` table pronto com id, conversationId, content, createdAt |
| MSUM-02 | Trigger de sumarização ocorre apenas no fim de sessão ou em background — nunca inline durante conversa de voz | Fire-and-forget pattern via `void this.memory.runRollingSummarization()` replicando Phase 36's `_extractAndWriteMemories` |
| MSUM-03 | Rolling summary injetado no `buildContext()` na camada correta (entre system prompt e memórias typed) | Interface `buildContext(userText, rollingSum?)` já preparada em Phase 37; D-04 implementa via `rollingSum ?? this._latestSummary` |
</phase_requirements>

## Standard Stack

### Core Runtime
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.x+ | Language/compiler | Backend is TypeScript; matches existing stack |
| @langchain/core | 0.3.x | LLM abstraction, message types | Already used for chat models and structured output |
| better-sqlite3 | 10.x+ | SQLite bindings (sync API) | Used by MemoryStore throughout; supports transactions |

### Supporting Libraries (Already in Stack)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| drizzle-orm | latest | Query builder, ORM layer | All MemoryStore queries via drizzle; no raw SQL |
| zod | 3.x | Data validation | Already used for extraction schema in extractor.ts |

**Installation:** No new packages required — all dependencies already in monorepo stack.

**Version verification:** Check `package.json` in `/root/jarvis/apps/backend-ts` — TypeScript, @langchain/core, better-sqlite3, drizzle-orm already pinned. [VERIFIED: grep from existing code]

## Architecture Patterns

### Recommended Integration Points

```
ChatSession.send() / sendStream()
    ↓
after memory.saveTurn()
    ↓
void this.memory.runRollingSummarization(this._convId)  ← fire-and-forget trigger
    ↓
MemoryManager._runRollingSummarization(convId: number)  ← private async method
    ├─ Step 1: Count messages WHERE conversationId = convId
    ├─ Step 2: If count < 20: return immediately (zero cost)
    ├─ Step 3: If count >= 20: fetch 10 oldest messages
    ├─ Step 4: Generate summary via LLM
    ├─ Step 5: Delete 10 old messages from SQLite
    ├─ Step 6: Insert summary into summaries table
    ├─ Step 7: Update this._latestSummary = summary text
    └─ Errors: try/catch, console.warn, continue silently

buildContext(userText, rollingSum?)
    ↓
Uses rollingSum ?? this._latestSummary ?? undefined
    ↓
Injected between "Perfil do usuário" and "Memórias semânticas"
```

### Pattern 1: Fire-and-Forget Async Method (Replicate Phase 36)

**What:** Background operation triggered after critical path, never awaited, errors logged only.

**When to use:** Memory operations, extraction, summarization — anything that must not block voice response.

**Example:**

```typescript
// Call site in ChatSession.send()
if (this._convId !== null) {
  try {
    await this.memory.saveTurn(this._convId, text, finalText);
  } catch (exc) {
    console.warn(`ChatSession.send: saveTurn falhou: ${(exc as Error).message}`);
  }
}

// Phase 36 pattern — VOID context, never awaited
void this._extractAndWriteMemories(text, finalText);

// Phase 38 NEW — same pattern for rolling summarization
void this.memory.runRollingSummarization(this._convId);
```

```typescript
// Inside MemoryManager
private async _runRollingSummarization(convId: number | null): Promise<void> {
  if (convId === null) return;
  
  try {
    // Step 1: Count
    const count = this.store.countMessages(convId);
    if (count < 20) return; // Cheap check before LLM
    
    // Step 2: Fetch oldest 10
    const oldest = this.store.getOldestMessages(convId, 10);
    if (oldest.length === 0) return;
    
    // Step 3: Generate summary via LLM
    const summary = await this._generateRollingSummary(oldest);
    
    // Step 4: Delete old messages
    const ids = oldest.map(m => m.id);
    this.store.deleteMessages(ids);
    
    // Step 5: Save summary
    this.store.saveSummary(convId, summary);
    
    // Step 6: Update cache
    this._latestSummary = summary;
  } catch (err) {
    console.warn(`MemoryManager._runRollingSummarization failed: ${(err as Error).message}`);
  }
}
```

Source: [Phase 36 pattern in ChatSession.send()](file:///root/jarvis/apps/backend-ts/src/session/chat-session.ts#L163-L165)

### Pattern 2: LLM Summarization Prompt

**What:** Generate a compressed summary of oldest messages in context.

**Example:**

```typescript
private async _generateRollingSummary(messages: MessageInput[]): Promise<string> {
  if (!this.llm) return ''; // Safety fallback
  
  // Format messages into a readable summary prompt
  const conversation = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');
  
  const prompt = `Summarize the following conversation into 2-3 bullet points covering key facts, decisions, and context. Keep it concise and actionable:

${conversation}

Summary:`;

  try {
    const result = await this.llm.invoke(prompt);
    return result.content?.toString() ?? '';
  } catch (err) {
    console.warn(`[summarization] LLM failed: ${(err as Error).message}`);
    return '';
  }
}
```

### Pattern 3: Cache Population at Startup (Claude's Discretion D-04b)

**What:** On MemoryManager init, load most recent summary from SQLite to survive restarts.

**Optional enhancement:**

```typescript
// In MemoryManager.constructor()
async initialize(convId?: number): Promise<void> {
  if (convId) {
    // Optionally populate _latestSummary from DB on startup
    const latestSummary = this.store.getLatestSummary(convId);
    this._latestSummary = latestSummary ?? null;
  }
}

// In MemoryStore
getLatestSummary(convId: number): string | null {
  try {
    const rows = this.db
      .select({ content: summaries.content })
      .from(summaries)
      .where(eq(summaries.conversationId, convId))
      .orderBy(desc(summaries.createdAt))
      .limit(1)
      .all();
    return rows[0]?.content ?? null;
  } catch (exc) {
    console.warn(`MemoryStore.getLatestSummary failed: ${(exc as Error).message}`);
    return null;
  }
}
```

### Anti-Patterns to Avoid

- **Do NOT block the voice pipeline:** Never `await` summarization in send(). Always fire-and-forget via `void`.
- **Do NOT summarize without counting first:** Avoid querying messages every trigger — check count threshold first (D-01b).
- **Do NOT hardcode summary prompt:** Make prompt a constant or method parameter for future tuning.
- **Do NOT propagate summarization errors:** Follow MEM-05 — catch, log, continue. Silent failure is acceptable for async background work.
- **Do NOT skip updating _latestSummary cache:** Without caching, buildContext() must query SQLite every call — adds latency.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Message filtering/deletion | Custom SQL or loop with deletes | MemoryStore methods + drizzle `where`/`delete` | Drizzle ensures type safety, prevents SQL injection, handles transactions |
| LLM invocation for summarization | Direct OpenAI SDK calls | `this.llm.invoke()` (BaseChatModel abstraction) | Multi-LLM abstraction already in place; hardcoding provider breaks CLAUDE.md constraint |
| Summary persistence | Manual INSERT/UPDATE logic | `MemoryStore.saveSummary()` (already exists) | Existing method handles errors (MEM-05), timestamps, FK constraints |
| Message counting | Ad-hoc query in manager | `MemoryStore.countMessages()` method | Separates concerns, reusable, testable in isolation |

**Key insight:** Phase 36 established the fire-and-forget pattern with error swallowing. Replicating that pattern for Phase 38 ensures consistency, predictability, and compliance with MEM-05 (memory writer reliability).

## Runtime State Inventory

> Phase 38 does not involve renaming, refactoring, or data migration.

**Nothing found — verified by confirming phase scope:** No stored keys need renaming, no service config changes, no OS-registered state affected. Pure message compression logic within existing `messages` and `summaries` tables.

## Common Pitfalls

### Pitfall 1: Forgetting the Threshold Check Before LLM Call

**What goes wrong:** On every message after threshold is met, `runRollingSummarization()` queries and calls LLM every turn — adds 1-3 seconds latency, voice pipeline degrades.

**Why it happens:** Temptation to "just check count inline" without early return.

**How to avoid:** Always follow this pattern:
```typescript
const count = this.store.countMessages(convId);
if (count < 20) return; // BEFORE LLM
```

**Warning signs:** Inspect logs — if `_generateRollingSummary` appears in every turn after 20+ messages, threshold check is missing.

### Pitfall 2: _latestSummary Not Updated After Successful Summary

**What goes wrong:** Summary is saved to SQLite, but `_latestSummary` cache stays stale. Next `buildContext()` call injects old/wrong summary, or buildContext() must query SQLite every call (latency).

**Why it happens:** Forgetting the cache update step — jumping from delete/save directly to return.

**How to avoid:** Always update cache after successful save:
```typescript
this.store.saveSummary(convId, summary);
this._latestSummary = summary; // ← CRITICAL
```

**Warning signs:** Test that `buildContext()` returns correct summary immediately after summarization without querying SQLite.

### Pitfall 3: Silent Deletion Without Backup

**What goes wrong:** 10 oldest messages are deleted from SQLite with no summary generated (LLM fails, network error). Data is lost, summary never created.

**Why it happens:** Deleting before validating summary generation.

**How to avoid:** Always delete AFTER successful summary:
```typescript
const summary = await this._generateRollingSummary(oldest);
if (!summary) return; // Don't delete if summary failed
const ids = oldest.map(m => m.id);
this.store.deleteMessages(ids);
```

**Warning signs:** After summarization error, check SQLite — messages should still be present. If gone, delete happened before summary validation.

### Pitfall 4: Ignoring Multi-Turn Summarization

**What goes wrong:** A very long conversation with 50+ messages hits summarization once, gets down to 40 messages, but never summarizes again. Eventually conversation balloons unboundedly.

**Why it happens:** Code assumes "one summarization per session" instead of "repeat until count < 20".

**How to avoid:** D-06 documents this: "Após sumarização, o ciclo pode repetir se ainda houver >= 20 msgs remanescentes". Either (a) loop until count < 20, or (b) document that next fire-and-forget trigger will handle it.

**Warning signs:** Monitor message count over a long session — if it grows past 30+ after first summarization, repeat logic is broken.

### Pitfall 5: Injecting Summary in Wrong buildContext() Position

**What goes wrong:** Summary appears in middle of typed memories, or after them, breaking the tiered order documented in Phase 37 (MCTX-01). LLM receives summary too late in context to use it.

**Why it happens:** Copy-pasting buildContext code without checking order.

**How to avoid:** Verify buildContext order matches D-04 and Phase 37:
```
1. Perfil do usuário
2. Rolling summary ← HERE (between profile and typed memories)
3. Memórias semânticas
4. Memórias episódicas
5. Memórias procedurais
```

Current code (manager.ts:91-133) already has placeholder (line 113):
```typescript
if (rollingSum) {
  parts.push(rollingSum);
}
```

**Warning signs:** Inspect `buildContext()` output — summary should appear in section 2, not later.

## Code Examples

### Example 1: MemoryStore Helper Methods (to be added)

```typescript
// Source: apps/backend-ts/src/memory/store.ts (add these methods to MemoryStore class)

/**
 * Count messages for a conversation (active messages only, roles user/assistant).
 * Returns 0 on error (MEM-05).
 */
countMessages(convId: number): number {
  try {
    const result = this.db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, convId),
          inArray(messages.role, ['user', 'assistant']),
        ),
      )
      .get();
    return result?.count ?? 0;
  } catch (exc) {
    console.warn(
      `MemoryStore.countMessages failed (convId=${convId}): ${(exc as Error).message}`,
    );
    return 0;
  }
}

/**
 * Retrieve oldest N messages for a conversation (ordered by id ascending).
 * Returns [] on error (MEM-05).
 */
getOldestMessages(convId: number, limit: number): MessageWithId[] {
  try {
    const rows = this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, convId))
      .orderBy(asc(messages.id))
      .limit(limit)
      .all();
    return rows as MessageWithId[];
  } catch (exc) {
    console.warn(
      `MemoryStore.getOldestMessages failed (convId=${convId}): ${(exc as Error).message}`,
    );
    return [];
  }
}

/**
 * Delete messages by ID list (used after summarization).
 * Errors logged, never throws (MEM-05).
 */
deleteMessages(ids: number[]): void {
  if (ids.length === 0) return;
  try {
    this.db
      .delete(messages)
      .where(inArray(messages.id, ids))
      .run();
  } catch (exc) {
    console.warn(
      `MemoryStore.deleteMessages failed (${ids.length} ids): ${(exc as Error).message}`,
    );
  }
}

/**
 * Retrieve latest summary for a conversation (most recent first).
 * Returns null if none found or error (MEM-05).
 */
getLatestSummary(convId: number): string | null {
  try {
    const rows = this.db
      .select({ content: summaries.content })
      .from(summaries)
      .where(eq(summaries.conversationId, convId))
      .orderBy(desc(summaries.createdAt))
      .limit(1)
      .all();
    return rows[0]?.content ?? null;
  } catch (exc) {
    console.warn(
      `MemoryStore.getLatestSummary failed (convId=${convId}): ${(exc as Error).message}`,
    );
    return null;
  }
}
```

Source: Pattern replicates existing MemoryStore methods (save, get, count patterns from store.ts:86-338)

### Example 2: MemoryManager Rolling Summarization (Main Implementation)

```typescript
// Source: apps/backend-ts/src/memory/manager.ts (add to MemoryManager class)

private _latestSummary: string | null = null;

/**
 * Public method name (from Claude's discretion — choose one):
 * - runRollingSummarization()  [recommended: matches common verb pattern]
 * - checkAndSummarize()        [alternative: more descriptive]
 * 
 * Fire-and-forget trigger (D-01): called from ChatSession.send()/.sendStream()
 * via void this.memory.runRollingSummarization(this._convId).
 * 
 * This is an async method, but call site uses void — never awaited.
 * Errors caught internally (MEM-05) — never propagate.
 */
private async _runRollingSummarization(convId: number | null): Promise<void> {
  if (convId === null) return;

  try {
    // Step 1: Check threshold BEFORE any expensive operations
    const count = this.store.countMessages(convId);
    if (count < 20) return; // Early exit — zero cost

    // Step 2: Fetch oldest 10 messages
    const oldest = this.store.getOldestMessages(convId, 10);
    if (oldest.length === 0) return;

    // Step 3: Generate summary via LLM
    const summary = await this._generateRollingSummary(oldest);
    if (!summary) return; // Don't delete if summary failed

    // Step 4: Delete old messages and save summary (atomic from user's perspective)
    const ids = oldest.map(m => m.id);
    this.store.deleteMessages(ids);
    this.store.saveSummary(convId, summary);

    // Step 5: Update cache so next buildContext() doesn't query DB
    this._latestSummary = summary;
  } catch (err) {
    // MEM-05: Silent failure — log only, never re-throw
    console.warn(`MemoryManager._runRollingSummarization failed: ${(err as Error).message}`);
  }
}

private async _generateRollingSummary(messages: MessageWithId[]): Promise<string> {
  if (!this.llm) {
    console.warn('[summarization] No LLM available; skipping summary generation');
    return '';
  }

  try {
    // Format messages into readable text
    const conversation = messages
      .map(m => `${m.role === 'user' ? 'User' : 'JARVIS'}: ${m.content}`)
      .join('\n\n');

    const prompt = `Summarize the following conversation between a user and JARVIS (an intelligent assistant). Extract 2-3 key facts, decisions, or context items that are important to remember. Be concise and actionable.

=== Conversation ===
${conversation}

=== Summary ===`;

    const result = await this.llm.invoke(prompt);
    const text = result.content?.toString().trim() ?? '';
    return text ? `### Resumo da Conversa\n${text}` : '';
  } catch (err) {
    console.warn(`[summarization] LLM invocation failed: ${(err as Error).message}`);
    return '';
  }
}
```

### Example 3: ChatSession Integration (Call Site)

```typescript
// Source: apps/backend-ts/src/session/chat-session.ts (modify send() and sendStream())

async send(text: string): Promise<string> {
  this.history.push(new HumanMessage(text));

  const result = await this._agent.invoke({ messages: this.history });
  this.history = result.messages;

  const finalText = extractFinalAiText(result.messages);

  if (this._convId !== null) {
    try {
      await this.memory.saveTurn(this._convId, text, finalText);
    } catch (exc) {
      console.warn(`ChatSession.send: saveTurn falhou: ${(exc as Error).message}`);
    }
  }

  // Phase 36 (MEMW-01, REL-01): fire-and-forget memory extraction
  void this._extractAndWriteMemories(text, finalText);

  // Phase 38 (MSUM-01, MSUM-02): fire-and-forget rolling summarization
  void this.memory.runRollingSummarization(this._convId);

  return finalText;
}

async *sendStream(text: string): AsyncGenerator<string, void, unknown> {
  this.history.push(new HumanMessage(text));

  let assembled = '';
  const agentStream = this._agent.stream(
    { messages: this.history },
    { streamMode: 'messages' },
  );

  for await (const [msg] of agentStream) {
    if (!msg || typeof msg !== 'object') continue;
    const ctorName = (msg as { constructor?: { name?: string } }).constructor?.name;
    if (ctorName !== 'AIMessageChunk') continue;
    const content = (msg as { content?: unknown }).content;
    const token = typeof content === 'string' ? content : '';
    if (token) {
      assembled += token;
      yield token;
    }
  }

  this.history.push(new AIMessage(assembled));

  if (this._convId !== null) {
    try {
      await this.memory.saveTurn(this._convId, text, assembled);
    } catch (exc) {
      console.warn(`ChatSession.sendStream: saveTurn falhou: ${(exc as Error).message}`);
    }
  }

  // Phase 36 (MEMW-01, REL-01): fire-and-forget memory extraction
  void this._extractAndWriteMemories(text, assembled);

  // Phase 38 (MSUM-01, MSUM-02): fire-and-forget rolling summarization
  void this.memory.runRollingSummarization(this._convId);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Accumulate all messages in conversation | Rolling summarization every 20 messages | Phase 38 (v1.8) | Context window stays bounded; no message bloat; LLM always sees compressed history |
| Manual user cleanup | Automatic background compression | Phase 38 | User never needs to prune; works seamlessly |
| Lose conversation history | Preserve summary in SQLite | Phase 38 | Can reconstruct gist of old conversation from summary |

**Deprecated/outdated:**
- None — Phase 38 is a net-new feature.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `this.llm` is guaranteed non-null in MemoryManager during runtime | Code Examples | If null, summary generation fails silently. Low risk — Phase 36 already uses `this.llm` without guards. Solution: defensive check at start of `_generateRollingSummary()` |
| A2 | `MemoryStore.saveSummary()` existing method is sufficient for Phase 38 requirements | Standard Stack | If method missing or signature differs, task must add it. LOW RISK: verified in store.ts:135-146 |
| A3 | Fire-and-forget pattern is acceptable for rolling summarization (never awaited in voice path) | Architecture Patterns | If synchronous summarization becomes requirement, design must change. LOW RISK: MSUM-02 explicitly locks fire-and-forget |
| A4 | Deleting messages is idempotent — multiple parallel summarizations won't corrupt data | Common Pitfalls | If race conditions exist, concurrent summarizations could double-delete. MEDIUM RISK: SQLite uses file locks; verify no concurrent access patterns in codebase. Note: ChatSession is per-conversation, so concurrent send() on same convId shouldn't occur |

**All other claims in this research were verified via codebase inspection or CONTEXT.md decisions.**

## Open Questions

None. All implementation decisions are locked in CONTEXT.md. Prompt wording and method name are Claude's discretion (non-blocking).

## Environment Availability

No external dependencies beyond those already in stack.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js runtime | TypeScript compilation, LangChain | ✓ | 20.x+ (inferred from existing stack) | — |
| SQLite (better-sqlite3) | MemoryStore operations | ✓ | 10.x+ (pinned in package.json) | — |
| LangChain (@langchain/core) | LLM abstraction | ✓ | 0.3.x (pinned in package.json) | — |

**Missing dependencies:** None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.x + @vitest/ui (inferred from existing test structure) |
| Config file | `/root/jarvis/apps/backend-ts/vitest.config.ts` |
| Quick run command | `npm test -- src/memory/manager.test.ts -t "rolling"` (test file to be created) |
| Full suite command | `npm test -- src/memory/` (all memory tests) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MSUM-01 | After 20 messages, 10 oldest are deleted and replaced by 1 summary entry | unit | `npm test -- src/memory/manager.test.ts::runRollingSummarization -t "deletes oldest 10"` | ❌ Wave 0 |
| MSUM-02 | Trigger runs async without blocking caller (fire-and-forget via void) | unit | `npm test -- src/memory/manager.test.ts -t "fire-and-forget"` | ❌ Wave 0 |
| MSUM-02b | Threshold check happens before LLM call (count < 20 returns immediately) | unit | `npm test -- src/memory/manager.test.ts -t "threshold check"` | ❌ Wave 0 |
| MSUM-02c | Errors logged but never re-thrown (MEM-05 parity) | unit | `npm test -- src/memory/manager.test.ts -t "silent failure"` | ❌ Wave 0 |
| MSUM-03 | buildContext() injects rolling summary between profile and typed memories | integration | `npm test -- src/memory/manager.test.ts::buildContext -t "summary injection"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test -- src/memory/manager.test.ts -t "rolling"` (only rolling summarization tests)
- **Per wave merge:** `npm test -- src/memory/` (all memory tests verify nothing broke)
- **Phase gate:** Full test suite green + visual inspection of buildContext() output

### Wave 0 Gaps

- [ ] `src/memory/manager.test.ts` — test file covering MSUM-01, MSUM-02, MSUM-03
  - Mock MemoryStore.countMessages(), getOldestMessages(), deleteMessages(), saveSummary()
  - Mock LLM invocation
  - Verify threshold check prevents LLM call when count < 20
  - Verify 10 oldest messages are deleted after summary
  - Verify _latestSummary is updated
  - Verify buildContext() returns summary in correct position
- [ ] `src/session/chat-session.test.ts` — add test for fire-and-forget invocation
  - Verify `runRollingSummarization()` is called via void in send() and sendStream()
  - Verify send() returns immediately without waiting for summarization
- [ ] MemoryStore method additions: countMessages, getOldestMessages, deleteMessages, getLatestSummary (unit tested in store.test.ts)

*(All existing memory tests should pass unchanged.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — (single-user assistant) |
| V5 Input Validation | yes | Summary content not sent externally; truncated to 500-char max for safety |
| V6 Cryptography | no | — |

### Known Threat Patterns for TypeScript/Node Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL Injection (messages deletion) | Tampering | Use drizzle ORM with parameterized queries; never string concatenation |
| Information Disclosure (message content) | Disclosure | Summaries stored in local SQLite only; never transmitted unless explicitly configured |
| Denial of Service (unbounded LLM calls) | Denial | Threshold check (count >= 20 before LLM) prevents chat spam from creating unlimited summarizations |

**No security concerns beyond standard Node.js/SQLite hygiene.** Phase 38 adds background LLM calling — ensure rate limiting exists at gateway layer if needed.

## Sources

### Primary (HIGH confidence)
- Code inspection: Phase 36 fire-and-forget pattern (`ChatSession._extractAndWriteMemories`, lines 231-245 in chat-session.ts)
- Code inspection: Phase 37 buildContext implementation (manager.ts:91-133 with rollingSum parameter)
- Code inspection: Schema definition (schema.ts:38-51 summaries table, 23-36 messages table)
- Code inspection: MemoryStore.saveSummary() existing implementation (store.ts:135-146)
- CONTEXT.md Phase 38 decisions (locked decisions D-01 through D-06)
- REQUIREMENTS.md Phase 38 (MSUM-01, MSUM-02, MSUM-03)

### Secondary (MEDIUM confidence)
- Inferred patterns from existing MemoryStore methods (getProfileFacts, saveTypedMemory) for consistency

### Tertiary (covered by locked decisions)
- Prompt wording (Claude's discretion)
- Method name (Claude's discretion)
- Cache initialization logic (Claude's discretion, optional D-04b)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all libraries already pinned in package.json
- Architecture: HIGH — fire-and-forget pattern from Phase 36 is proven, directly replicated
- Pitfalls: HIGH — extracted from code review and domain knowledge of memory systems
- Database schema: HIGH — `summaries` and `messages` tables verified in schema.ts
- Testing: HIGH — patterns follow existing Vitest setup

**Research date:** 2026-04-25
**Valid until:** 2026-05-25 (30 days — stable domain, no fast-moving dependencies)

---

*Phase: 38-rolling-summarization*
*Research completed: 2026-04-25*
*Researched by: Claude Sonnet 4.6*
