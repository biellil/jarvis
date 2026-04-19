---
phase: 35-schema-type-foundation
plan: P02
type: execute
wave: 2
depends_on:
  - 35-P01
files_modified:
  - apps/backend-ts/src/memory/store.ts
  - apps/backend-ts/src/memory/vectors.ts
  - apps/backend-ts/src/index.ts
  - apps/backend-ts/test/memory/store-typed.test.ts
  - apps/backend-ts/test/memory/consistency-check.test.ts
autonomous: true
requirements:
  - MTYPE-05
  - REL-02

must_haves:
  truths:
    - "MemoryStore.saveTypedMemory() persists a row to typed_memories and getTypedMemories() retrieves it"
    - "MemoryStore.getAllTypedMemories() returns all typed_memory rows across all conversations"
    - "MemoryVectors initializes 3 separate ChromaDB collections: memories_semantic, memories_episodic, memories_procedural"
    - "MemoryVectors.getAllDocIds() returns a Set<string> containing IDs from all 3 collections"
    - "On startup, validateMemoryConsistency() runs in the background (void, non-blocking) and logs WARN for SQLite rows missing in ChromaDB"
    - "validateMemoryConsistency() does NOT throw — errors are caught and logged"
    - "All vitest tests for store-typed and consistency-check pass"
  artifacts:
    - path: "apps/backend-ts/src/memory/store.ts"
      provides: "saveTypedMemory(), getTypedMemories(), getAllTypedMemories() methods on MemoryStore"
      contains: "saveTypedMemory"
    - path: "apps/backend-ts/src/memory/vectors.ts"
      provides: "getAllDocIds(), addTypedMemory(), queryMemoriesByType() — typed collection support"
      contains: "getAllDocIds"
    - path: "apps/backend-ts/src/index.ts"
      provides: "void validateMemoryConsistency() call after server ready"
      contains: "validateMemoryConsistency"
    - path: "apps/backend-ts/test/memory/store-typed.test.ts"
      provides: "Tests for saveTypedMemory, getTypedMemories, getAllTypedMemories"
    - path: "apps/backend-ts/test/memory/consistency-check.test.ts"
      provides: "Tests for validateMemoryConsistency with mocked ChromaDB"
  key_links:
    - from: "apps/backend-ts/src/memory/store.ts"
      to: "apps/backend-ts/src/memory/schema.ts"
      via: "imports typedMemories, typedMemoriesEnum from schema.js"
      pattern: "import.*typedMemories.*schema"
    - from: "apps/backend-ts/src/index.ts"
      to: "apps/backend-ts/src/memory/store.ts + vectors.ts"
      via: "void validateMemoryConsistency(memoryManager.store, memoryManager.vectors)"
      pattern: "void validateMemoryConsistency"
---

<objective>
Add typed memory persistence methods to MemoryStore, add typed ChromaDB collection support to MemoryVectors, and wire the non-blocking consistency check into the server startup sequence.

Purpose: REL-02 requires that SQLite and ChromaDB use a shared source_id, with a startup consistency check logging mismatches. MTYPE-05 also requires the storage-layer methods that Phase 36 will call when writing extracted memories.

Output: store.ts + vectors.ts extended with typed-memory APIs, consistency check wired in index.ts (non-blocking), two test files green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/35-schema-type-foundation/35-RESEARCH.md
@.planning/phases/35-schema-type-foundation/35-P01-SUMMARY.md

<interfaces>
From apps/backend-ts/src/memory/store.ts (key existing patterns):
```typescript
// MemoryStore constructor pattern:
constructor(dbPath?: string)  // dbPath = test isolation; no arg = production default DB

// Existing method shape (MEM-05: errors caught and logged, never thrown):
saveMessages(convId: number, msgs: MessageInput[]): void {
  try { this.db.insert(messages).values(...).run(); }
  catch (exc) { console.warn(`MemoryStore.saveMessages failed: ...`); }
}

// createStoreForTests(dbPath) returns { db: Drizzle, sqlite: Database.Database }
// Tests use new MemoryStore(dbPath) — constructor auto-runs migrations
```

From apps/backend-ts/src/memory/schema.ts (after P01 — these now exist):
```typescript
export const typedMemoriesEnum = ['semantic', 'episodic', 'procedural'] as const;
export const typedMemories = sqliteTable('typed_memories', {
  id: text('id').primaryKey(),
  conversationId: integer('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  type: text('type', { enum: typedMemoriesEnum }).notNull(),
  content: text('content').notNull(),
  confidence: real('confidence'),
  extractedAt: text('extracted_at').notNull(),
  sourceId: integer('source_id').references(() => messages.id, { onDelete: 'set null' }),
  source: text('source'),
  createdAt: text('created_at').notNull(),
});
```

From apps/backend-ts/src/memory/vectors.ts (existing MemoryVectors class):
```typescript
export class MemoryVectors {
  private client: ChromaClient | null = null;
  private collection: Collection | null = null;
  // init() uses getOrCreateCollection({ name: 'jarvis_memories', embeddingFunction: null })
  // addMemory(docId, text, metadata?): Promise<void>  — upserts to single collection
  // queryMemories(queryText, nResults, threshold?): Promise<QueryResult[]>
}
export const COLLECTION_NAME = 'jarvis_memories';
```

From apps/backend-ts/src/index.ts (startup sequence to hook into):
```typescript
// Step 4: Run database migrations
runMigrations();

// Step 5: Bootstrap ChatSession (creates MemoryManager which contains store + vectors)
const memory = new MemoryManager();
const session = await ChatSession.create({ llm, memory });

// Step 6: Start Express server — app.listen callback is the right place to fire
//         validateMemoryConsistency() since all deps are initialized here
app.listen(config.backendPort, () => {
  console.log(`🚀 Backend-TS listening on port ...`);
  // ADD: void validateMemoryConsistency(...)  <-- place here
});
```

From apps/backend-ts/src/memory/manager.ts (MemoryManager provides store and vectors):
```typescript
// Check what properties MemoryManager exposes — read this file before implementing
// Likely: manager.store: MemoryStore, manager.vectors: MemoryVectors
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write Wave 0 test stubs for store-typed and consistency-check (RED)</name>
  <files>
    apps/backend-ts/test/memory/store-typed.test.ts
    apps/backend-ts/test/memory/consistency-check.test.ts
  </files>

  <read_first>
    - apps/backend-ts/test/memory/tool-logger.test.ts (import pattern, beforeEach/afterEach with tmpdir)
    - apps/backend-ts/src/memory/store.ts (MemoryStore interface — what saveTypedMemory will look like)
    - apps/backend-ts/src/memory/vectors.ts (MemoryVectors interface — getAllDocIds does not exist yet)
    - apps/backend-ts/src/memory/schema.ts (confirm typedMemories is exported after P01)
  </read_first>

  <behavior>
    store-typed.test.ts behaviors:
    - "saveTypedMemory persists a row to typed_memories" — create MemoryStore(dbPath), create conversation, call saveTypedMemory({id:'tm-01', conversationId: convId, type:'semantic', content:'test memory', extractedAt: iso, createdAt: iso}), then use raw better-sqlite3 to SELECT COUNT(*) FROM typed_memories WHERE id='tm-01', expect count=1
    - "getTypedMemories returns rows for the given conversation and type" — save 2 semantic + 1 episodic rows, getTypedMemories(convId, 'semantic'), expect array length 2, each has type='semantic'
    - "getTypedMemories returns empty array when no rows match" — call getTypedMemories(convId, 'procedural') with no procedural rows, expect []
    - "getAllTypedMemories returns all rows across conversations" — create 2 conversations, save 1 memory per conv, getAllTypedMemories(), expect length 2
    - "saveTypedMemory with null sourceId succeeds" — save with no sourceId field, expect no throw, row exists in DB
    - "saveTypedMemory swallows DB errors (MEM-05)" — this is covered by the try/catch in the implementation; skip if hard to test

    consistency-check.test.ts behaviors (mock-based, no real ChromaDB needed):
    - "validateMemoryConsistency logs WARN when SQLite rows missing from ChromaDB" — create MemoryStore with 2 typed_memories rows, provide fake getAllDocIds() returning Set with only 1 ID, call validateMemoryConsistency(store, fakeVectors), capture console.warn spy, expect warn to contain "[consistency check]" and "1" (1 mismatch)
    - "validateMemoryConsistency does not throw when ChromaDB errors" — fakeVectors.getAllDocIds() rejects with Error('ChromaDB unavailable'), call validateMemoryConsistency(store, fakeVectors), expect function to resolve (not throw/reject), expect console.warn called with "validation failed"
    - "validateMemoryConsistency logs OK when all SQLite rows are in ChromaDB" — store has 1 typed_memory, getAllDocIds returns Set with that ID, run check, expect console.warn NOT called (or called with "consistency OK")

    Use vitest's vi.spyOn(console, 'warn') for the warn assertions. Import validateMemoryConsistency from '../../src/memory/consistency.js' (the function will be extracted to its own file in Task 2).
  </behavior>

  <action>
    Create store-typed.test.ts following the exact pattern of test/memory/tool-logger.test.ts:
    - tmpdir setup in beforeEach/afterEach
    - new MemoryStore(dbPath) for each test
    - store.close() in afterEach
    - Import TypedMemoryEntry interface from '../../src/memory/store.js'

    For saveTypedMemory calls, use this shape (matches interface to be created in Task 2):
    ```typescript
    const entry: TypedMemoryEntry = {
      id: 'tm-01',
      conversationId: convId,
      type: 'semantic',
      content: 'User prefers dark mode',
      extractedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    store.saveTypedMemory(entry);
    ```

    For consistency-check.test.ts, create a minimal fake vectors object:
    ```typescript
    const fakeVectors = {
      getAllDocIds: vi.fn<[], Promise<Set<string>>>(),
    };
    ```
    Import validateMemoryConsistency from '../../src/memory/consistency.js'.

    Run to confirm RED (tests found but failing):
    `pnpm --filter backend-ts test -- test/memory/store-typed.test.ts test/memory/consistency-check.test.ts`
  </action>

  <verify>
    <automated>pnpm --filter backend-ts test -- test/memory/store-typed.test.ts test/memory/consistency-check.test.ts 2>&1 | tail -15</automated>
  </verify>

  <acceptance_criteria>
    - Both test files exist at apps/backend-ts/test/memory/{store-typed,consistency-check}.test.ts
    - Running the test command shows FAIL (not "no tests found")
    - grep "saveTypedMemory" apps/backend-ts/test/memory/store-typed.test.ts returns at least 3 matches
    - grep "validateMemoryConsistency" apps/backend-ts/test/memory/consistency-check.test.ts returns at least 3 matches
  </acceptance_criteria>
  <done>See acceptance_criteria above.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement typed store methods, ChromaDB typed collections, consistency check + startup wire (GREEN)</name>
  <files>
    apps/backend-ts/src/memory/store.ts
    apps/backend-ts/src/memory/vectors.ts
    apps/backend-ts/src/memory/consistency.ts
    apps/backend-ts/src/index.ts
  </files>

  <read_first>
    - apps/backend-ts/src/memory/store.ts (MUST READ — append methods, preserve all existing methods)
    - apps/backend-ts/src/memory/vectors.ts (MUST READ — append methods, preserve existing init/addMemory/queryMemories)
    - apps/backend-ts/src/memory/schema.ts (confirm typedMemories + typedMemoriesEnum exported)
    - apps/backend-ts/src/memory/manager.ts (MUST READ — understand how store and vectors are exposed)
    - apps/backend-ts/src/index.ts (MUST READ — find correct hook point after server starts)
    - .planning/phases/35-schema-type-foundation/35-RESEARCH.md (consistency check pattern, pitfall 5 about deadlock)
  </read_first>

  <behavior>
    After Task 2, all 5 test files must be GREEN (3 from P01 + 2 from this task).

    store.ts additions (append to MemoryStore class, after existing methods):
    - Export TypedMemoryEntry interface
    - saveTypedMemory(memory: TypedMemoryEntry): void — Drizzle insert into typedMemories, catch+warn pattern (MEM-05)
    - getTypedMemories(convId: number, type: string, limit?: number): TypedMemoryEntry[] — Drizzle select with where(and(eq(conversationId), eq(type))).orderBy(desc(createdAt)).limit(limit ?? 10).all()
    - getAllTypedMemories(): TypedMemoryEntry[] — Drizzle select all from typedMemories

    vectors.ts additions (add to MemoryVectors class):
    - Add private typedCollections map: `private typedCollections: Map<string, Collection> = new Map()`
    - initTypedCollections(): Promise<void> — lazy, calls getOrCreateCollection for 'memories_semantic', 'memories_episodic', 'memories_procedural' with metadata.type = type name and embeddingFunction: null
    - getAllDocIds(): Promise<Set<string>> — await initTypedCollections(), iterate all 3 collections, call collection.get() on each, union all IDs into a Set<string>, return it. Catch+warn, return empty Set on error.
    - Note: the existing single 'jarvis_memories' collection and all its methods MUST remain unchanged — typed collections are ADDITIVE

    consistency.ts (new file — standalone function, easier to test):
    ```typescript
    import type { MemoryStore } from './store.js';
    import type { MemoryVectors } from './vectors.js';

    export async function validateMemoryConsistency(
      store: MemoryStore,
      vectors: MemoryVectors,
    ): Promise<void> {
      try {
        const sqliteMemories = store.getAllTypedMemories();
        const chromadbIds = await vectors.getAllDocIds();
        const mismatches = sqliteMemories.filter(m => !chromadbIds.has(m.id));
        if (mismatches.length > 0) {
          console.warn(`[consistency check] Found ${mismatches.length} typed_memories in SQLite but missing in ChromaDB:`);
          mismatches.slice(0, 10).forEach(m => console.warn(`  - ${m.id}`));
          if (mismatches.length > 10) console.warn(`  ... and ${mismatches.length - 10} more`);
        } else {
          console.log('[consistency check] typed_memories consistency OK');
        }
      } catch (err) {
        console.warn(`[consistency check] validation failed: ${(err as Error).message}`);
      }
    }
    ```

    index.ts change: after the server starts (inside app.listen callback), add:
    ```typescript
    void validateMemoryConsistency(memory.store, memory.vectors).catch(() => {});
    // Note: the .catch is a safety net; validateMemoryConsistency already catches internally
    ```
    Import validateMemoryConsistency at top of index.ts.

    IMPORTANT: check manager.ts to find the actual property names for store and vectors (may be `memory.store` and `memory.vectors`, or may need a different accessor). Read manager.ts before modifying index.ts.
  </behavior>

  <action>
    Step 1 — Modify store.ts:
    Add import: `import { typedMemories } from './schema.js';` (add typedMemories to the existing named import from schema.js)
    Add import: `import { and, eq, desc } from 'drizzle-orm';`

    Add TypedMemoryEntry interface before the MemoryStore class:
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
    ```

    Append three methods at the end of the MemoryStore class body (before the closing brace):
    saveTypedMemory, getTypedMemories, getAllTypedMemories — as specified in behavior.

    Step 2 — Modify vectors.ts:
    Add `private typedCollections: Map<string, Collection> = new Map();` property after existing class properties.
    Append initTypedCollections() and getAllDocIds() methods to the end of the MemoryVectors class.
    Do NOT modify init(), addMemory(), or queryMemories().

    Step 3 — Create consistency.ts as shown in behavior.

    Step 4 — Modify index.ts:
    Add `import { validateMemoryConsistency } from './memory/consistency.js';` at top.
    Inside app.listen callback, after the console.log lines, add:
    ```typescript
    void validateMemoryConsistency(memory.store, memory.vectors).catch(() => {});
    ```
    If MemoryManager does not expose .store and .vectors directly (check manager.ts), add getters or access via the session object.

    Step 5 — Run tests:
    `pnpm --filter backend-ts test -- test/memory/`
    ALL 5 test files must be GREEN.

    Step 6 — Run full suite:
    `pnpm --filter backend-ts test`
    Expect 0 failures.

    Step 7 — TypeScript compile check:
    `pnpm --filter backend-ts build`
    Expect 0 errors.
  </action>

  <verify>
    <automated>pnpm --filter backend-ts test -- test/memory/ 2>&1 | tail -15 && pnpm --filter backend-ts build 2>&1 | tail -10</automated>
  </verify>

  <acceptance_criteria>
    - grep "saveTypedMemory" apps/backend-ts/src/memory/store.ts returns at least 2 matches (interface + method)
    - grep "getAllDocIds" apps/backend-ts/src/memory/vectors.ts returns at least 1 match
    - apps/backend-ts/src/memory/consistency.ts exists and grep "validateMemoryConsistency" returns at least 1 match
    - grep "validateMemoryConsistency" apps/backend-ts/src/index.ts returns 1 match (the void call)
    - pnpm --filter backend-ts test -- test/memory/ exits 0 (all 5 test files pass)
    - pnpm --filter backend-ts test exits 0 (full suite, no regressions)
    - pnpm --filter backend-ts build exits 0 (no TypeScript compile errors)
  </acceptance_criteria>
  <done>See acceptance_criteria above.</done>
</task>

</tasks>

<verification>
After both tasks complete:

1. Store methods: `grep -c "saveTypedMemory\|getTypedMemories\|getAllTypedMemories" apps/backend-ts/src/memory/store.ts` returns >= 4
2. Vectors methods: `grep "getAllDocIds\|initTypedCollections" apps/backend-ts/src/memory/vectors.ts` returns matches
3. Consistency function exists: `cat apps/backend-ts/src/memory/consistency.ts | grep "validateMemoryConsistency"` returns a match
4. Startup wired: `grep "validateMemoryConsistency" apps/backend-ts/src/index.ts` returns a match
5. All 5 test files pass: `pnpm --filter backend-ts test -- test/memory/` exits 0
6. Full suite passes: `pnpm --filter backend-ts test` exits 0
7. TypeScript clean: `pnpm --filter backend-ts build` exits 0
</verification>

<success_criteria>
- MemoryStore has saveTypedMemory, getTypedMemories, getAllTypedMemories methods (Phase 36 write path is unblocked)
- MemoryVectors has getAllDocIds() for all 3 typed collections (consistency check can query ChromaDB)
- validateMemoryConsistency() runs non-blocking on startup (void, no await in main path)
- Mismatches between SQLite and ChromaDB are logged as WARN with clear message (REL-02)
- Errors in consistency check are caught — app startup never fails due to this check
- All tests pass, TypeScript compiles clean
</success_criteria>

<output>
After completion, create `.planning/phases/35-schema-type-foundation/35-P02-SUMMARY.md`
</output>
