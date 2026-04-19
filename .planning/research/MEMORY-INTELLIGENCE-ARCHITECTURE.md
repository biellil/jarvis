# Memory Intelligence Architecture Integration

**Project:** JARVIS v1.8 Memory Intelligence  
**Researched:** 2026-04-19  
**Scope:** TypeScript backend architecture for typed memory extraction, rolling summarization, and top-k retrieval into existing MemoryManager  
**Overall Confidence:** HIGH (existing architecture solid, new components follow established patterns)

---

## Executive Summary

The v1.8 Memory Intelligence milestone extends JARVIS's existing MemoryManager (built in v1.0–v1.7) from a simple RAG system to an **LLM-driven architecture where the model explicitly extracts and categorizes memories**. The existing infrastructure—ChatSession, MemoryVectors (ChromaDB), MemoryStore (SQLite, Drizzle ORM)—provides a solid foundation requiring **5 new classes**, **2 Drizzle schema additions**, and **1 async pattern** for non-blocking memory writes.

**Key architectural constraint:** Memory Writer must not block the user-facing response. The LLM reply flows back to the client while memory extraction happens asynchronously, preserving sub-200ms round-trip latency.

---

## Current Architecture (v1.7 Baseline)

### Memory Components

```
ChatSession (session/chat-session.ts)
  ├─ send(text) → agent.invoke() → LLM response → saveTurn() [BLOCKS]
  ├─ sendStream(text) → agent.stream() → tokens → saveTurn() [BLOCKS]
  └─ history: BaseMessage[]

MemoryManager (memory/manager.ts - facade)
  ├─ MemoryStore (SQLite via Drizzle ORM)
  │  ├─ messages, conversations, summaries, userProfile, toolCalls, voiceCalls
  │  ├─ saveTurn(convId, userText, assistantText)
  │  ├─ buildContext() → profile + recall_memory results
  │  └─ MEM-05: write errors swallowed, never thrown
  │
  └─ MemoryVectors (ChromaDB HTTP client)
     ├─ addMemory(docId, text, metadata)
     ├─ queryMemories(userText, topK, threshold)
     └─ embeddings via sentence-transformers (all-MiniLM-L6-v2)
```

### Response Flow (Current)

```
POST /chat { message: "..." }
  ↓
ChatSession.send(text)
  ├─ this.history.push(HumanMessage)
  ├─ agent.invoke({ messages: history })
  ├─ extractFinalAiText() → "response text"
  ├─ memory.saveTurn() [SQLite write - BLOCKS]
  ├─ vectors.addMemory() [ChromaDB write - BLOCKS]
  └─ return "response text"
  
[Total latency: LLM + SQLite + ChromaDB = typically 150-400ms]
```

### Current MemoryStore Schema (Drizzle)

```typescript
conversations { id, startedAt, endedAt }
messages { id, conversationId, role, content, createdAt }
summaries { id, conversationId, content, createdAt }
userProfile { id, key, value, source, createdAt }
voiceCalls { id, conversationId, timestamp, ... }
toolCalls { id, timestamp, toolName, paramsJson, ... }
```

---

## v1.8 Memory Intelligence: New Components

### 1. Memory Type Schema

**Concept:** Instead of storing all past messages equally, categorize them by cognitive function:

- **Semantic:** Stable facts about the user (preferences, habits, knowledge they shared)
- **Episodic:** Events/stories (what happened, decisions made, conversations)
- **Procedural:** How-to knowledge (steps JARVIS learned to complete tasks)

### 2. Five New Classes

#### A. **MemoryExtractor** — LLM-driven extraction

```typescript
// memory/extractor.ts

export interface ExtractedMemories {
  semantic: Array<{ content: string; confidence: number; tags?: string[] }>;
  episodic: Array<{ content: string; confidence: number; tags?: string[] }>;
  procedural: Array<{ content: string; confidence: number; tags?: string[] }>;
}

export class MemoryExtractor {
  constructor(private llm: BaseChatModel) {}

  /**
   * After LLM response, invoke LLM again with structured prompt
   * to extract typed memories. Uses JSON schema constraint for reliability.
   * 
   * Returns ExtractedMemories or empty object if extraction fails.
   * Never throws — errors logged internally.
   */
  async extract(userText: string, assistantText: string): Promise<ExtractedMemories> {
    // 1. Build prompt: "Given this conversation, extract key facts/events/procedures"
    // 2. Call LLM with structured output (JSON schema constraint)
    // 3. Parse response, validate against schema
    // 4. Return typed memories or fallback to empty
  }
}
```

**Why separate from ChatSession?**
- Extraction is optional (feature flag)
- Can reuse different LLM (cheaper/faster model)
- Testable in isolation from agent

#### B. **MemoryWriter** — Async, fire-and-forget persistence

```typescript
// memory/writer.ts

export class MemoryWriter {
  constructor(
    private store: MemoryStore,
    private vectors: MemoryVectors,
  ) {}

  /**
   * Async, fire-and-forget memory persistence.
   * Returns immediately; persistence happens in background.
   * Errors are logged but never propagate.
   * 
   * This is the KEY to keeping response latency <200ms.
   */
  writeAsync(
    convId: number,
    extracted: ExtractedMemories,
    metadata?: { userText?: string; assistantText?: string },
  ): void {
    // Spawn background task via setImmediate or Promise chain
    // Do NOT await, do NOT throw
    this._writeInBackground(convId, extracted, metadata).catch(err => {
      console.warn(`MemoryWriter: background task failed: ${err.message}`);
    });
  }

  private async _writeInBackground(
    convId: number,
    extracted: ExtractedMemories,
    metadata?: { userText?: string; assistantText?: string },
  ): Promise<void> {
    const now = new Date().toISOString();
    
    // For each memory type: write to SQLite (typed_memories) + ChromaDB
    for (const type of ['semantic', 'episodic', 'procedural'] as const) {
      for (const mem of extracted[type]) {
        const docId = `conv-${convId}-${type}-${now}`;
        
        // SQLite
        this.store.saveTypedMemory(convId, {
          id: docId,
          type,
          content: mem.content,
          confidence: mem.confidence,
          extractedAt: now,
          source: metadata?.userText ? 'user' : 'assistant',
          tags: mem.tags,
          createdAt: now,
        });

        // ChromaDB (with type metadata)
        await this.vectors.addTypedMemory(docId, mem.content, type, {
          convId,
          confidence: mem.confidence,
          source: metadata?.userText ? 'user' : 'assistant',
        });
      }
    }
  }
}
```

**Why fire-and-forget?**
- Response returned before extraction completes
- User doesn't wait for memory writes
- JARVIS is single-user (no queue pile-up risk)
- Graceful degradation: missing memory is non-fatal

#### C. **RollingSummarizer** — Periodic context compression

```typescript
// memory/summarizer.ts

export class RollingSummarizer {
  constructor(
    private llm: BaseChatModel,
    private store: MemoryStore,
  ) {}

  /**
   * Triggered every N turns (configurable, default 20).
   * Summarizes older messages into summaries table.
   * Non-blocking (spawned in background).
   */
  async summarizeIfNeeded(convId: number, totalMessagesInConv: number): Promise<void> {
    const SUMMARY_EVERY = 20; // config: MEMORY_SUMMARIZE_EVERY
    if (totalMessagesInConv % SUMMARY_EVERY !== 0) return;

    this._summarizeInBackground(convId).catch(err => {
      console.warn(`RollingSummarizer: conv ${convId}: ${err.message}`);
    });
  }

  private async _summarizeInBackground(convId: number): Promise<void> {
    // 1. Fetch oldest N messages (e.g., first 40 messages)
    const oldMessages = this.store.getOldestMessages(convId, limit: 40);
    if (oldMessages.length === 0) return;

    // 2. Call LLM: "Summarize this conversation segment in 2-3 sentences"
    const summary = await this._summarizeMessages(oldMessages);
    
    // 3. Save to summaries table
    this.store.saveSummary(convId, summary);
  }

  private async _summarizeMessages(messages: any[]): Promise<string> {
    // Prompt: "Here are conversation messages. Write a 2-3 sentence summary."
    // Return LLM response (summary)
  }
}
```

**Why rolling summarization?**
- Older messages compress 40-60% token reduction
- buildContext() includes summaries instead of raw messages
- Reduces context window pressure for long conversations

#### D. **TypedMemoryEntry** — Type definition

```typescript
// memory/types.ts

export type MemoryType = 'semantic' | 'episodic' | 'procedural';

export interface TypedMemoryEntry {
  id: string;  // "conv-123-semantic-2026-04-19T12:34:56Z"
  conversationId: number;
  type: MemoryType;
  content: string;
  confidence?: number;  // 0.0–1.0, LLM confidence in extraction
  extractedAt: string;  // when extracted
  source?: string;      // 'user' | 'assistant' | 'system'
  tags?: string[];      // categorical hints for retrieval
  createdAt: string;
}
```

#### E. **MemoryManager v2** — Refactored facade

```typescript
// memory/manager.ts (refactored)

export interface MemoryManagerOptions {
  dbPath?: string;
  chromaPath?: string;
  vectorsOptions?: MemoryVectorsOptions;
  llm?: BaseChatModel;  // NEW: for extraction
  recallTopK?: number;
  recallThreshold?: number;
}

export class MemoryManager {
  private readonly store: MemoryStore;
  private readonly vectors: MemoryVectors;
  private readonly extractor?: MemoryExtractor;  // NEW
  private readonly writer?: MemoryWriter;        // NEW
  private readonly summarizer?: RollingSummarizer; // NEW

  constructor(opts: MemoryManagerOptions = {}) {
    this.store = new MemoryStore(opts.dbPath);
    this.vectors = new MemoryVectors(opts.vectorsOptions ?? {});
    
    // NEW: optional extraction + writing
    if (opts.llm) {
      this.extractor = new MemoryExtractor(opts.llm);
      this.writer = new MemoryWriter(this.store, this.vectors);
      this.summarizer = new RollingSummarizer(opts.llm, this.store);
    }
  }

  /**
   * NEW: Called AFTER LLM response in ChatSession.send() and sendStream().
   * Async, does not block. Returns immediately.
   */
  extractAndWriteMemoriesAsync(
    convId: number,
    userText: string,
    assistantText: string,
  ): void {
    if (!this.extractor || !this.writer) return; // graceful degrade if disabled
    
    // Fire-and-forget
    this._extractAndWrite(convId, userText, assistantText).catch(err => {
      console.warn(`MemoryManager.extractAndWrite: ${err.message}`);
    });
  }

  private async _extractAndWrite(
    convId: number,
    userText: string,
    assistantText: string,
  ): Promise<void> {
    const extracted = await this.extractor!.extract(userText, assistantText);
    this.writer!.writeAsync(convId, extracted, { userText, assistantText });
    
    // Trigger rolling summarization
    const msgCount = this.store.getMessageCount(convId);
    await this.summarizer!.summarizeIfNeeded(convId, msgCount);
  }

  /**
   * UPDATED: buildContext() now tiered retrieval.
   * 
   * Order:
   *   1. System prompt (injected by agent)
   *   2. Rolling summaries (compressed old context)
   *   3. Top-k semantic memories (facts)
   *   4. Top-k episodic memories (events)
   *   5. User profile facts
   *   6. Recent messages (in agent history)
   */
  async buildContext(userText: string): Promise<string> {
    const parts: string[] = [];

    // 1. Summaries (old compressed context)
    const summaries = this.store.getSummaries(limit: 3);
    if (summaries.length > 0) {
      const lines = ['### Conversation Summary'];
      for (const s of summaries) {
        lines.push(`- ${s.content}`);
      }
      parts.push(lines.join('\n'));
    }

    // 2-3. Typed memories (semantic + episodic)
    const semanticRecalls = await this.vectors.queryMemoriesByType(
      userText,
      'semantic',
      topK: 5,
    );
    const episodicRecalls = await this.vectors.queryMemoriesByType(
      userText,
      'episodic',
      topK: 5,
    );

    if (semanticRecalls.length > 0) {
      const lines = ['### Facts About You'];
      for (const r of semanticRecalls) {
        lines.push(`- ${r.document}`);
      }
      parts.push(lines.join('\n'));
    }

    if (episodicRecalls.length > 0) {
      const lines = ['### What Happened Before'];
      for (const r of episodicRecalls) {
        lines.push(`- ${r.document}`);
      }
      parts.push(lines.join('\n'));
    }

    // 4. Profile (existing)
    const facts = this.store.getProfileFacts();
    if (facts.length > 0) {
      const lines = ['### Your Preferences'];
      for (const f of facts) {
        lines.push(`- ${f.key}: ${f.value}`);
      }
      parts.push(lines.join('\n'));
    }

    return parts.join('\n\n');
  }

  close(): void {
    this.store.close();
    this.vectors.close?.();
  }
}
```

---

## Data Flow v1.8

### Request → Response → Background Memory

```
POST /chat { message: "Hello" }
  ↓
ChatSession.send(text)
  ├─ this.history.push(HumanMessage("Hello"))
  ├─ agent.invoke({ messages: history })
  ├─ extractFinalAiText() → "Hi! How are you?"
  ├─ memory.saveTurn() [SQLite write, ~10ms]
  ├─ vectors.addMemory() [ChromaDB write, ~50ms]
  ├─ return "Hi! How are you?" [RESPONSE SENT TO CLIENT ✓]
  │  Total latency: ~200ms (LLM + storage)
  │
  └─ memory.extractAndWriteMemoriesAsync() [BACKGROUND ✓]
     ├─ void operator prevents TypeScript warnings
     ├─ Returns immediately (client unaffected)
     ├─ Background process:
     │  ├─ extractor.extract(text, response)
     │  │  ├─ Call LLM with structured output JSON schema
     │  │  └─ Returns ExtractedMemories or empty
     │  ├─ writer.writeAsync()
     │  │  ├─ saveTypedMemory() to SQLite typed_memories
     │  │  └─ addTypedMemory() to ChromaDB with type metadata
     │  └─ summarizer.summarizeIfNeeded() if N mod 20
     └─ Errors logged, never propagate
```

### Context Building (buildContext v2)

```
Next user message: "What do you remember?"
  ↓
ChatSession.send(text)
  ├─ history.push(HumanMessage)
  ├─ agent.invoke() needs context
  │  └─ recall_memory tool called
  │     └─ buildContext(userText)
  │        ├─ summaries → "In earlier conversation, you mentioned..."
  │        ├─ semantic → "Facts: user likes coffee, works in tech"
  │        ├─ episodic → "Events: discussed project deadline yesterday"
  │        ├─ profile → "Preferences: timezone=US/Eastern"
  │        └─ return context block
  │
  ├─ LLM sees full context: summaries + typed memories + profile
  ├─ LLM responds: "I remember you like coffee and work in tech..."
  └─ return response
```

---

## Schema Changes (Drizzle ORM)

### New Table: typed_memories

**Drizzle definition:**

```typescript
// memory/schema.ts (ADD)

export const typedMemories = sqliteTable('typed_memories', {
  id: text('id').primaryKey(),
  conversationId: integer('conversation_id')
    .notNull()
    .references(() => conversations.id),
  type: text('type', { 
    enum: ['semantic', 'episodic', 'procedural'] 
  }).notNull(),
  content: text('content').notNull(),
  confidence: real('confidence'),  // 0.0-1.0
  extractedAt: text('extracted_at').notNull(),
  source: text('source'),  // 'user' | 'assistant'
  tagsJson: text('tags_json', { mode: 'json' })
    .$type<string[] | null>(),
  createdAt: text('created_at').notNull(),
});

export const typedMemoriesRelations = relations(typedMemories, ({ one }) => ({
  conversation: one(conversations, {
    fields: [typedMemories.conversationId],
    references: [conversations.id],
  }),
}));
```

**SQL equivalent:**

```sql
CREATE TABLE typed_memories (
  id TEXT PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  type TEXT NOT NULL CHECK(type IN ('semantic', 'episodic', 'procedural')),
  content TEXT NOT NULL,
  confidence REAL,
  extracted_at TEXT NOT NULL,
  source TEXT,
  tags_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_typed_memories_conv_type 
  ON typed_memories(conversation_id, type);
CREATE INDEX idx_typed_memories_created 
  ON typed_memories(created_at DESC);
```

### MemoryStore Additions

```typescript
// memory/store.ts (ADD methods)

export class MemoryStore {
  // ... existing methods ...

  saveTypedMemory(convId: number, memory: TypedMemoryEntry): void {
    try {
      this.db.insert(typedMemories).values({
        id: memory.id,
        conversationId: convId,
        type: memory.type,
        content: memory.content,
        confidence: memory.confidence,
        extractedAt: memory.extractedAt,
        source: memory.source,
        tagsJson: memory.tags,
        createdAt: memory.createdAt,
      }).run();
    } catch (exc) {
      console.warn(`MemoryStore.saveTypedMemory failed: ${(exc as Error).message}`);
    }
  }

  getTypedMemories(
    convId: number,
    type: MemoryType,
    limit: number = 10,
  ): TypedMemoryEntry[] {
    try {
      return this.db.select()
        .from(typedMemories)
        .where(eq(typedMemories.conversationId, convId))
        .where(eq(typedMemories.type, type))
        .limit(limit)
        .all();
    } catch (exc) {
      console.warn(`MemoryStore.getTypedMemories failed: ${(exc as Error).message}`);
      return [];
    }
  }

  getOldestMessages(convId: number, limit: number): MessageInput[] {
    try {
      return this.db.select()
        .from(messages)
        .where(eq(messages.conversationId, convId))
        .orderBy(asc(messages.createdAt))
        .limit(limit)
        .all();
    } catch (exc) {
      console.warn(`MemoryStore.getOldestMessages failed: ${(exc as Error).message}`);
      return [];
    }
  }

  getMessageCount(convId: number): number {
    try {
      const result = this.db
        .select({ count: count() })
        .from(messages)
        .where(eq(messages.conversationId, convId))
        .all();
      return result[0]?.count ?? 0;
    } catch (exc) {
      console.warn(`MemoryStore.getMessageCount failed: ${(exc as Error).message}`);
      return 0;
    }
  }

  getSummaries(limit: number = 3): { content: string; createdAt: string }[] {
    try {
      return this.db.select({ 
        content: summaries.content,
        createdAt: summaries.createdAt,
      })
        .from(summaries)
        .orderBy(desc(summaries.createdAt))
        .limit(limit)
        .all();
    } catch (exc) {
      console.warn(`MemoryStore.getSummaries failed: ${(exc as Error).message}`);
      return [];
    }
  }
}
```

### MemoryVectors Additions

```typescript
// memory/vectors.ts (ADD methods)

export class MemoryVectors {
  // ... existing methods ...

  /**
   * Query by memory type with metadata filtering.
   * Example: top-5 semantic memories most similar to userText.
   */
  async queryMemoriesByType(
    userText: string,
    type: 'semantic' | 'episodic' | 'procedural',
    topK: number = 5,
  ): Promise<QueryResult[]> {
    try {
      await this.init();
      if (!this.collection) return [];
      
      const vec = await embedText(userText);
      const results = await this.collection.query({
        queryEmbeddings: [Array.from(vec)],
        nResults: topK,
        where: { type },  // ChromaDB where-clause for type filtering
      });

      if (!results.documents?.[0]) return [];

      return results.documents[0]
        .map((doc, i) => ({
          id: results.ids[0][i],
          document: doc,
          similarity: 1 - (results.distances?.[0]?.[i] ?? 1),
          metadata: results.metadatas?.[0]?.[i],
        }))
        .sort((a, b) => b.similarity - a.similarity);
    } catch (err) {
      console.warn(`[vectors] queryMemoriesByType failed:`, err);
      return [];
    }
  }

  /**
   * Upsert memory with type-aware metadata for filtering.
   */
  async addTypedMemory(
    docId: string,
    text: string,
    type: 'semantic' | 'episodic' | 'procedural',
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.init();
      if (!this.collection) throw new Error('collection not initialized');
      
      const vec = await embedText(text);
      await this.collection.upsert({
        ids: [docId],
        documents: [text],
        embeddings: [Array.from(vec)],
        metadatas: [{
          type,
          ...metadata,
        } as Record<string, string | number | boolean>],
      });
    } catch (err) {
      console.warn(`[vectors] Failed to add typed memory ${docId}:`, err);
    }
  }
}
```

---

## File Structure

### New Files

```
apps/backend-ts/src/memory/
├─ extractor.ts (NEW, ~250 lines)
│  └─ MemoryExtractor class, ExtractedMemories interface
├─ writer.ts (NEW, ~200 lines)
│  └─ MemoryWriter class, async fire-and-forget pattern
├─ summarizer.ts (NEW, ~250 lines)
│  └─ RollingSummarizer class, rolling compression
├─ types.ts (NEW, ~30 lines)
│  └─ TypedMemoryEntry, MemoryType definitions
└─ migrations/
   └─ [timestamp]_add_typed_memories.sql (NEW)
      └─ CREATE TABLE typed_memories, CREATE INDEX

(drizzle generate + manual edit)
```

### Modified Files

```
apps/backend-ts/src/memory/
├─ manager.ts (REFACTOR: add extractor/writer/summarizer, update buildContext)
├─ store.ts (ADD: saveTypedMemory, getTypedMemories, getSummaries, etc.)
├─ schema.ts (ADD: typedMemories table + relations)
└─ vectors.ts (ADD: queryMemoriesByType, addTypedMemory)

apps/backend-ts/src/session/
└─ chat-session.ts (MINOR: 1 line call to extractAndWriteMemoriesAsync)

apps/backend-ts/src/
└─ index.ts (MINOR: pass llm to MemoryManager constructor)
```

### Unchanged

```
routes/chat.ts (no changes to request/response contract)
routes/tool-calls.ts (no changes)
llm/* (no changes)
```

---

## Integration Points

### ChatSession → MemoryManager (v1.8)

**Before (v1.7):**
```typescript
async send(text: string): Promise<string> {
  this.history.push(new HumanMessage(text));
  const result = await this._agent.invoke({ messages: this.history });
  this.history = result.messages;
  const finalText = extractFinalAiText(result.messages);
  
  if (this._convId !== null) {
    try {
      await this.memory.saveTurn(this._convId, text, finalText);
    } catch (exc) {
      console.warn(`ChatSession.send: saveTurn failed: ${(exc as Error).message}`);
    }
  }
  return finalText;
}
```

**After (v1.8):**
```typescript
async send(text: string): Promise<string> {
  this.history.push(new HumanMessage(text));
  const result = await this._agent.invoke({ messages: this.history });
  this.history = result.messages;
  const finalText = extractFinalAiText(result.messages);
  
  if (this._convId !== null) {
    try {
      await this.memory.saveTurn(this._convId, text, finalText);
    } catch (exc) {
      console.warn(`ChatSession.send: saveTurn failed: ${(exc as Error).message}`);
    }
    
    // NEW: async memory extraction (non-blocking)
    void this.memory.extractAndWriteMemoriesAsync(this._convId, text, finalText);
  }
  return finalText;
}
```

The `void` operator suppresses TypeScript warnings about unawaited Promises.

### Backend Initialization (index.ts)

**Before:**
```typescript
const llm = createLLM();
const memory = new MemoryManager();
const session = await ChatSession.create({ llm, memory });
```

**After:**
```typescript
const llm = createLLM();
const memory = new MemoryManager({ llm });  // NEW: pass llm for extraction
const session = await ChatSession.create({ llm, memory });
```

---

## Async Safety Pattern

### Critical Constraint
Memory extraction + writing must NOT block the user-facing response (<200ms SLO).

### Implementation: Fire-and-Forget

```typescript
// In ChatSession.send() - AFTER response generated
void this.memory.extractAndWriteMemoriesAsync(convId, userText, assistantText);
//   ↑ void operator = "I intentionally ignore this Promise"

// In MemoryManager.extractAndWriteMemoriesAsync()
extractAndWriteMemoriesAsync(convId, userText, assistantText): void {
  if (!this.extractor || !this.writer) return;
  
  // Start background task but DON'T await
  this._extractAndWrite(convId, userText, assistantText).catch(err => {
    console.warn(`MemoryManager: ${err.message}`);
  });
}

// The Promise chain handles errors, client never sees them
```

### Why Not Queue-Based (Bull, Platformatic)?
- JARVIS is single-user desktop app, not multi-tenant server
- Adding Redis/MongoDB for queues = operational overhead
- Memory writes are fast (<500ms), no pile-up risk
- Graceful degradation: missing memory is non-fatal

### Why Async/Await vs Callbacks?
- Better error handling (catch blocks)
- Cleaner code (no callback hell)
- Aligns with rest of codebase

---

## Build Order (7 Phases)

### Phase 1: Schema + Store (1-2 days)
1. Add `typedMemories` table to `schema.ts`
2. Generate migration: `drizzle-kit generate sqlite`
3. Review + hand-edit if needed
4. Add `saveTypedMemory()`, `getTypedMemories()`, `getSummaries()` to MemoryStore
5. Add `queryMemoriesByType()`, `addTypedMemory()` to MemoryVectors
6. **Tests:** Schema validation, migration idempotence, MemoryStore methods return empty on error

### Phase 2: Memory Extractor (2-3 days)
1. Create `MemoryExtractor` class
2. Define JSON schema for ExtractedMemories
3. Build prompt template: "Extract 3 facts, 2 events, 1 procedure from this conversation"
4. Use LangChain structured output (or Zod parsing fallback)
5. **Tests:** Mock LLM returns valid data, invalid JSON → graceful fallback

### Phase 3: Memory Writer (1-2 days)
1. Create `MemoryWriter` class
2. Implement `_writeInBackground()` async loop
3. Error handling: log, never throw
4. **Tests:** `writeAsync()` returns immediately, background task completes, SQLite + ChromaDB writes succeed

### Phase 4: Rolling Summarizer (2-3 days)
1. Create `RollingSummarizer` class
2. Implement `summarizeIfNeeded()` (triggered every N turns)
3. Prompt template: "Summarize this conversation in 2-3 sentences"
4. Save to existing `summaries` table
5. **Tests:** Triggered at right intervals, summary <200 tokens, errors logged

### Phase 5: MemoryManager Integration (1-2 days)
1. Refactor `MemoryManager` constructor to accept `llm`
2. Add `extractAndWriteMemoriesAsync()` public method
3. Update `buildContext()` to return tiered context (summaries → typed memories → profile)
4. **Tests:** Context includes all 3 types, ordering correct, buildContext latency <50ms

### Phase 6: ChatSession Integration (1 day)
1. Add `void this.memory.extractAndWriteMemoriesAsync()` in `send()`
2. Add same call in `sendStream()`
3. **Tests:** Response latency unchanged (<200ms), memory extractions happen in background

### Phase 7: E2E Testing + Validation (2-3 days)
1. Multi-turn conversation: verify typed memories accumulate
2. Context test: summaries appear in buildContext before recent messages
3. Async safety: response returns while background tasks run
4. Failure resilience: extraction failures don't block response
5. Load test: 100+ turns, verify no memory leaks

---

## Configuration Options

Add to `.env`:

```bash
# Memory Intelligence (v1.8)
MEMORY_EXTRACTION_ENABLED=true
MEMORY_EXTRACTION_MODEL=default  # 'default' uses main LLM, or 'claude' etc.
MEMORY_SUMMARIZE_EVERY=20        # trigger summarization every N messages
MEMORY_SUMMARY_WINDOW=40         # compress oldest N messages
MEMORY_RECALL_TOP_K=5            # per-type retrieval limit (semantic/episodic/procedural)

# Optional: type-aware retrieval weights
MEMORY_SEMANTIC_WEIGHT=1.0
MEMORY_EPISODIC_WEIGHT=1.0
MEMORY_PROCEDURAL_WEIGHT=0.5
```

---

## Backwards Compatibility

### Existing Data
- Old `jarvis_memories` ChromaDB collection (v1.0–v1.7) continues to work
- Old `messages`, `summaries`, `userProfile` tables unmodified
- `recall_memory` tool still functional

### Migration Path
- v1.8 writes to both old + new stores initially (dual-write)
- `recall_memory` tool updated: query `typed_memories` first, fall back to old collection
- Old embeddings deprecated but not deleted (backward-compat layer)

### Feature Flag
- `MEMORY_EXTRACTION_ENABLED=false` → skip extraction, continue storing messages normally
- Allows gradual rollout or testing with memory disabled

---

## Pitfalls & Mitigations

### Pitfall 1: Extraction Failure Blocks Response
**Prevention:** `extractAndWriteMemoriesAsync()` spawned in background, errors never propagate.

### Pitfall 2: Typed Memories Pile Up Unbounded
**Prevention:** 
- Add TTL cleanup (delete memories older than 90 days)
- Monitor table size in health check

### Pitfall 3: Rolling Summaries Lose Detail
**Prevention:**
- Keep N=20 messages before summarizing
- Preserve recent messages in full
- Test with real conversations

### Pitfall 4: ChromaDB Metadata Filtering Fails
**Prevention:**
- Test where-clause syntax
- Fall back to client-side filtering if needed

### Pitfall 5: Confidence Scores Ignored
**Prevention:**
- Use confidence threshold in buildContext (only include > 0.6)
- Log average confidence for monitoring

---

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| `send()` response latency | <200ms | unaffected by extraction (async) |
| Extraction latency | <1s | runs in background |
| ChromaDB query (per-type) | <100ms | fast index lookup |
| buildContext assembly | <50ms | string concatenation |
| Summarization cost | <$1/month | 250 sessions/year, cheap model |
| Storage per session | ~155 KB | typed_memories + summaries + ChromaDB docs |

---

## Sources

- [Background Task Patterns in Node.js](https://nodejs.org/en/docs/guides/dont-block-the-event-loop)
- [LangChain Memory Concepts](https://docs.langchain.com/oss/javascript/concepts/memory)
- [Memory Types in AI Agents — Semantic, Episodic, Procedural](https://atlan.com/know/types-of-ai-agent-memory/)
- [LangMem SDK for Long-Term Memory](https://blog.langchain.com/langmem-sdk-launch/)
- [Rolling Conversation Summarization Techniques](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025)
- [Context Compression in LLM Agents](https://medium.com/the-ai-forum/automatic-context-compression-in-llm-agents-why-agents-need-to-forget-and-how-to-help-them-do-it-43bff14c341d)
- [Drizzle ORM Migrations Guide](https://orm.drizzle.team/docs/migrations)
- [Structured Outputs in LLMs using JSON Schema](https://techsy.io/en/blog/llm-structured-outputs-guide)
- [Constrained Decoding for Reliable Extraction](https://medium.com/@emrekaratas-ai/structured-output-generation-in-llms-json-schema-and-grammar-based-decoding-6a5c58b698a6)
