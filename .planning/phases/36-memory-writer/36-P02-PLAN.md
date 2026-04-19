---
phase: 36-memory-writer
plan: P02
type: execute
wave: 2
depends_on: [36-P01]
files_modified:
  - apps/backend-ts/src/memory/vectors.ts
  - apps/backend-ts/src/memory/manager.ts
  - apps/backend-ts/test/memory/vectors-typed.test.ts
  - apps/backend-ts/test/memory/manager-typed.test.ts
autonomous: true
requirements: [MTYPE-01, MTYPE-02, MTYPE-03, MTYPE-04, MEMW-02]

must_haves:
  truths:
    - "addTypedMemory() routes documents to the correct ChromaDB collection (semantic → memories_semantic, episodic → memories_episodic, procedural → memories_procedural)"
    - "queryMemoriesByType() returns only documents from the requested collection type"
    - "MemoryManager.saveTypedMemory() writes to both SQLite (store.saveTypedMemory) and ChromaDB (vectors.addTypedMemory) in a single call"
    - "MemoryManager accepts an optional llm field in its constructor options"
  artifacts:
    - path: "apps/backend-ts/src/memory/vectors.ts"
      provides: "addTypedMemory() + queryMemoriesByType() methods on MemoryVectors"
      exports: ["QueryResult"]
    - path: "apps/backend-ts/src/memory/manager.ts"
      provides: "llm field + saveTypedMemory() on MemoryManager"
    - path: "apps/backend-ts/test/memory/vectors-typed.test.ts"
      provides: "Unit tests for addTypedMemory routing and queryMemoriesByType filtering"
    - path: "apps/backend-ts/test/memory/manager-typed.test.ts"
      provides: "Unit tests for MemoryManager.saveTypedMemory dual-write"
  key_links:
    - from: "apps/backend-ts/src/memory/manager.ts"
      to: "apps/backend-ts/src/memory/vectors.ts"
      via: "this.vectors.addTypedMemory(memId, content, type, metadata)"
      pattern: "addTypedMemory"
    - from: "apps/backend-ts/src/memory/manager.ts"
      to: "apps/backend-ts/src/memory/store.ts"
      via: "this.store.saveTypedMemory(entry)"
      pattern: "saveTypedMemory"
    - from: "apps/backend-ts/src/memory/manager.ts"
      to: "apps/backend-ts/src/memory/extractor.ts"
      via: "import type { Extraction } from './extractor.js'"
      pattern: "Extraction"
---

<objective>
Add `addTypedMemory()` and `queryMemoriesByType()` to MemoryVectors, then add `llm` field and `saveTypedMemory()` to MemoryManager. These are the write/read primitives that the ChatSession wiring (Plan P03) will use.

Purpose: Build the persistence bridge between Extraction objects (from extractor.ts) and the typed ChromaDB collections + SQLite table (from Phase 35). Plans P01 and P03 are independent of each other — this plan is the glue between extraction and call-site wiring.

Output: MemoryVectors with 2 new methods, MemoryManager with llm field + saveTypedMemory(). Tests confirming collection routing and dual-write behavior.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/36-memory-writer/36-P01-SUMMARY.md

@apps/backend-ts/src/memory/vectors.ts
@apps/backend-ts/src/memory/manager.ts
@apps/backend-ts/src/memory/store.ts
@apps/backend-ts/src/memory/extractor.ts
@apps/backend-ts/test/memory/store-typed.test.ts
@apps/backend-ts/test/memory/consistency-check.test.ts
</context>

<interfaces>
<!-- Key contracts the executor needs. Extracted from Phase 35 + Plan P01 artifacts. -->

From apps/backend-ts/src/memory/vectors.ts (existing):
```typescript
export interface QueryResult {
  id: string;
  document: string;
  similarity: number; // 1 - cosine_distance, in [0, 1]
  metadata?: Record<string, unknown>;
}

export class MemoryVectors {
  private typedCollections: Map<string, Collection> = new Map();
  private typedInitPromise: Promise<void> | null = null;
  private async initTypedCollections(): Promise<void>  // already exists — call it
  async getAllDocIds(): Promise<Set<string>>            // already exists
  async addMemory(docId, text, metadata?): Promise<void>  // pattern to follow
  async queryMemories(queryText, nResults?, threshold?): Promise<QueryResult[]>  // pattern to follow
}
// embedText is imported at top: import { embedText, EMBEDDING_MODEL } from './embeddings.js';
// Array.from(vec) converts Float32Array to plain number[] for ChromaDB
// collection.upsert({ ids, documents, embeddings, metadatas }) — upsert pattern
// collection.query({ queryEmbeddings, nResults }) — query pattern
```

From apps/backend-ts/src/memory/manager.ts (existing):
```typescript
export interface MemoryManagerOptions {
  dbPath?: string;
  chromaPath?: string;
  vectorsOptions?: MemoryVectorsOptions;
  recallTopK?: number;
  recallThreshold?: number;
  // ADD: llm?: BaseChatModel
}

export class MemoryManager {
  readonly store: MemoryStore;   // already public readonly (Phase 35)
  readonly vectors: MemoryVectors; // already public readonly (Phase 35)
  private readonly recallTopK: number;
  private readonly recallThreshold: number;
  // ADD: readonly llm: BaseChatModel | undefined
}
```

From apps/backend-ts/src/memory/extractor.ts (P01):
```typescript
export type Extraction = z.infer<typeof extractionSchema>;
// Extraction is one of:
//   { type: 'semantic', content: string, confidence: number }
//   { type: 'episodic', content: string, confidence: number }
//   { type: 'procedural', content: string, confidence: number }
```

From apps/backend-ts/src/memory/store.ts (Phase 35):
```typescript
export interface TypedMemoryEntry {
  id: string;
  conversationId: number;
  type: 'semantic' | 'episodic' | 'procedural';
  content: string;
  confidence?: number;
  extractedAt: string;
  sourceId?: number;
  source?: string;
  createdAt: string;
}
saveTypedMemory(memory: TypedMemoryEntry): void   // already exists
```
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add addTypedMemory() + queryMemoriesByType() to MemoryVectors</name>
  <files>apps/backend-ts/src/memory/vectors.ts, apps/backend-ts/test/memory/vectors-typed.test.ts</files>
  <read_first>
    - apps/backend-ts/src/memory/vectors.ts (read the FULL file — must understand initTypedCollections(), existing addMemory() pattern, embedText usage, upsert/query call shape)
    - apps/backend-ts/test/memory/consistency-check.test.ts (mock pattern for MemoryVectors in tests — how to avoid real ChromaDB)
    - apps/backend-ts/test/memory/store-typed.test.ts (test file structure to follow)
  </read_first>
  <behavior>
    - addTypedMemory(docId, text, type, metadata?): calls initTypedCollections(), gets collection by type, calls embedText(text), upserts with ids/documents/embeddings/metadatas
    - addTypedMemory: on error → console.warn('[vectors] addTypedMemory {type} failed: {message}') and swallows (MEM-05)
    - queryMemoriesByType(userText, type, topK=5): calls initTypedCollections(), gets collection by type, queries with queryEmbeddings + nResults=topK, maps results to QueryResult[]
    - queryMemoriesByType: similarity = 1 - distance (same as queryMemories())
    - queryMemoriesByType: on error → console.warn and return [] (MEM-05)
    - queryMemoriesByType: handles empty collection (count=0) gracefully — check collection.count() before querying
    - Test 1: addTypedMemory routes to correct collection key (mock initTypedCollections, verify correct collection.upsert called)
    - Test 2: addTypedMemory on unknown collection type logs warn and returns (no throw)
    - Test 3: queryMemoriesByType maps results correctly (similarity = 1 - distance)
    - Test 4: queryMemoriesByType returns [] on error (swallowed)
  </behavior>
  <action>
    STEP 1 — Write the test file first (RED):
    Create `apps/backend-ts/test/memory/vectors-typed.test.ts`.

    Test structure: Use vi.spyOn or a manually constructed mock MemoryVectors with overridden initTypedCollections and typedCollections Map. Pattern from consistency-check.test.ts: construct a partial mock with only the methods needed.

    Mock collection factory:
    ```typescript
    function makeMockCollection(docs: string[] = [], ids: string[] = [], distances: number[] = []) {
      return {
        upsert: vi.fn().mockResolvedValue(undefined),
        query: vi.fn().mockResolvedValue({
          ids: [ids],
          documents: [docs],
          distances: [distances],
          metadatas: [ids.map(() => ({}))],
        }),
        count: vi.fn().mockResolvedValue(docs.length),
      };
    }
    ```

    Test structure:
    ```typescript
    describe('MemoryVectors.addTypedMemory', () => {
      it('calls upsert on the semantic collection', ...)
      it('logs warn and does not throw when collection throws', ...)
    });

    describe('MemoryVectors.queryMemoriesByType', () => {
      it('maps query results to QueryResult[] with similarity = 1 - distance', ...)
      it('returns [] on error without throwing', ...)
    });
    ```

    Run tests — they FAIL because methods do not exist yet. Commit: `✅ test(36-P02): add failing tests for MemoryVectors typed methods`

    STEP 2 — Implement the methods in vectors.ts (GREEN):
    Add these two methods to the MemoryVectors class, AFTER the `getAllDocIds()` method (around line 210):

    ```typescript
    /**
     * Write a typed memory to the appropriate ChromaDB collection.
     * Routes by type: 'semantic' → memories_semantic, etc.
     * Errors are logged and swallowed (MEM-05 parity). Never throws.
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
     * Query a single typed collection by semantic similarity.
     * Used by Phase 37 (Context Builder) for top-k retrieval.
     * Returns [] on error (MEM-05 parity). Never throws.
     */
    async queryMemoriesByType(
      userText: string,
      type: 'semantic' | 'episodic' | 'procedural',
      topK = 5,
    ): Promise<QueryResult[]> {
      try {
        await this.initTypedCollections();
        const collection = this.typedCollections.get(type);
        if (!collection) return [];

        const count = await collection.count();
        if (count === 0) return [];

        const actualN = Math.min(topK, count);
        const vec = await embedText(userText);
        const results = await collection.query({
          queryEmbeddings: [Array.from(vec)],
          nResults: actualN,
        });

        const ids = results.ids?.[0] ?? [];
        const docs = results.documents?.[0] ?? [];
        const dists = results.distances?.[0] ?? [];
        const metas = results.metadatas?.[0] ?? [];

        const out: QueryResult[] = [];
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          const doc = docs[i];
          const dist = dists[i];
          if (id === undefined || doc === null || doc === undefined || dist === null || dist === undefined) continue;
          const similarity = 1 - dist;
          const meta = metas[i];
          out.push({
            id,
            document: doc,
            similarity,
            metadata: meta === null || meta === undefined ? undefined : (meta as Record<string, unknown>),
          });
        }
        return out;
      } catch (err) {
        console.warn(`[vectors] queryMemoriesByType ${type} failed: ${(err as Error).message}`);
        return [];
      }
    }
    ```

    NOTE: `initTypedCollections()` is currently `private` in vectors.ts. Do NOT change its visibility. The tests must mock the internals (typedCollections Map) directly or use a subclass approach for testing.

    Run tests: `cd apps/backend-ts && npx vitest run test/memory/vectors-typed.test.ts`
    EXPECTED: 4 tests pass.
    Commit: `✨ feat(36-P02): add addTypedMemory + queryMemoriesByType to MemoryVectors`
  </action>
  <verify>
    <automated>cd /Users/biellil/Documents/GitHub/jarvis/apps/backend-ts && npx vitest run test/memory/vectors-typed.test.ts 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "async addTypedMemory" apps/backend-ts/src/memory/vectors.ts` returns 1 line
    - `grep -n "async queryMemoriesByType" apps/backend-ts/src/memory/vectors.ts` returns 1 line
    - `grep -n "addTypedMemory.*failed\|queryMemoriesByType.*failed" apps/backend-ts/src/memory/vectors.ts` returns 2 lines (error handling present)
    - `cd apps/backend-ts && npx vitest run test/memory/vectors-typed.test.ts` exits 0 with 4 tests passing
    - 2 atomic commits present: RED (test stubs) + GREEN (implementation)
  </acceptance_criteria>
  <done>addTypedMemory() and queryMemoriesByType() on MemoryVectors. 4 tests passing. MEM-05 error handling present.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add llm field + saveTypedMemory() to MemoryManager</name>
  <files>apps/backend-ts/src/memory/manager.ts, apps/backend-ts/test/memory/manager-typed.test.ts</files>
  <read_first>
    - apps/backend-ts/src/memory/manager.ts (read the FULL file — understand MemoryManagerOptions, constructor, all existing methods)
    - apps/backend-ts/src/memory/extractor.ts (Extraction type — saveTypedMemory accepts Extraction)
    - apps/backend-ts/src/memory/store.ts (TypedMemoryEntry shape — saveTypedMemory maps Extraction to TypedMemoryEntry)
    - apps/backend-ts/test/memory/store-typed.test.ts (pattern: createStoreForTests(), beforeEach/afterEach cleanup)
  </read_first>
  <behavior>
    - MemoryManagerOptions gains `llm?: BaseChatModel` field (optional — callers without LLM still work)
    - MemoryManager gains `readonly llm: BaseChatModel | undefined` field
    - MemoryManager.saveTypedMemory(convId: number | null, extraction: Extraction): dual-writes SQLite + ChromaDB
    - saveTypedMemory: if convId is null → return immediately (no write)
    - saveTypedMemory: generates `memId = conv-${convId}-${extraction.type}-${Date.now()}`
    - saveTypedMemory: calls `this.store.saveTypedMemory(entry)` with TypedMemoryEntry shape
    - saveTypedMemory: calls `await this.vectors.addTypedMemory(memId, extraction.content, extraction.type, metadata)` where metadata = { convId: String(convId), type: extraction.type, confidence: String(extraction.confidence) }
    - saveTypedMemory: wraps in try/catch → console.warn(`MemoryManager.saveTypedMemory failed: ...`) on error, never throws
    - Test 1: saveTypedMemory with convId=null returns immediately (store.saveTypedMemory NOT called)
    - Test 2: saveTypedMemory with valid convId calls store.saveTypedMemory once with correct TypedMemoryEntry shape
    - Test 3: saveTypedMemory with valid convId calls vectors.addTypedMemory with correct type routing
    - Test 4: saveTypedMemory logs warn and does not throw when store.saveTypedMemory throws
  </behavior>
  <action>
    STEP 1 — Write the test file first (RED):
    Create `apps/backend-ts/test/memory/manager-typed.test.ts`.

    Use vi.fn() mocks for store.saveTypedMemory and vectors.addTypedMemory. Construct MemoryManager with overridden internals:
    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest';
    import type { Extraction } from '../../src/memory/extractor.js';
    import { MemoryManager } from '../../src/memory/manager.js';

    // Mock the entire store + vectors to avoid real DB/ChromaDB
    const mockStore = { saveTypedMemory: vi.fn() };
    const mockVectors = { addTypedMemory: vi.fn().mockResolvedValue(undefined) };

    function makeManager(): MemoryManager {
      // Construct with undefined opts so no real DB opened
      const mgr = new MemoryManager({});
      // Inject mocks directly (store and vectors are public readonly from Phase 35)
      Object.assign(mgr, { store: mockStore, vectors: mockVectors });
      return mgr;
    }
    ```

    Test cases (4 tests):
    - Test 1: `it('returns immediately when convId is null', async () => { ... })` — pass convId=null, extraction={...}, verify mockStore.saveTypedMemory NOT called
    - Test 2: `it('calls store.saveTypedMemory with correct TypedMemoryEntry', async () => { ... })` — check id matches `conv-${convId}-${type}-`, type matches, content matches
    - Test 3: `it('calls vectors.addTypedMemory with correct type', async () => { ... })` — check second arg is extraction.content, third arg is extraction.type
    - Test 4: `it('logs warn and does not throw when store.saveTypedMemory throws', async () => { ... })` — mockStore.saveTypedMemory = vi.fn().mockImplementation(() => { throw new Error('db error'); }), expect no throw

    Run tests — FAIL (saveTypedMemory does not exist). Commit: `✅ test(36-P02): add failing tests for MemoryManager.saveTypedMemory`

    STEP 2 — Implement changes in manager.ts (GREEN):

    1. Add to imports at top:
    ```typescript
    import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
    import type { Extraction } from './extractor.js';
    ```

    2. Add `llm?: BaseChatModel` to MemoryManagerOptions interface:
    ```typescript
    export interface MemoryManagerOptions {
      dbPath?: string;
      chromaPath?: string;
      vectorsOptions?: MemoryVectorsOptions;
      recallTopK?: number;
      recallThreshold?: number;
      llm?: BaseChatModel;  // ADD THIS LINE
    }
    ```

    3. Add `readonly llm: BaseChatModel | undefined` to MemoryManager class (after `readonly vectors` line):
    ```typescript
    export class MemoryManager {
      readonly store: MemoryStore;
      readonly vectors: MemoryVectors;
      readonly llm: BaseChatModel | undefined;  // ADD THIS LINE
      private readonly recallTopK: number;
      private readonly recallThreshold: number;
    ```

    4. Add `this.llm = opts.llm;` in constructor after the `this.vectors` line:
    ```typescript
    constructor(opts: MemoryManagerOptions = {}) {
      this.store = new MemoryStore(opts.dbPath);
      this.vectors = new MemoryVectors(opts.vectorsOptions ?? {});
      this.llm = opts.llm;  // ADD THIS LINE
      this.recallTopK = opts.recallTopK ?? 5;
      this.recallThreshold = opts.recallThreshold ?? 0.5;
    }
    ```

    5. Add saveTypedMemory() method to MemoryManager class, BEFORE the `close()` method:
    ```typescript
    /**
     * Persist extracted memory to both SQLite (store.saveTypedMemory) and
     * ChromaDB (vectors.addTypedMemory). Called from background extraction (Phase 36-P03).
     * Errors are caught and logged — never throws (MEMW-03 parity).
     */
    async saveTypedMemory(convId: number | null, extraction: Extraction): Promise<void> {
      if (convId === null) return;

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
          sourceId: undefined,   // Phase 36: source_id left null (per STATE.md decision)
          createdAt: now,
        });

        await this.vectors.addTypedMemory(memId, extraction.content, extraction.type, {
          convId: String(convId),
          type: extraction.type,
          confidence: String(extraction.confidence),
        });
      } catch (err) {
        console.warn(`MemoryManager.saveTypedMemory failed: ${(err as Error).message}`);
      }
    }
    ```

    Run tests: `cd apps/backend-ts && npx vitest run test/memory/manager-typed.test.ts`
    EXPECTED: 4 tests pass.
    Commit: `✨ feat(36-P02): add llm field + saveTypedMemory to MemoryManager`
  </action>
  <verify>
    <automated>cd /Users/biellil/Documents/GitHub/jarvis/apps/backend-ts && npx vitest run test/memory/manager-typed.test.ts 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "readonly llm" apps/backend-ts/src/memory/manager.ts` returns 1 line with `BaseChatModel | undefined`
    - `grep -n "llm\?: BaseChatModel" apps/backend-ts/src/memory/manager.ts` returns 1 line in MemoryManagerOptions
    - `grep -n "async saveTypedMemory" apps/backend-ts/src/memory/manager.ts` returns 1 line
    - `grep -n "MemoryManager.saveTypedMemory failed" apps/backend-ts/src/memory/manager.ts` returns 1 line (MEM-05 error handling)
    - `grep -n "sourceId: undefined" apps/backend-ts/src/memory/manager.ts` returns 1 line (source_id left null per decision)
    - `cd apps/backend-ts && npx vitest run test/memory/manager-typed.test.ts` exits 0 with 4 tests passing
    - 2 atomic commits: RED (test stubs) + GREEN (implementation)
  </acceptance_criteria>
  <done>MemoryManager has readonly llm field + saveTypedMemory() that dual-writes SQLite + ChromaDB. 4 tests passing. source_id left null per STATE.md decision.</done>
</task>

</tasks>

<verification>
Full P02 verification:
- `cd /Users/biellil/Documents/GitHub/jarvis/apps/backend-ts && npx vitest run test/memory/vectors-typed.test.ts test/memory/manager-typed.test.ts` exits 0 with 8/8 passing
- `grep -n "addTypedMemory\|queryMemoriesByType" apps/backend-ts/src/memory/vectors.ts` returns 4+ lines (declarations + calls)
- `grep -n "saveTypedMemory\|readonly llm" apps/backend-ts/src/memory/manager.ts` returns 3+ lines
- Full test suite still passes: `cd apps/backend-ts && npx vitest run` exits 0 (pre-existing manager.test.ts failure excluded from scope per Phase 35-P01-SUMMARY)
</verification>

<success_criteria>
- MemoryVectors has addTypedMemory() routing to correct typed collection by type
- MemoryVectors has queryMemoriesByType() returning QueryResult[] from the correct collection
- MemoryManager has llm?: BaseChatModel option + readonly llm field
- MemoryManager.saveTypedMemory() dual-writes to SQLite and ChromaDB in a single try/catch (never throws)
- 8 tests passing across both test files
- 4 atomic commits: 2x RED + 2x GREEN
</success_criteria>

<output>
After completion, create `.planning/phases/36-memory-writer/36-P02-SUMMARY.md` following the template at `@$HOME/.claude/get-shit-done/templates/summary.md`
</output>
