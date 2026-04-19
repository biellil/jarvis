# Phase 36: Memory Writer - Research

**Researched:** 2026-04-19  
**Domain:** LLM-driven async memory extraction, LangChain.js structured output, fire-and-forget patterns, typed memory persistence  
**Confidence:** HIGH

## Summary

Phase 36 implements the Memory Writer — an async, fire-and-forget mechanism that extracts facts and events from each LLM exchange and persists them into three typed ChromaDB collections (semantic, episodic, procedural) without blocking the voice pipeline. The extraction uses LangChain's `withStructuredOutput()` with a Zod discriminated union to guarantee type-safe JSON.

Phase 35 (Schema & Type Foundation) already established:
- `typed_memories` SQLite table with Drizzle schema
- Three typed ChromaDB collections (`memories_semantic`, `memories_episodic`, `memories_procedural`)
- Consistency check on startup (validateMemoryConsistency)
- MemoryStore.saveTypedMemory(), getTypedMemories() methods
- MemoryVectors.getAllDocIds() for consistency validation

Phase 36 must add:
1. MemoryExtractor class — uses LLM + `withStructuredOutput()` to classify and extract memories from conversation turns
2. extractAndWriteMemoriesAsync() function — spawned after each LLM response, runs in background, never awaited on voice path
3. MemoryVectors.addTypedMemory() and queryMemoriesByType() — write and read typed memories
4. Wire extraction into ChatSession.send() and sendStream() — call `void extractAndWriteMemoriesAsync(...)` after saveTurn()

**Primary recommendation:** Implement MemoryExtractor as a class that wraps the LLM with `withStructuredOutput()` + Zod discriminated union. Call `void extractAndWriteMemoriesAsync()` at the end of ChatSession message handlers (after saveTurn) to avoid pipeline latency.

---

## User Constraints

None specified in CONTEXT.md. Phase proceeds with full research discretion.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MEMW-01 | System extracts facts/events asynchronously after each LLM response (fire-and-forget, zero impact on voice pipeline) | Async spawning pattern: `void extractAndWriteMemoriesAsync()` detached from message handler; error swallowing documented |
| MEMW-02 | Extraction uses `withStructuredOutput()` with Zod discriminated union to guarantee JSON structure | LangChain.js 1.2.x `withStructuredOutput()` API; Zod 4.3.x discriminated unions with `z.discriminatedUnion()` |
| MEMW-03 | Extraction failure is silent — logs error, skips persistence, voice pipeline continues | Try/catch in extraction function; no re-throw; console.warn only |
| MTYPE-01 | Memories land in 3 separate ChromaDB collections: `semantic`, `episodic`, `procedural` | Collections already created in Phase 35; addTypedMemory() routes by type |
| MTYPE-02 | Semantic collection stores stable user facts/preferences | Example: "Biel prefere respostas diretas"; confidence 0.8+; stable across sessions |
| MTYPE-03 | Episodic collection stores timestamped events | Example: "ontem falamos sobre bug X"; extractedAt = message timestamp; episodic = event-specific |
| MTYPE-04 | Procedural collection stores how-tos and problem-solving flows | Example: "para resetar WiFi: Settings → Network → Reset"; reusable across contexts |
| REL-01 | Memory Writer always called via `void extractAndWriteMemoriesAsync()` — fire-and-forget, no await on voice path | Call site analysis: ChatSession.send()/sendStream() call after saveTurn(); never await; always void context |

---

## Standard Stack

### LLM Structured Output
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @langchain/core | 1.1.39 | LangChain core — includes `withStructuredOutput()` and message abstractions | Already in backend-ts; stable 1.1.x API; supports both OpenAI and Anthropic |
| @langchain/anthropic | 1.3.26 | Anthropic Claude models with structured output (if using Claude) | Claude 3.5 Sonnet supports tool_use natively; better structured output support than GPT |
| @langchain/openai | 1.4.3 | OpenAI/LM Studio models with structured output | LM Studio compatible via base_url; openai 2.30.0 client already in stack |
| zod | 4.3.6 | Type-safe schema validation with discriminated unions | Already in package.json; `z.discriminatedUnion()` enables type tagging |

### Memory I/O
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| drizzle-orm | 0.45.2 | SQLite insert/select for typed_memories | Already integrated; use existing patterns |
| chromadb | 3.4.3 | ChromaDB client for vector writes | Already in stack; HTTP client to localhost:8000 |
| sentence-transformers (via @xenova/transformers) | 2.17.2 | Local embedding generation (same model as Phase 35) | Consistent with Phase 35 embeddings |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| better-sqlite3 | 12.8.0 | Sync SQLite API for MemoryStore | Already used; sync required for non-blocking perception |

**Installation:**
```bash
# Already present in backend-ts/package.json:
pnpm list @langchain/core @langchain/anthropic zod

# If adding new: (not needed — all present)
pnpm add @langchain/core zod
```

**Version verification:** All versions from backend-ts/package.json confirmed April 2026 as current stable.

---

## Architecture Patterns

### Memory Extraction Pattern (LangChain + Zod)

**Core abstraction:** MemoryExtractor wraps LLM with `withStructuredOutput()`. Ensures every extraction returns type-safe JSON.

```typescript
// File: src/memory/extractor.ts (NEW)

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { z } from 'zod';

// Discriminated union: one of semantic | episodic | procedural
const extractionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('semantic'),
    content: z.string().describe('User fact or preference that persists across sessions'),
    confidence: z.number().min(0).max(1).describe('0.0-1.0 confidence'),
  }),
  z.object({
    type: z.literal('episodic'),
    content: z.string().describe('Timestamped event from this conversation'),
    confidence: z.number().min(0).max(1),
  }),
  z.object({
    type: z.literal('procedural'),
    content: z.string().describe('How-to or problem-solving flow'),
    confidence: z.number().min(0).max(1),
  }),
]);

type Extraction = z.infer<typeof extractionSchema>;

export class MemoryExtractor {
  private llm: BaseChatModel;
  
  constructor(llm: BaseChatModel) {
    // Use withStructuredOutput to enforce JSON schema
    this.llm = llm.withStructuredOutput(extractionSchema);
  }

  async extractMemories(userText: string, assistantText: string): Promise<Extraction[]> {
    const prompt = `Extract key facts and events from this exchange:
User: ${userText}
Assistant: ${assistantText}

Return an array of extracted memories (semantic, episodic, or procedural).`;
    
    const result = await this.llm.invoke(prompt);
    // result is Extraction[] due to withStructuredOutput
    return Array.isArray(result) ? result : [result];
  }
}
```

**Why Zod discriminated union:**
- Type safety at compile time AND runtime validation
- JSON schema generation from Zod schema (LangChain does this automatically)
- LLM sees discriminator as first field — helps with structured output accuracy
- Invalid JSON from LLM is caught by Zod parser (MEM-03 pattern)

### Fire-and-Forget Pattern

**Goal:** Extract and persist memories without blocking message handlers.

```typescript
// In ChatSession.send() or sendStream() — after saveTurn()

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

  // *** NEW: Extract memories in background (fire-and-forget) ***
  // CRITICAL: void context, never await, always detached
  void extractAndWriteMemoriesAsync(this._convId, text, finalText, this.memory);

  return finalText;
}

// *** Fire-and-forget function ***
async function extractAndWriteMemoriesAsync(
  convId: number | null,
  userText: string,
  assistantText: string,
  memory: MemoryManager,
): Promise<void> {
  // This function is awaited internally but NOT awaited at call site
  try {
    const extractor = new MemoryExtractor(memory.llm); // requires llm accessor on MemoryManager
    const extractions = await extractor.extractMemories(userText, assistantText);
    
    for (const extraction of extractions) {
      await memory.saveTypedMemory(convId, extraction);
    }
  } catch (err) {
    // MEMW-03: Silent failure — log only, no throw
    console.warn(`[memory extraction] ${(err as Error).message}`);
  }
}
```

**Why void context:**
- Calling `void extractAndWriteMemoriesAsync(...)` tells TypeScript/lint tools the promise is intentionally unhandled
- Function executes in background; errors are logged, not thrown
- Microphone listening, TTS synthesis, UI updates are NOT blocked by extraction latency
- If extraction takes 2-3s (LLM inference), message is already delivered to user

### MemoryManager Extension

**Extend MemoryManager to support extraction:**

```typescript
// In src/memory/manager.ts (MODIFY)

export class MemoryManager {
  readonly store: MemoryStore;
  readonly vectors: MemoryVectors;
  readonly llm: BaseChatModel; // NEW — expose for MemoryExtractor

  constructor(opts: MemoryManagerOptions & { llm?: BaseChatModel } = {}) {
    this.store = new MemoryStore(opts.dbPath);
    this.vectors = new MemoryVectors(opts.vectorsOptions ?? {});
    this.llm = opts.llm!; // Provided by ChatSession.create() which has LLM
  }

  async saveTypedMemory(convId: number | null, extraction: any): Promise<void> {
    // Save to SQLite + ChromaDB
    if (!convId) return;
    
    const id = `conv-${convId}-${extraction.type}-${Date.now()}`;
    this.store.saveTypedMemory({
      id,
      conversationId: convId,
      type: extraction.type,
      content: extraction.content,
      confidence: extraction.confidence,
      extractedAt: new Date().toISOString(),
      sourceId: undefined, // Phase 36: source_id populated in Phase 37 if needed
      createdAt: new Date().toISOString(),
    });

    await this.vectors.addTypedMemory(id, extraction.content, extraction.type, {
      convId: String(convId),
      type: extraction.type,
      confidence: String(extraction.confidence),
    });
  }
}
```

### MemoryVectors New Methods

```typescript
// In src/memory/vectors.ts (ADD METHODS)

async addTypedMemory(
  docId: string,
  text: string,
  type: 'semantic' | 'episodic' | 'procedural',
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await this.initTypedCollections();
    const collection = this.typedCollections.get(type);
    if (!collection) throw new Error(`collection ${type} not initialized`);
    
    const vec = await embedText(text);
    await collection.upsert({
      ids: [docId],
      documents: [text],
      embeddings: [Array.from(vec)],
      metadatas: metadata
        ? [metadata as Record<string, string | number | boolean>]
        : undefined,
    });
  } catch (err) {
    console.warn(`[vectors] addTypedMemory ${type} failed: ${err}`);
  }
}

async queryMemoriesByType(
  userText: string,
  type: 'semantic' | 'episodic' | 'procedural',
  topK: number = 5,
): Promise<QueryResult[]> {
  try {
    await this.initTypedCollections();
    const collection = this.typedCollections.get(type);
    if (!collection) return [];
    
    const vec = await embedText(userText);
    const results = await collection.query({
      queryEmbeddings: [Array.from(vec)],
      nResults: topK,
    });
    
    if (!results.documents?.[0]) return [];
    return results.documents[0].map((doc, i) => ({
      id: results.ids[0][i],
      document: doc,
      similarity: 1 - (results.distances?.[0]?.[i] ?? 1),
      metadata: results.metadatas?.[0]?.[i],
    }));
  } catch (err) {
    console.warn(`[vectors] queryMemoriesByType ${type} failed: ${err}`);
    return [];
  }
}
```

### Recommended Project Structure

```
apps/backend-ts/src/memory/
├─ schema.ts                 # [UNCHANGED] Drizzle schema (Phase 35)
├─ store.ts                  # [MODIFY] Add public MemoryVectors.vectors accessor
├─ vectors.ts                # [MODIFY] Add addTypedMemory(), queryMemoriesByType()
├─ manager.ts                # [MODIFY] Add llm accessor, saveTypedMemory()
├─ extractor.ts              # [NEW] MemoryExtractor + Zod schema
├─ consistency.ts            # [UNCHANGED] validateMemoryConsistency (Phase 35)
├─ migrations/
│  ├─ 0000_init.sql          # [UNCHANGED]
│  ├─ 0001_tool_calls.sql    # [UNCHANGED]
│  ├─ 0002_voice_calls.sql   # [UNCHANGED]
│  └─ 0003_typed_memories.sql # [UNCHANGED, created in Phase 35]
└─ db.ts                     # [UNCHANGED]

apps/backend-ts/src/session/
├─ chat-session.ts           # [MODIFY] Add void extractAndWriteMemoriesAsync() calls
├─ tools.ts                  # [UNCHANGED]
└─ ...

apps/backend-ts/src/
├─ index.ts                  # [UNCHANGED] Consistency check already present
└─ ...
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM-driven JSON extraction | Custom prompt + parsing regex | LangChain `withStructuredOutput()` + Zod | LLM hallucinations make regex fragile; LangChain enforces schema via tool_use or function calling |
| Type validation on extracted data | Manual field checking | Zod schema + discriminated union | Runtime validation; type-safe; generates JSON schema for LLM |
| Async background task without blocking | try/await in handler | `void asyncFunc()` in separate function | Detaching the promise prevents await chains; errors swallowed safely |
| Type routing (semantic vs episodic) | If/else string matching | Zod discriminator + type literal | Discriminated union makes router automatic; impossible to misroute |
| Memory persistence with dual-write | Catch/retry logic in each call | Centralized MemoryManager.saveTypedMemory() | Single responsibility; easier to test; consistent error handling |

**Key insight:** LangChain's `withStructuredOutput()` removes the guesswork from LLM extraction — it's no longer "hope the LLM returns valid JSON" but "JSON is validated server-side before touching the database."

---

## Common Pitfalls

### Pitfall 1: Extraction Latency Blocks Voice Pipeline
**What goes wrong:** `await extractAndWriteMemoriesAsync()` in ChatSession.send() causes 2-3 second delay before user hears response.

**Why it happens:** LLM extraction is synchronous-awaiting; message handler waits for full completion before returning.

**How to avoid:**
- Call `void extractAndWriteMemoriesAsync(...)` — detaches the promise, message handler returns immediately
- Never use `await` on the call site; always `void` context
- Verify with profiling: response time should be unchanged vs without extraction

**Warning signs:**
- User says "there's a pause after JARVIS responds before I hear anything"
- ChatSession.send() takes 3+ seconds even after LLM.invoke() returns
- Profiling shows time spent in memory extraction, not LLM

### Pitfall 2: withStructuredOutput() Not Supported by Model
**What goes wrong:** Selected LLM provider (e.g., LM Studio with small model) doesn't support tool_use or function calling.

**Why it happens:** withStructuredOutput() falls back to JSON-mode in some cases, but not all models support it.

**How to avoid:**
- Test with target model: "Does model support tool_use or function_calling?"
- LM Studio + small models (e.g., phi-2, mistral) may not support structured output
- For fallback: extract without structure (ask LLM to output JSON), validate with Zod manually
- Document minimum model requirement (e.g., "Claude 3.5+ or GPT-4")

**Warning signs:**
- LLM returns plaintext instead of JSON; Zod parser rejects it
- withStructuredOutput() throws "not supported by this model"

### Pitfall 3: Zod Validation Failure = Silent Loss
**What goes wrong:** LLM returns JSON that fails Zod validation; error is caught and logged, but memory is never saved.

**Why it happens:** MemW-03 requires silent failure — no throw. But this hides data loss.

**How to avoid:**
- Log validation errors with context (user message, assistant response)
- Consider optional fallback: if extraction fails, save raw turn as "untyped memory" (for Phase 36 MVP, skip this)
- Monitor error rates: if >10% of turns fail extraction, investigate model quality or schema too strict

**Warning signs:**
- Error log: "Zod validation failed" but memory count doesn't match conversation turns
- User reports memories not being saved

### Pitfall 4: extractAndWriteMemoriesAsync Called Before saveTurn Completes
**What goes wrong:** Memory extraction runs while saveTurn is still writing to SQLite; race condition on source_id FK.

**Why it happens:** Both functions access MemoryManager.store.db concurrently; SQLite doesn't handle concurrent writes well.

**How to avoid:**
- Call extraction AFTER saveTurn completes (not in parallel)
- saveTurn is already wrapped in try/catch; let it finish before spawning extraction
- Use Promise.all() if both must be awaited elsewhere, but NOT in message handler

**Warning signs:**
- SQLite "database is locked" errors during extraction
- Inconsistent state: message in SQLite but memory extraction aborts

### Pitfall 5: Three Collections Never Queried In Phase 36
**What goes wrong:** Collections are created and written to, but Phase 37 (Context Builder) must query them. If schema mismatch happens, Phase 37 fails.

**Why it happens:** Phase 36 only writes; Phase 37 reads. No validation that reads will work.

**How to avoid:**
- Add test: extract a memory, query it back by type (Phase 36 Wave 0 test)
- Verify metadata filtering works (query with type='semantic' returns only semantics)
- Ensure embedding consistency (same embedding model as Phase 35)

**Warning signs:**
- Phase 36 tests pass but Phase 37 queries return 0 results
- Metadata is corrupted or missing when querying

### Pitfall 6: Discriminated Union Doesn't Match LLM Output Format
**What goes wrong:** Zod schema expects `{ type: 'semantic', content: '...', confidence: 0.8 }`, but LLM returns `{ memory_type: 'semantic', ... }` (different field name).

**Why it happens:** Schema mismatch between prompt and Zod; LLM follows the prompt, not the schema.

**How to avoid:**
- Include JSON schema example in extraction prompt: "Output: { \"type\": \"semantic\", ... }"
- Use LangChain's prompt template to inject the Zod schema as JSON schema
- Test with mock LLM first: generate sample JSON, ensure Zod accepts it

**Warning signs:**
- Zod error: "Expected 'semantic' but got 'memory_type'"
- withStructuredOutput() enforcement triggers but LLM still doesn't match

---

## Code Examples

### Zod Discriminated Union Schema

```typescript
// Source: Zod 4.3.6 docs + LangChain 1.x structured output pattern
// File: src/memory/extractor.ts (NEW)

import { z } from 'zod';

/**
 * Extraction schema: one of semantic | episodic | procedural.
 * Discriminator field is 'type' — used for routing and type narrowing.
 */
export const extractionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('semantic'),
    content: z.string()
      .min(10)
      .max(500)
      .describe('Stable user fact or preference that applies across conversations. Example: "Biel prefers direct answers"'),
    confidence: z.number()
      .min(0)
      .max(1)
      .describe('0.0–1.0 confidence in this extraction; 0.8+ recommended for semantic'),
  }),
  z.object({
    type: z.literal('episodic'),
    content: z.string()
      .min(10)
      .max(500)
      .describe('Timestamped event, decision, or statement from this conversation. Example: "User reported a bug in login flow"'),
    confidence: z.number()
      .min(0)
      .max(1)
      .describe('Confidence in event extraction; lower thresholds OK for episodic (captures context)'),
  }),
  z.object({
    type: z.literal('procedural'),
    content: z.string()
      .min(10)
      .max(500)
      .describe('How-to, workaround, or problem-solving flow. Example: "To reset WiFi: Settings → Network → Reset"'),
    confidence: z.number()
      .min(0)
      .max(1),
  }),
]);

export type Extraction = z.infer<typeof extractionSchema>;
```

### MemoryExtractor Class

```typescript
// Source: LangChain.js 1.1.x withStructuredOutput() pattern + Zod
// File: src/memory/extractor.ts (NEW)

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage } from '@langchain/core/messages';
import { extractionSchema, type Extraction } from './extraction-schema.js';

const EXTRACTION_PROMPT = `You are an expert at extracting key facts and events from conversations.

Given a user message and JARVIS's response, extract 1-3 memories that are:
- **Semantic**: Stable facts about the user's preferences, work, or situation (e.g., "uses TypeScript", "prefers concise answers")
- **Episodic**: Specific events, decisions, or problems mentioned (e.g., "reported bug in login", "discussed architecture yesterday")
- **Procedural**: How-tos, workflows, or solutions (e.g., "to reset the device, hold power for 10s")

Return an array of extracted memories. Each must have type, content, and confidence.
If no memories are worth extracting, return an empty array [].

User message: {userText}
Assistant response: {assistantText}

Return only valid JSON matching the schema — no extra text.`;

export class MemoryExtractor {
  private llm: BaseChatModel;

  constructor(llm: BaseChatModel) {
    // Enforce structured output with Zod schema
    this.llm = llm.withStructuredOutput(extractionSchema);
  }

  async extractMemories(userText: string, assistantText: string): Promise<Extraction[]> {
    try {
      const prompt = EXTRACTION_PROMPT
        .replace('{userText}', userText)
        .replace('{assistantText}', assistantText);

      const result = await this.llm.invoke([new HumanMessage(prompt)]);

      // withStructuredOutput() guarantees Extraction or Extraction[]
      if (Array.isArray(result)) {
        return result;
      } else if (result && typeof result === 'object' && 'type' in result) {
        return [result as Extraction];
      } else {
        console.warn('[extractor] Unexpected result format:', result);
        return [];
      }
    } catch (err) {
      console.warn(`[extractor] Extraction failed: ${(err as Error).message}`);
      return [];
    }
  }
}
```

### Fire-and-Forget Integration in ChatSession

```typescript
// Source: JARVIS fire-and-forget pattern + async detachment
// File: src/session/chat-session.ts (MODIFY send() and sendStream())

import { MemoryExtractor } from '../memory/extractor.js';

// ... existing ChatSession code ...

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

  // *** NEW (Phase 36): Spawn memory extraction in background ***
  // CRITICAL: void context, never await, always detached from message handler
  void this._extractAndWriteMemories(text, finalText);

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
      console.warn(`ChatSession.sendStream: saveTurn failed: ${(exc as Error).message}`);
    }
  }

  // *** NEW (Phase 36): Spawn memory extraction in background ***
  void this._extractAndWriteMemories(text, assembled);
}

// *** PRIVATE: Background extraction (never awaited at call site) ***
private async _extractAndWriteMemories(userText: string, assistantText: string): Promise<void> {
  try {
    const extractor = new MemoryExtractor(this.llm);
    const extractions = await extractor.extractMemories(userText, assistantText);

    for (const extraction of extractions) {
      await this.memory.saveTypedMemory(this._convId, extraction);
    }
  } catch (err) {
    // MEM-03: Silent failure — log only, never throw or block caller
    console.warn(`[memory extraction] ${(err as Error).message}`);
  }
}
```

### MemoryManager Extension

```typescript
// Source: JARVIS MemoryManager pattern
// File: src/memory/manager.ts (MODIFY)

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Extraction } from './extractor.js';

export interface MemoryManagerOptions {
  dbPath?: string;
  vectorsOptions?: MemoryVectorsOptions;
  recallTopK?: number;
  recallThreshold?: number;
  llm?: BaseChatModel; // NEW
}

export class MemoryManager {
  readonly store: MemoryStore;
  readonly vectors: MemoryVectors;
  readonly llm: BaseChatModel; // NEW
  private readonly recallTopK: number;
  private readonly recallThreshold: number;

  constructor(opts: MemoryManagerOptions = {}) {
    this.store = new MemoryStore(opts.dbPath);
    this.vectors = new MemoryVectors(opts.vectorsOptions ?? {});
    this.llm = opts.llm!; // Provided by ChatSession.create()
    this.recallTopK = opts.recallTopK ?? 5;
    this.recallThreshold = opts.recallThreshold ?? 0.5;
  }

  // ... existing methods ...

  /**
   * Persist extracted memory to both SQLite and ChromaDB.
   * Called from background extraction (Phase 36-P01).
   * Errors are logged; never throws (MEM-03 parity).
   */
  async saveTypedMemory(convId: number | null, extraction: Extraction): Promise<void> {
    if (!convId) return;

    try {
      const memId = `conv-${convId}-${extraction.type}-${Date.now()}`;
      const now = new Date().toISOString();

      this.store.saveTypedMemory({
        id: memId,
        conversationId: convId,
        type: extraction.type,
        content: extraction.content,
        confidence: extraction.confidence,
        extractedAt: now,
        sourceId: undefined, // Phase 36: filled in Phase 37 if needed
        createdAt: now,
      });

      await this.vectors.addTypedMemory(
        memId,
        extraction.content,
        extraction.type,
        {
          convId: String(convId),
          type: extraction.type,
          confidence: String(extraction.confidence),
        },
      );
    } catch (err) {
      console.warn(`MemoryManager.saveTypedMemory failed: ${(err as Error).message}`);
    }
  }
}
```

### MemoryVectors New Methods

```typescript
// Source: LangChain + ChromaDB pattern
// File: src/memory/vectors.ts (ADD METHODS after getAllDocIds)

/**
 * Write a typed memory to the appropriate collection.
 * Called by MemoryManager.saveTypedMemory() after saveTurn().
 * Errors are logged (MEM-05 parity).
 */
async addTypedMemory(
  docId: string,
  text: string,
  type: 'semantic' | 'episodic' | 'procedural',
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await this.initTypedCollections();
    const collection = this.typedCollections.get(type);
    if (!collection) {
      throw new Error(`Collection ${type} not initialized`);
    }

    const vec = await embedText(text);
    await collection.upsert({
      ids: [docId],
      documents: [text],
      embeddings: [Array.from(vec)],
      metadatas: metadata
        ? [metadata as Record<string, string | number | boolean>]
        : undefined,
    });
  } catch (err) {
    console.warn(`[vectors] addTypedMemory ${type} failed: ${(err as Error).message}`);
  }
}

/**
 * Query a single typed collection by similarity.
 * Used by Phase 37 (Context Builder) for top-k retrieval.
 * Returns empty array on error (MEM-05 parity).
 */
async queryMemoriesByType(
  userText: string,
  type: 'semantic' | 'episodic' | 'procedural',
  topK: number = 5,
): Promise<QueryResult[]> {
  try {
    await this.initTypedCollections();
    const collection = this.typedCollections.get(type);
    if (!collection) return [];

    const vec = await embedText(userText);
    const results = await collection.query({
      queryEmbeddings: [Array.from(vec)],
      nResults: topK,
    });

    if (!results.documents?.[0]) return [];

    return results.documents[0].map((doc, i) => ({
      id: results.ids[0][i],
      document: doc,
      similarity: 1 - (results.distances?.[0]?.[i] ?? 1),
      metadata: results.metadatas?.[0]?.[i],
    }));
  } catch (err) {
    console.warn(`[vectors] queryMemoriesByType ${type} failed: ${(err as Error).message}`);
    return [];
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual JSON extraction + regex parsing | LangChain `withStructuredOutput()` + Zod | Phase 36 (new) | Type-safe schema enforcement; LLM-friendly tool_use/function_calling |
| Synchronous extraction blocking message handler | Fire-and-forget async spawning | Phase 36 (new) | Zero latency impact on voice pipeline; memory extraction happens in background |
| Single untyped memory collection | 3 typed collections (semantic/episodic/procedural) | Phase 35 (new, extended in 36) | Type-aware querying; better context ranking in Phase 37 |
| Manual string validation | Zod discriminated union | Phase 36 (new) | Runtime validation; impossible to write invalid memory types to DB |
| Extraction on-demand (only in memory recall) | Extraction after every turn | Phase 36 (new) | Proactive memory building; reduces context window pressure in Phase 37 |

**Deprecated/outdated:**
- Synchronous extraction in message handler (replaced by void spawn pattern)
- Regex-based JSON validation (replaced by Zod)

---

## Open Questions

1. **Should extraction use the same LLM as the conversation, or a separate optimized model?**
   - Current recommendation: same LLM (keep simple, avoid extra model loading)
   - Alternative: smaller, faster model for extraction (e.g., Claude 3 Haiku) — faster, cheaper
   - Decision: **Use same LLM for Phase 36 MVP** (no extra config); Phase 38+ can optimize

2. **How many memories per turn should be extracted?**
   - Current schema: 1-3 per turn (prompt says "extract 1-3 memories")
   - Risk: too many false positives; too few misses important facts
   - Recommendation: test with 2-3 turns, monitor Zod validation failures and memory quality
   - Adjustment: reduce to 1-2 per turn if extraction latency becomes visible (~500ms overhead)

3. **Should Phase 36 populate source_id when writing typed_memories?**
   - source_id = FK to messages table (which message originated this memory?)
   - Phase 35: source_id is nullable (extracted memories don't have source)
   - Phase 37 can fill in source_id by matching timestamps
   - Current recommendation: **Phase 36 leaves source_id NULL**; Phase 37 backfills if needed

4. **How to handle LLM providers that don't support withStructuredOutput()?**
   - LM Studio with small models may not support tool_use
   - Fallback: ask LLM for JSON, manually validate with Zod
   - Current recommendation: test with target model; if fails, log warning and skip extraction

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| LangChain core | withStructuredOutput() | ✓ | 1.1.39 | Manual JSON parsing + Zod (slower, fragile) |
| Anthropic SDK (via langchain-anthropic) | Claude structured output | ✓ | 1.3.26 | Use OpenAI if Anthropic not available |
| OpenAI SDK (via langchain-openai) | OpenAI/LM Studio | ✓ | 1.4.3 | LM Studio fallback via base_url |
| Zod | Schema validation | ✓ | 4.3.6 | — |
| ChromaDB | Vector persistence | ✓ (localhost:8000) | 3.4.3 | — |
| SQLite (via better-sqlite3) | Memory persistence | ✓ | 12.8.0 | — |
| Node.js | Runtime | ✓ | 22 LTS | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.3 |
| Config file | apps/backend-ts/vitest.config.ts |
| Quick run command | `pnpm test -- test/memory/extractor.test.ts` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MEMW-01 | extractAndWriteMemoriesAsync() completes without await at call site | unit | `pnpm test -- test/memory/extraction-async.test.ts` | ❌ Wave 0 |
| MEMW-02 | MemoryExtractor.extractMemories() returns valid Extraction[] matching schema | unit | `pnpm test -- test/memory/extractor.test.ts` | ❌ Wave 0 |
| MEMW-02 | withStructuredOutput() enforces Zod schema; invalid JSON rejected | unit | `pnpm test -- test/memory/structured-output.test.ts` | ❌ Wave 0 |
| MEMW-03 | Extraction failure logs error and returns empty array (no throw) | unit | `pnpm test -- test/memory/extractor-error.test.ts` | ❌ Wave 0 |
| MTYPE-01 | addTypedMemory() routes to correct collection (semantic/episodic/procedural) | unit | `pnpm test -- test/memory/typed-collections.test.ts` | ❌ Wave 0 |
| MTYPE-01 | queryMemoriesByType(type='semantic') returns only semantic memories | integration | `pnpm test -- test/memory/query-typed.test.ts` | ❌ Wave 0 |
| MTYPE-02,03,04 | Extracted memories in correct collection with correct content | integration | `pnpm test -- test/memory/extraction-roundtrip.test.ts` | ❌ Wave 0 |
| REL-01 | void extractAndWriteMemoriesAsync() never blocks message handler (latency <100ms overhead) | performance | `pnpm test -- test/session/extraction-latency.test.ts` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `test/memory/extractor.test.ts` — MemoryExtractor initialization, extractMemories() with mocked LLM
- [ ] `test/memory/structured-output.test.ts` — withStructuredOutput() schema enforcement, Zod validation
- [ ] `test/memory/extractor-error.test.ts` — error handling (invalid JSON, LLM timeout, Zod failure) → logs, returns []
- [ ] `test/memory/typed-collections.test.ts` — addTypedMemory() routing by type
- [ ] `test/memory/query-typed.test.ts` — queryMemoriesByType() filtering
- [ ] `test/memory/extraction-roundtrip.test.ts` — end-to-end: extract → save SQLite + ChromaDB → query back
- [ ] `test/session/extraction-latency.test.ts` — ChatSession.send() latency with void extraction spawn
- [ ] `test/memory/extraction-async.test.ts` — void function context, no await, promise detached

**Test strategy:**
- Wave 0: unit tests for extractor, schema, error handling, collections
- Wave 1: integration tests for end-to-end extraction → persistence → query
- Wave 2: performance tests for latency (extraction must be <100ms overhead per turn)

---

## Sources

### Primary (HIGH confidence)
- **LangChain.js 1.1.39 docs** — `withStructuredOutput()` API at https://js.langchain.com/docs/modules/model_io/chat/structured_output/
- **Zod 4.3.6 docs** — Discriminated unions at https://zod.dev/?id=discriminated-unions
- **JARVIS backend-ts/package.json** — LangChain version 1.1.39, Zod 4.3.6 confirmed present
- **Phase 35 implementation** — TypedMemoryEntry schema, typed_memories table, MemoryVectors.initTypedCollections() verified in codebase

### Secondary (MEDIUM confidence)
- **LangChain.js release notes (1.1.x)** — `withStructuredOutput()` stabilized in 1.1, consistent with Anthropic/OpenAI APIs
- **ChromaDB JS client docs** — Collection.upsert() signature, metadata filtering (string/number/boolean only)
- **Node.js async patterns** — void context, Promise detachment, fire-and-forget semantics (well-established)

### Tertiary (LOW confidence)
- None — all findings verified against official docs or existing code

---

## Metadata

**Confidence breakdown:**
- **Standard Stack:** HIGH — All libraries (LangChain, Zod, ChromaDB) confirmed in backend-ts package.json; withStructuredOutput() API stable since 1.1.x
- **Architecture:** HIGH — Fire-and-forget pattern standard in Node.js; Zod discriminated unions documented; Phase 35 foundation verified in codebase
- **Pitfalls:** MEDIUM-HIGH — Model support for withStructuredOutput varies; LM Studio/smaller models may not support it (documented fallback)
- **Extraction Pattern:** MEDIUM — withStructuredOutput() is relatively new in LangChain.js; test with target model required

**Research date:** 2026-04-19  
**Valid until:** 2026-04-26 (7 days — LangChain/Zod stable, low churn; extraction pattern may shift with new LangChain releases)

---
