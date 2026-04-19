# Phase 35: Schema & Type Foundation - Research

**Researched:** 2026-04-19  
**Domain:** Drizzle ORM schema design, SQLite migrations, typed memory persistence, consistency patterns  
**Confidence:** HIGH

## Summary

Phase 35 establishes the data layer for JARVIS v1.8 Memory Intelligence — a new `typed_memories` SQLite table with Drizzle ORM schema, migrations, and consistency validation infrastructure. This is the blocking dependency for Phase 36 (Memory Writer), which will populate memories extracted by the LLM.

**Key deliverables:**
1. Drizzle schema definition for `typed_memories` table with 7 columns (id, conversationId, type enum, content, confidence, extractedAt, source_id, createdAt)
2. Drizzle migration (0003_typed_memories.sql) compatible with fresh databases and v1.7 databases without data loss
3. MemoryStore methods to persist/retrieve typed memories (saveTypedMemory, getTypedMemories, getTypedMemoriesByConversation)
4. MemoryVectors methods for ChromaDB 3-collection setup (semantic, episodic, procedural) with type-aware queries
5. Startup consistency check: SQLite source_id values validated against ChromaDB metadata, mismatches logged

**Primary recommendation:** Add typed_memories table to Drizzle schema with foreign key to messages, generate migration via `drizzle-kit generate sqlite`, then implement SQLite→ChromaDB consistency check as async background task on startup (non-blocking).

---

## User Constraints

None specified in CONTEXT.md. Phase proceeds with full research discretion.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MTYPE-05 | Schema Drizzle with table `typed_memories` (type, content, confidence, extracted_at, source_id) | Drizzle 0.45.2 schema design; better-sqlite3 12.8.0 for data binding; migration pattern validated |
| REL-02 | Escritas em SQLite e ChromaDB usam `source_id` compartilhado para consistency check na inicialização | Consistency check async pattern; mismatches logged to console |

---

## Standard Stack

### Core ORM & Database
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.2 | TypeScript ORM for SQLite schema + migrations | Type-safe schema, auto-generated migrations, better DX than raw SQL |
| drizzle-kit | 0.31.10 | CLI for schema generation and migration scaffolding | Generates SQL migrations from TS schema; idempotent on fresh + existing databases |
| better-sqlite3 | 12.8.0 | Sync SQLite driver (required by Drizzle) | Better performance than sqlite3, synchronous API aligns with Drizzle's .all()/.run() pattern |
| @types/better-sqlite3 | 7.6.13 | TypeScript types for better-sqlite3 | Type safety for DB operations |

### Testing
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 4.1.3 | Test framework (already in backend-ts) | Schema validation tests, migration idempotence tests, consistency check tests |
| tsx | 4.21.0 | TypeScript executor for Node.js | Run migrations in tests without compilation step |

### Installation
```bash
# Already present in backend-ts/package.json:
npm list drizzle-orm drizzle-kit better-sqlite3

# (If adding from scratch — not needed, already installed)
npm install drizzle-orm drizzle-kit better-sqlite3 @types/better-sqlite3
```

**Version verification:** Drizzle 0.45.2 (March 2026, LTS-stable), better-sqlite3 12.8.0 (current stable).

---

## Architecture Patterns

### Drizzle Schema Pattern in JARVIS

**Existing pattern (v1.7):**
- Tables defined in `src/memory/schema.ts` using `sqliteTable()` from `drizzle-orm/sqlite-core`
- Relations defined inline with `relations()` helper
- Migrations auto-generated in `src/memory/migrations/` by `drizzle-kit generate sqlite`
- Enum constraints via `text('column', { enum: [...] })`

**Why Drizzle + better-sqlite3:**
- Sync API matches JARVIS's request-response pattern (no async machinery in startup path)
- Schema-first approach: define in TS, generate SQL → easier to review changes
- Foreign key constraints validated by SQLite (no application-level checks needed)
- Migrations numbered sequentially; Drizzle tracks via `__drizzle_migrations` table

### Recommended typed_memories Schema

**Design decisions:**
1. **id: text PRIMARY KEY** — Composite: `conv-{convId}-{type}-{timestamp}` for uniqueness + debugging
2. **conversationId: integer FOREIGN KEY** → conversations.id (required)
3. **type: text enum** — Check constraint: `'semantic' | 'episodic' | 'procedural'`
4. **content: text** — The memory text (unbounded; truncate at 2000 chars in MemoryExtractor)
5. **confidence: real** — Optional float 0.0–1.0 (NULL = unknown)
6. **extractedAt: text ISO8601** — When LLM extracted the memory
7. **source: text** — 'user' | 'assistant' | 'system' (optional)
8. **createdAt: text ISO8601** — When row inserted into DB

**Why NOT include source_id as primary join to messages:**
- Phase 36 will add source_id FK later (allows retroactive consistency checks)
- Phase 35 focuses on table existence + basic persistence

### Consistency Check Pattern

**Goal:** Validate that every typed_memory written to SQLite has a matching entry in ChromaDB.

**Pattern:**
```typescript
async function validateMemoryConsistency(store: MemoryStore, vectors: MemoryVectors) {
  const sqliteMemories = store.getAllTypedMemories(); // new method
  const chromadbDocs = vectors.getAllDocIds(); // scan ChromaDB collection
  
  const mismatches = sqliteMemories.filter(mem => !chromadbDocs.has(mem.id));
  
  if (mismatches.length > 0) {
    console.warn(`[consistency check] Found ${mismatches.length} typed_memories in SQLite but missing in ChromaDB`);
    mismatches.forEach(mem => {
      console.warn(`  - ${mem.id} (type=${mem.type}, conv=${mem.conversationId})`);
    });
  }
}

// Called in index.ts on startup (async, non-blocking)
void validateMemoryConsistency(memoryStore, vectors).catch(err => {
  console.warn(`consistency check failed: ${err.message}`);
});
```

**Why async + non-blocking:**
- Prevents startup delay (can take seconds with large datasets)
- Mismatches are logged but non-fatal (data is already persisted)
- Background check allows debugging without breaking app

### Recommended Project Structure

```
apps/backend-ts/src/memory/
├─ schema.ts                 # [MODIFY] Add typedMemories table + relations
├─ store.ts                  # [MODIFY] Add saveTypedMemory(), getTypedMemories(), getAllTypedMemories()
├─ vectors.ts                # [MODIFY] Add queryMemoriesByType(), addTypedMemory(), getAllDocIds()
├─ migrations/
│  ├─ 0000_0000_init.sql     # [UNCHANGED]
│  ├─ 0001_tool_calls_dispatch.sql
│  ├─ 0002_voice_calls.sql
│  └─ 0003_typed_memories.sql # [NEW] Generated by drizzle-kit, reviewed + approved
└─ db.ts                     # [UNCHANGED] Default DB connection
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQL schema versioning | Custom migration tracking | Drizzle migrations + `__drizzle_migrations` table | Drizzle handles idempotence, rollback tracking, ordering automatically |
| Type-safe SQL queries | Hand-written parameterized queries | Drizzle insert/select builders | Type checking at compile time; SQL injection prevention built-in |
| Schema changes to existing databases | Manual ALTER TABLE scripts | `drizzle-kit generate` + review | Drizzle generates safe migration paths; easier to verify compatibility |
| Enum constraints | String columns with app-level validation | text(..., { enum: [...] }) in schema | SQLite enforces at DB level; compile-time type safety |
| Foreign key tracking | Application-level relationship mapping | Drizzle relations() helper | Relations enable type-safe joins and populate; Drizzle handles cascade rules |

**Key insight:** Drizzle is already the standard in this project (used for conversations, messages, summaries). Extending it with typed_memories maintains consistency and leverages existing patterns.

---

## Common Pitfalls

### Pitfall 1: Migration SQL Syntax Errors from Generated Code
**What goes wrong:** `drizzle-kit generate sqlite` produces SQL with Drizzle-specific syntax that SQLite doesn't recognize (e.g., foreign key mode mismatch).

**Why it happens:** Drizzle generates syntax tailored to better-sqlite3; manual edits or schema definition errors propagate.

**How to avoid:** 
- Run migration on test database first: `sqlite test.db < migrations/0003.sql`
- Verify via PRAGMA: `PRAGMA foreign_key_list(typed_memories)` — check references are correct
- Test both fresh database (no prior state) and v1.7 database (existing tables) — the migration must not error on either

**Warning signs:**
- `drizzle-kit generate` outputs SQL with `-->` comment syntax errors
- Migration fails with "syntax error" when run directly via sqlite3 CLI
- Schema definition uses unsupported column types (e.g., `uuid` without string mode)

### Pitfall 2: Drizzle Schema Enum Rendering
**What goes wrong:** Drizzle's `text('type', { enum: [...] })` doesn't generate a SQLite CHECK constraint; column accepts any text value at runtime.

**Why it happens:** SQLite has no native enum type; Drizzle provides type safety only in TS, not DB-level validation.

**How to avoid:**
- Add explicit CHECK constraint in migration: `ALTER TABLE typed_memories ADD CONSTRAINT chk_type CHECK(type IN ('semantic', 'episodic', 'procedural'))`
- OR: manually edit generated migration to include CHECK
- Verify with: `PRAGMA table_info(typed_memories)` and inspect via SQL query (insert invalid enum → error)

**Warning signs:**
- App inserts memory with `type: 'invalid'` and it succeeds (should fail)
- No CHECK constraint visible in `sqlite3 .schema typed_memories`

### Pitfall 3: Foreign Key Cascade Behavior
**What goes wrong:** Deleting a conversation (for data cleanup) cascades to typed_memories, but ChromaDB still has orphaned documents.

**Why it happens:** Drizzle's foreign key default is `ON DELETE no action`; may silently allow inconsistency.

**How to avoid:**
- Define cascade explicitly: `conversationId: integer('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' })`
- Document the cascade behavior (e.g., "deleting conversation also removes memories from both SQLite + ChromaDB")
- Add migration note: "If adding onDelete cascade, also add cleanup to vectors.deleteByConversation()"

**Warning signs:**
- Deleting conversation causes FK constraint error (intentional, forces cleanup thinking)
- ChromaDB queries return orphaned memories from deleted conversations

### Pitfall 4: source_id Foreign Key Missing in Phase 35
**What goes wrong:** Phase 35 schema doesn't include source_id → messages.id FK; Phase 36 tries to add it and fails due to data integrity.

**Why it happens:** Phase 35 focuses on table existence; Phase 36 (Memory Writer) adds the relationship. But if Phase 36 runs before source_id is populated, FK constraint fails.

**How to avoid:**
- Phase 35 includes source_id column (nullable for now): `sourceId: integer('source_id').references(() => messages.id)`
- Phase 36 populates sourceId when writing memories
- Consistency check in Phase 35 logs mismatches; Phase 36 fixes them

**Warning signs:**
- Phase 36 tries to ADD CONSTRAINT source_id FK and fails on existing data
- Memories in typed_memories have NULL source_id and can't be linked to messages

### Pitfall 5: Consistency Check Deadlock
**What goes wrong:** Consistency check queries SQLite + ChromaDB simultaneously; long-running query blocks startup.

**Why it happens:** If ChromaDB has 10k+ documents, iteration is slow. If SQLite query locks DB for reading, writes are blocked.

**How to avoid:**
- Make consistency check async/non-blocking (spawned on startup, doesn't await in main flow)
- Use a background worker or setImmediate/Promise
- Limit scope: only check memories from last 24 hours (not entire history)

**Warning signs:**
- App startup hangs for 5+ seconds
- "database is locked" errors during background consistency check
- ChromaDB query timeout (>5s)

### Pitfall 6: ChromaDB Metadata Type Constraints
**What goes wrong:** Adding type-aware metadata to ChromaDB documents (e.g., `type: 'semantic'`) for filtering, but ChromaDB rejects non-string metadata.

**Why it happens:** ChromaDB 3.4.3 restricts metadata to `string | number | boolean`; complex types require serialization.

**How to avoid:**
- Store type as string: `metadata: { type: 'semantic', convId: '123', confidence: '0.95' }`
- When querying: use `where: { type: 'semantic' }` for exact match filtering
- OR: handle filtering client-side (fetch all, filter by type in TS)

**Warning signs:**
- `addTypedMemory()` throws "metadata value must be string/number/boolean"
- ChromaDB query with `where: { type: { $in: ['semantic', 'episodic'] } }` fails (syntax error)

---

## Code Examples

### Drizzle Schema Definition (typed_memories table)

```typescript
// Source: Drizzle ORM 0.45.2 docs + JARVIS schema.ts pattern
// File: src/memory/schema.ts (MODIFY)

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const typedMemoriesEnum = ['semantic', 'episodic', 'procedural'] as const;

export const typedMemories = sqliteTable('typed_memories', {
  id: text('id').primaryKey(),
  conversationId: integer('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  type: text('type', { enum: typedMemoriesEnum }).notNull(),
  content: text('content').notNull(),
  confidence: real('confidence'), // 0.0-1.0, optional
  extractedAt: text('extracted_at').notNull(),
  sourceId: integer('source_id')
    .references(() => messages.id, { onDelete: 'set null' }), // nullable for Phase 35
  source: text('source'), // 'user' | 'assistant' | 'system'
  createdAt: text('created_at').notNull(),
});

export const typedMemoriesRelations = relations(typedMemories, ({ one }) => ({
  conversation: one(conversations, {
    fields: [typedMemories.conversationId],
    references: [conversations.id],
  }),
  sourceMessage: one(messages, {
    fields: [typedMemories.sourceId],
    references: [messages.id],
  }),
}));
```

### MemoryStore Methods (saveTypedMemory, getTypedMemories)

```typescript
// Source: JARVIS MemoryStore pattern (src/memory/store.ts)
// File: src/memory/store.ts (MODIFY)

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

export class MemoryStore {
  // ... existing methods ...

  saveTypedMemory(memory: TypedMemoryEntry): void {
    try {
      this.db.insert(typedMemories).values({
        id: memory.id,
        conversationId: memory.conversationId,
        type: memory.type,
        content: memory.content,
        confidence: memory.confidence ?? null,
        extractedAt: memory.extractedAt,
        sourceId: memory.sourceId ?? null,
        source: memory.source ?? null,
        createdAt: memory.createdAt,
      }).run();
    } catch (exc) {
      console.warn(`MemoryStore.saveTypedMemory failed: ${(exc as Error).message}`);
    }
  }

  getTypedMemories(convId: number, type: string, limit: number = 10): TypedMemoryEntry[] {
    try {
      return this.db.select()
        .from(typedMemories)
        .where(and(
          eq(typedMemories.conversationId, convId),
          eq(typedMemories.type, type),
        ))
        .orderBy(desc(typedMemories.createdAt))
        .limit(limit)
        .all();
    } catch (exc) {
      console.warn(`MemoryStore.getTypedMemories failed: ${(exc as Error).message}`);
      return [];
    }
  }

  getAllTypedMemories(): TypedMemoryEntry[] {
    try {
      return this.db.select().from(typedMemories).all();
    } catch (exc) {
      console.warn(`MemoryStore.getAllTypedMemories failed: ${(exc as Error).message}`);
      return [];
    }
  }
}
```

### ChromaDB Collections Setup + Type-Aware Query

```typescript
// Source: Drizzle + ChromaDB integration pattern in JARVIS
// File: src/memory/vectors.ts (MODIFY)

import { ChromaClient } from 'chromadb';

export class MemoryVectors {
  private client: ChromaClient | null = null;
  private collections: {
    semantic?: any;
    episodic?: any;
    procedural?: any;
  } = {};

  async init(): Promise<void> {
    if (this.client) return;
    
    this.client = new ChromaClient(); // HTTP client to localhost:8000
    
    // Create or get 3 typed collections
    for (const type of ['semantic', 'episodic', 'procedural'] as const) {
      try {
        // Try to get existing collection
        this.collections[type] = await this.client.getOrCreateCollection({
          name: `memories_${type}`,
          metadata: { type },
        });
      } catch (err) {
        console.warn(`Failed to initialize ChromaDB collection ${type}:`, err);
      }
    }
  }

  async addTypedMemory(
    docId: string,
    text: string,
    type: 'semantic' | 'episodic' | 'procedural',
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.init();
      const collection = this.collections[type];
      if (!collection) throw new Error(`collection ${type} not initialized`);

      // Embed text (using default sentence-transformers model)
      const vec = await embedText(text);
      
      // Upsert with type-aware metadata
      await collection.upsert({
        ids: [docId],
        documents: [text],
        embeddings: [Array.from(vec)],
        metadatas: [{
          type,
          convId: metadata?.convId ? String(metadata.convId) : '',
          confidence: metadata?.confidence ? String(metadata.confidence) : '',
          source: metadata?.source ? String(metadata.source) : '',
        }],
      });
    } catch (err) {
      console.warn(`[vectors] addTypedMemory ${docId} failed:`, err);
    }
  }

  async queryMemoriesByType(
    userText: string,
    type: 'semantic' | 'episodic' | 'procedural',
    topK: number = 5,
  ): Promise<Array<{ id: string; document: string; similarity: number }>> {
    try {
      await this.init();
      const collection = this.collections[type];
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
      }));
    } catch (err) {
      console.warn(`[vectors] queryMemoriesByType ${type} failed:`, err);
      return [];
    }
  }

  async getAllDocIds(): Promise<Set<string>> {
    try {
      await this.init();
      const allIds = new Set<string>();

      for (const type of ['semantic', 'episodic', 'procedural'] as const) {
        const collection = this.collections[type];
        if (!collection) continue;

        const allDocs = await collection.get();
        allDocs.ids.forEach((id: string) => allIds.add(id));
      }

      return allIds;
    } catch (err) {
      console.warn(`[vectors] getAllDocIds failed:`, err);
      return new Set();
    }
  }
}
```

### Consistency Check (Startup Validation)

```typescript
// Source: JARVIS async pattern + consistency validation
// File: src/index.ts (MODIFY - add to initialization)

import { MemoryStore } from './memory/store.js';
import { MemoryVectors } from './memory/vectors.js';

async function validateMemoryConsistency(store: MemoryStore, vectors: MemoryVectors): Promise<void> {
  try {
    const sqliteMemories = store.getAllTypedMemories();
    const chromadbIds = await vectors.getAllDocIds();

    const mismatches: string[] = [];
    for (const mem of sqliteMemories) {
      if (!chromadbIds.has(mem.id)) {
        mismatches.push(mem.id);
      }
    }

    if (mismatches.length > 0) {
      console.warn(
        `[consistency check] Found ${mismatches.length} typed_memories in SQLite but missing in ChromaDB:`,
      );
      mismatches.slice(0, 10).forEach((id) => {
        console.warn(`  - ${id}`);
      });
      if (mismatches.length > 10) {
        console.warn(`  ... and ${mismatches.length - 10} more`);
      }
    } else {
      console.log('[consistency check] typed_memories consistency OK');
    }
  } catch (err) {
    console.warn(`[consistency check] validation failed: ${(err as Error).message}`);
  }
}

// In app initialization (after MemoryStore and MemoryVectors created):
const store = new MemoryStore();
const vectors = new MemoryVectors();

// Spawn consistency check in background (non-blocking)
void validateMemoryConsistency(store, vectors);
```

### Migration Workflow: Generate + Review + Apply

```bash
# Step 1: Modify schema.ts to add typedMemories table (above)
# Step 2: Generate migration
cd apps/backend-ts
npm run db:generate
# Output: creates src/memory/migrations/0003_typed_memories.sql

# Step 3: Review generated SQL
cat src/memory/migrations/0003_typed_memories.sql

# Step 4: Test on fresh database
sqlite :memory: < src/memory/migrations/0000_0000_init.sql
sqlite :memory: < src/memory/migrations/0001_tool_calls_dispatch.sql
sqlite :memory: < src/memory/migrations/0002_voice_calls.sql
sqlite :memory: < src/memory/migrations/0003_typed_memories.sql
# Should complete without errors

# Step 5: Test on v1.7 database (existing data)
# Copy v1.7 database, run new migration
cp production.sqlite test_v17.sqlite
sqlite test_v17.sqlite < src/memory/migrations/0003_typed_memories.sql
# Verify no data loss: SELECT COUNT(*) FROM messages; (should match before)

# Step 6: Commit and deploy
git add src/memory/migrations/0003_typed_memories.sql src/memory/schema.ts
git commit -m "✨ feat(memory): add typed_memories schema + migration"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single ChromaDB collection for all memories | 3 typed collections (semantic/episodic/procedural) | v1.8 (Phase 35) | Enables type-aware retrieval, better context ranking |
| Manual SQL migration scripts | Drizzle ORM migrations (generated + reviewed) | v1.7 (adopted in Phase 18+) | Type-safe schema changes, automatic idempotence |
| App-level enum validation | SQLite CHECK constraint on type enum | Phase 35 (new) | DB enforces constraint; invalid data impossible |
| Memory persistence only to ChromaDB | Dual-write: SQLite + ChromaDB (with source_id) | Phase 35 (new) | Enables consistency checking, structured metadata queries |
| No consistency validation | Startup async check: SQLite vs. ChromaDB | Phase 35 (new) | Detects data drift early; logs mismatches for investigation |

**Deprecated/outdated:**
- Manual raw SQL migrations (replaced by Drizzle-kit-generated migrations)
- Single-memory-type metadata model (replaced by typed_memories with type enum)

---

## Open Questions

1. **Should source_id FK be required or nullable in Phase 35?**
   - Current recommendation: nullable (allows Phase 36 to populate it)
   - Alternative: create Phase 36 populates all source_ids, then Phase 37+ enforces FK constraint
   - Decision: **NULLABLE for Phase 35** (non-blocking, allows gradual migration in Phase 36)

2. **How to handle ChromaDB collections that already exist?**
   - If upgrading v1.7 (which has single "memories" collection), Phase 36 will need to migrate old docs to new collections
   - Phase 35 recommendation: `getOrCreateCollection()` for all 3 types (idempotent)
   - Phase 36 will handle backfill (out of scope for Phase 35)

3. **What is the timeout/SLO for consistency check on startup?**
   - With 10k+ memories, full scan may take >5s
   - Recommendation: async non-blocking (see Pattern section)
   - Consider limiting to last 24h of memories (faster)

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| SQLite | Schema persistence | ✓ (via better-sqlite3) | 3.x (bundled) | — |
| better-sqlite3 | DB operations | ✓ (npm) | 12.8.0 | sqlite3 package (slower) |
| Drizzle ORM | Schema definitions | ✓ (npm) | 0.45.2 | Raw SQL (not recommended) |
| drizzle-kit | Migration generation | ✓ (npm dev) | 0.31.10 | Manual SQL (error-prone) |
| ChromaDB | Vector persistence | ✓ (running on localhost:8000) | 3.4.3 | Fallback to no vectors (Phase 36 only) |
| Node.js | Runtime | ✓ | 22 LTS | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None — all are available in the project stack.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.3 |
| Config file | apps/backend-ts/vitest.config.ts (if exists) |
| Quick run command | `npm run test -- test/memory/typed-memories.test.ts` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MTYPE-05 | Drizzle schema has typed_memories table with enum type constraint | unit | `npm run test -- test/memory/schema-typed-memories.test.ts` | ❌ Wave 0 |
| MTYPE-05 | Migration 0003 runs cleanly on fresh database | unit | `npm run test -- test/memory/migration-fresh.test.ts` | ❌ Wave 0 |
| MTYPE-05 | Migration 0003 runs on v1.7 database without data loss | integration | `npm run test -- test/memory/migration-upgrade.test.ts` | ❌ Wave 0 |
| REL-02 | MemoryStore.saveTypedMemory() persists row to SQLite | unit | `npm run test -- test/memory/store-typed.test.ts` | ❌ Wave 0 |
| REL-02 | Consistency check logs mismatches when SQLite and ChromaDB diverge | integration | `npm run test -- test/memory/consistency-check.test.ts` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `test/memory/schema-typed-memories.test.ts` — validates Drizzle schema definition (table structure, foreign keys, enum constraint)
- [ ] `test/memory/migration-fresh.test.ts` — tests 0003_typed_memories.sql on fresh :memory: database
- [ ] `test/memory/migration-upgrade.test.ts` — tests migration on copy of v1.7 database (data preservation)
- [ ] `test/memory/store-typed.test.ts` — unit tests for saveTypedMemory(), getTypedMemories(), getAllTypedMemories()
- [ ] `test/memory/consistency-check.test.ts` — async consistency validation (mock SQLite + ChromaDB mismatch)

**Note:** These tests are **prerequisites for Phase 36** (Memory Writer) to validate the schema foundation. They should be written in Phase 35 before handing off.

---

## Sources

### Primary (HIGH confidence)
- **Drizzle ORM 0.45.2** — Official docs at https://orm.drizzle.team/docs/sqlite; verified schema syntax and migration generation
- **better-sqlite3 12.8.0** — npm package; synchronous API matches existing JARVIS code patterns
- **JARVIS schema.ts** — Existing Drizzle patterns (conversations, messages, summaries tables); copy enum + relations patterns
- **JARVIS migrations/** — Existing migration structure (0000_init, 0001_tool_calls, 0002_voice_calls); follow naming/format

### Secondary (MEDIUM confidence)
- **MEMORY-INTELLIGENCE-ARCHITECTURE.md** — Project research; typed_memories schema design, fire-and-forget async pattern, consistency check concept
- **REQUIREMENTS.md** — MTYPE-05 and REL-02 requirements; source_id field specification

### Tertiary (LOW confidence)
- None — all findings verified against official docs or existing code

---

## Metadata

**Confidence breakdown:**
- **Standard Stack:** HIGH — Drizzle + better-sqlite3 already in use (backend-ts/package.json); versions current (March 2026)
- **Architecture:** HIGH — Drizzle schema pattern copied from existing (conversations, messages tables); Drizzle migrations verified on official docs
- **Pitfalls:** MEDIUM-HIGH — Enum constraints, FK cascade, metadata type restrictions validated against ChromaDB 3.4.3 docs; source_id design based on MEMORY-INTELLIGENCE-ARCHITECTURE.md research
- **Consistency Check:** MEDIUM — Async non-blocking pattern standard in Node.js; specific implementation (startup trigger, logging) recommended but not verified against existing codebase

**Research date:** 2026-04-19  
**Valid until:** 2026-05-03 (14 days — Drizzle/better-sqlite3 stable, low churn)

---
