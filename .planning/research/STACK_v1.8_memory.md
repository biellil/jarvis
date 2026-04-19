# Technology Stack for Memory Intelligence v1.8

**Project:** JARVIS — Memory Intelligence Features  
**Domain:** TypeScript/Node.js AI Assistant with Local Memory Management  
**Researched:** 2026-04-19  
**Overall Confidence:** HIGH

## Executive Summary

JARVIS v1.8 adds LLM-driven memory extraction with typed storage (semantic/episodic/procedural), rolling summarization, and top-k retrieval per type. The existing stack (LangChain.js 1.x, ChromaDB JS, Drizzle ORM, better-sqlite3) is fully capable of supporting these features. **NO new major dependencies are required**—only targeted libraries for structured output and optional reranking.

The recommended approach:
1. **Zod** for typed memory schemas (already a dependency) — use discriminated unions to enforce memory type enforcement
2. **@langchain/core's native structured output** — leverage `withStructuredOutput()` on ChatOpenAI/ChatAnthropic
3. **Extend existing Drizzle schema** — add typed_memory table to store JSON memories with type discriminator
4. **ChromaDB JS collections per memory type** — separate collections for semantic/episodic/procedural OR single collection with metadata filtering
5. **(Optional) Cohere Rerank** — only if search quality degrades, add post-retrieval reranking

This stack avoids over-engineering: no new state management, no new vector DB, no external summarization API.

---

## Recommended Stack

### Core Memory Intelligence Libraries

| Technology | Version | Purpose | Why This Choice | Integration Point |
|------------|---------|---------|-----------------|------------------|
| **@langchain/core** | ^1.1.39 (existing) | Structured output via `withStructuredOutput()` method | Native support in ChatOpenAI + ChatAnthropic; zero external deps; works with Zod schemas | ChatSession.chat() for Memory Writer prompts |
| **zod** | ^4.3.6 (existing) | Typed memory schema definition with discriminated unions | Type-safe, runtime validation, LangChain.js native integration, inferred TypeScript types | MemoryExtractor schemas (SemanticMemory, EpisodicMemory, ProceduralMemory) |
| **drizzle-orm** | ^0.45.2 (existing) | SQLite schema migration and query builder | Already in stack, type-safe, handles complex relations | typed_memory table for JSON storage + migrations |
| **better-sqlite3** | ^12.8.0 (existing) | Synchronous SQLite driver | Already in use, sufficient for memory operations | MemoryStore extension for querying typed memories |
| **chromadb** | ^3.4.3 (existing) | Vector memory storage with metadata filtering | Already in use, supports collection-per-type organization, metadata $eq/$and filtering | MemoryVectors class extended for type-aware retrieval |
| **@xenova/transformers** | ^2.17.2 (existing) | Local embedding generation (all-MiniLM-L6-v2) | Offline, no API key, 384-dim embeddings | Embedding extraction for typed memory entries |

### Optional Additions (Only if Search Quality Degrades)

| Technology | Version | Purpose | When to Use | Impact |
|------------|---------|---------|------------|--------|
| **@langchain/cohere** | ^0.4.0 | Cohere Rerank post-processor for semantic search | Query relevance score <0.65 after top-5 retrieval | Adds HTTP call per buildContext(); ~50-100ms latency |
| **cohere-ai** | ^8.0.0 | Cohere SDK (for direct reranking if not via LangChain) | If LangChain integration insufficient | Direct API control, but requires COHERE_API_KEY env var |

### NOT Recommended

| Library | Why Avoid | Alternative |
|---------|-----------|-------------|
| **LangGraph memory classes** (deprecated) | Removed in LangChain 0.3.x; state management via checkpoint only | Manage state in MemoryManager; SQLite for persistence |
| **llamaindex** | Heavy, adds 100+ dependencies; LangChain.js sufficient | Stay with LangChain.js + custom retrievers |
| **weaviate / qdrant** | Require separate server; ChromaDB already embeds | Use ChromaDB JS with per-type collection strategy |
| **langmem** (LangChain memory library) | Still experimental; LangChain.js 0.3+ steers away from it | Custom MemoryWriter extraction + Drizzle storage |
| **OpenAI structured outputs only** | Breaks multi-LLM abstraction; LLM Studio doesn't support yet | Use Zod + fallback JSON parsing for LM Studio |

---

## Installation

The existing `package.json` already has all required core dependencies. Add optional reranking if needed:

```bash
# Core — already present, verify versions:
# pnpm list @langchain/core @langchain/openai @langchain/anthropic zod drizzle-orm chromadb

# Optional reranking (only if buildContext scores < 0.65 average):
pnpm add @langchain/cohere
# OR use Cohere SDK directly
pnpm add cohere-ai
```

### Verification Checklist

```bash
# Confirm existing stack
node -e "console.log(require('./package.json').dependencies['@langchain/core'])"
# Should be: ^1.1.39

node -e "console.log(require('./package.json').dependencies['zod'])"
# Should be: ^4.3.6

# Transformers.js for embeddings (used for parity; may be transitive via chromadb)
npm ls @xenova/transformers
```

---

## Key Architecture Decisions

### 1. Typed Memory via Zod Discriminated Union

Instead of generic text storage, use Zod discriminated union to enforce type at runtime:

```typescript
// src/memory/types.ts
import { z } from 'zod';

export const SemanticMemory = z.object({
  type: z.literal('semantic'),
  fact: z.string(),
  confidence: z.number().min(0).max(1),
  lastUpdated: z.string().datetime(),
});

export const EpisodicMemory = z.object({
  type: z.literal('episodic'),
  event: z.string(),
  timestamp: z.string().datetime(),
  context: z.string(),
});

export const ProceduralMemory = z.object({
  type: z.literal('procedural'),
  procedure: z.string(),
  steps: z.array(z.string()),
  prerequisites: z.array(z.string()),
});

export const TypedMemory = z.discriminatedUnion('type', [
  SemanticMemory,
  EpisodicMemory,
  ProceduralMemory,
]);
export type TypedMemory = z.infer<typeof TypedMemory>;
```

**Why:** Zod discriminated unions are more efficient than regular unions (O(1) lookup vs O(n)); TypeScript infers correct types automatically; runtime validation prevents corrupt storage.

### 2. Structured Output via LangChain's `withStructuredOutput()`

Use native structured output from ChatOpenAI/ChatAnthropic instead of manual prompt + parsing:

```typescript
// src/llm/memory-writer.ts
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { TypedMemory } from '../memory/types.js';

const llm = new ChatOpenAI({ ... });
const structuredLlm = llm.withStructuredOutput(TypedMemory);

const response = await structuredLlm.invoke(`
  Extract memories from this conversation turn.
  Output JSON with type: 'semantic' | 'episodic' | 'procedural'
`);
// response is validated TypedMemory with full type safety
```

**Why:**
- **OpenAI native**: Uses JSON schema constraints; guaranteed valid JSON
- **Claude via tool_use**: Falls back to tool calling with Zod validation
- **LM Studio**: Falls back to Zod validation post-generation (may hallucinate, but caught)
- **Zero extra deps**: Already in @langchain/core and @langchain/openai

### 3. Storage: Extend Drizzle Schema (SQLite)

Add a `typed_memory` table instead of storing everything in ChromaDB:

```typescript
// src/memory/schema.ts (extend existing)
export const typedMemories = sqliteTable('typed_memory', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: integer('conversation_id').references(() => conversations.id),
  memoryType: text('memory_type', { enum: ['semantic', 'episodic', 'procedural'] }).notNull(),
  content: text('content', { mode: 'json' }).$type<TypedMemory>().notNull(),
  embedding: text('embedding_json', { mode: 'json' }).$type<number[]>(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  ttl: text('ttl'), // For rolling summarization: when to compress
});

export const typedMemoriesRelations = relations(typedMemories, ({ one }) => ({
  conversation: one(conversations, {
    fields: [typedMemories.conversationId],
    references: [conversations.id],
  }),
}));
```

**Why:**
- Drizzle already manages schema; one migration file per feature
- SQLite is transactional; guarantees type safety at DB level
- Structured queries: `WHERE memory_type = 'semantic' AND created_at > ?`
- No new infrastructure; stored embeddings avoid recomputing

### 4. Vector Retrieval: Metadata-Filtered ChromaDB

Use single ChromaDB collection with metadata discriminator instead of 3 collections:

```typescript
// src/memory/vectors.ts (extend)
async queryMemoriesByType(
  query: string,
  type: 'semantic' | 'episodic' | 'procedural',
  topK: number = 5
): Promise<QueryResult[]> {
  const embedding = await embedText(query);
  const results = await this.collection.query({
    query_embeddings: [embedding],
    n_results: topK,
    where: { memory_type: { $eq: type } }, // Metadata filtering
  });
  // ...
  return results;
}
```

**Rationale:**
- **Single collection**: Simpler management, one embedding space
- **Metadata filtering**: ChromaDB supports $eq, $and, $or operators natively
- **No recomputation**: Embed once, filter by type dynamically
- **Alternative if needed**: Create separate collections per type and aggregate (more overhead, but cleaner separation)

### 5. Rolling Summarization: Time-Based TTL Check

After every N messages (configurable, e.g., N=20), scan for old episodic/procedural memories and compress:

```typescript
// src/memory/summarizer.ts (new module)
async rollingSummarize(conversationId: number): Promise<void> {
  const oldMemories = await store.getMemoriesBefore(
    conversationId,
    Date.now() - 24 * 60 * 60 * 1000 // 24 hours
  );
  
  if (oldMemories.length === 0) return;
  
  // Extract patterns from episodic memories
  const summary = await llm.invoke(`
    Summarize these conversation events into semantic facts:
    ${oldMemories.map(m => m.content).join('\n')}
  `);
  
  // Save summary as semantic memory
  await store.saveMemory(conversationId, {
    type: 'semantic',
    fact: summary,
    confidence: 0.8,
    lastUpdated: new Date().toISOString(),
  });
  
  // Mark old memories with TTL for deletion
  await store.markForCompression(oldMemories.map(m => m.id));
}
```

**Why:** Manual, predictable control over memory lifecycle; integrates with existing message count tracking.

### 6. buildContext Refactor: Summary → Types → Recent

```typescript
// src/memory/manager.ts (refactor buildContext)
async buildContext(userText: string, convId: number): Promise<string> {
  const parts: string[] = [];
  
  // 1. System role (injected by ChatSession)
  // 2. Session summary
  const summary = await store.getLatestSummary(convId);
  if (summary) {
    parts.push(`## Session Summary\n${summary.content}`);
  }
  
  // 3. Retrieved typed memories (top-5 each, no threshold)
  const semantic = await vectors.queryMemoriesByType(userText, 'semantic', 5);
  const episodic = await vectors.queryMemoriesByType(userText, 'episodic', 5);
  const procedural = await vectors.queryMemoriesByType(userText, 'procedural', 5);
  
  if (semantic.length > 0) {
    parts.push(`## Facts\n${semantic.map(m => m.document).join('\n')}`);
  }
  if (episodic.length > 0) {
    parts.push(`## Recent Events\n${episodic.map(m => m.document).join('\n')}`);
  }
  if (procedural.length > 0) {
    parts.push(`## Known Procedures\n${procedural.map(m => m.document).join('\n')}`);
  }
  
  // 4. Recent messages (last 5-10)
  const recent = await store.getRecentMessages(convId, 10);
  parts.push(`## Recent Conversation\n${formatMessages(recent)}`);
  
  return parts.join('\n\n');
}
```

---

## Integration Checklist

### Phase 1: Schema & Storage
- [ ] Add `typed_memory` table to Drizzle schema
- [ ] Generate migration: `drizzle-kit generate:sqlite`
- [ ] Update MemoryStore with typed memory queries
- [ ] Add Zod schemas for SemanticMemory/EpisodicMemory/ProceduralMemory

### Phase 2: Memory Writer
- [ ] Create MemoryExtractor class using ChatSession + `withStructuredOutput()`
- [ ] Hook into ChatSession.chat() post-response to extract typed memories
- [ ] Store extracted memories in typed_memory table
- [ ] Embed and index in ChromaDB with metadata

### Phase 3: Retrieval & Context
- [ ] Extend MemoryVectors with `queryMemoriesByType()`
- [ ] Refactor buildContext() with summary → types → recent flow
- [ ] Test top-k=5 per type (no threshold)

### Phase 4: Rolling Summarization
- [ ] Create rolling summarizer triggered every 20 messages
- [ ] Compress old episodic/procedural into semantic
- [ ] Mark compressed memories as archived (soft delete)

### Phase 5: Testing & Validation
- [ ] Unit tests for Zod schemas (discriminated union parsing)
- [ ] E2E test: conversation → extraction → retrieval → buildContext
- [ ] Benchmark: embedding latency, retrieval speed, summarization quality

---

## Source Credibility & Verification

| Source | Confidence | Notes |
|--------|------------|-------|
| LangChain.js 1.x official docs | HIGH | Verified `withStructuredOutput()` support (Feb 2026) |
| Zod v4.3.6+ | HIGH | Discriminated unions production-ready; tested in codebase |
| ChromaDB JS 3.4.3 docs | HIGH | Metadata filtering, collection management verified (Apr 2026) |
| Cohere Rerank (optional) | MEDIUM | Available via @langchain/cohere but not required for MVP |
| AI agent memory patterns (2026) | MEDIUM | Research-backed by recent ArXiv papers on episodic/semantic/procedural separation |

---

## Why NOT: Alternative Approaches Rejected

### Approach: Multiple ChromaDB Collections
**Rejected because:** 3 separate collections duplicate metadata; filtering by type is cleaner. Only consider if performance testing shows aggregation overhead >20ms.

### Approach: External Summarization Service
**Rejected because:** LLM already available; no need for dedicated service. Batching summaries into background task sufficient.

### Approach: Graph Database (Neo4j)
**Rejected because:** Over-engineered for personal assistant. Relations (episodic → semantic) can be expressed as metadata linking in SQLite + ChromaDB.

### Approach: LangGraph Checkpointer for State
**Rejected because:** Memory persistence is orthogonal to agent state. Use Drizzle for durable, queryable memory; LangGraph for agent step state if needed later.

### Approach: Streaming LLM Extraction
**Rejected because:** Structured output validation incompatible with streaming. Extract post-turn (after response complete) to ensure validity.

---

## Performance Targets

| Operation | Target | Method |
|-----------|--------|--------|
| Memory extraction (structured output) | <2s per turn | LLM inference time |
| Embedding + ChromaDB insert | <100ms | Transformers.js offline |
| buildContext assembly | <150ms | 3 × queryMemoriesByType (50ms each) + format |
| Rolling summarization | <5s per 20 turns | Background task, 1x per session |

---

## Migration Path from v1.7

1. **No breaking changes** to ChatSession or MemoryManager public API
2. Drizzle migration adds typed_memory table (non-destructive)
3. ChromaDB metadata schema unchanged; add memory_type field to new entries
4. MemoryExtractor is new optional component; hook into ChatSession gradually
5. buildContext() refactor is backward-compatible (assembles same output, different source)

---

## Sources

- [OpenAI Structured Outputs vs Zod in 2026](https://dev.to/whoffagents/openai-structured-outputs-vs-zod-which-to-use-for-llm-response-validation-in-2026-366m)
- [LangChain.js Structured Output Guide](https://medium.com/@james.irving.phd/structured-output-with-langchain-openai-43230d32b7de)
- [Zod Discriminated Unions](https://zod.dev/api)
- [ChromaDB Metadata Filtering](https://docs.trychroma.com/docs/querying-collections/metadata-filtering)
- [Cohere Rerank in LangChain](https://js.langchain.com/docs/integrations/document_compressors/cohere_rerank/)
- [AI Agent Memory Architecture 2026](https://www.aimagicx.com/blog/ai-agent-memory-architecture-developer-guide-2026)
- [Episodic Memory for LLM Agents (ArXiv 2025)](https://arxiv.org/pdf/2502.06975)
- [LangChain Memory Types (Short/Long-term)](https://docs.langchain.com/oss/javascript/langchain/short-term-memory)
- [Memory Router Pattern for Agent Memory](https://www.aimagicx.com/blog/ai-agent-memory-architecture-developer-guide-2026)
