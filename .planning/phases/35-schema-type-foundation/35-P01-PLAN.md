---
phase: 35-schema-type-foundation
plan: P01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/backend-ts/src/memory/schema.ts
  - apps/backend-ts/src/memory/migrations/0003_typed_memories.sql
  - apps/backend-ts/src/memory/migrations/meta/_journal.json
  - apps/backend-ts/test/memory/schema-typed-memories.test.ts
  - apps/backend-ts/test/memory/migration-fresh.test.ts
  - apps/backend-ts/test/memory/migration-upgrade.test.ts
autonomous: true
requirements:
  - MTYPE-05

must_haves:
  truths:
    - "typed_memories table exists in SQLite after running migrations on both fresh and v1.7 databases"
    - "The type column rejects any value not in (semantic, episodic, procedural) at the database level"
    - "source_id column exists and is nullable, referencing messages.id"
    - "confidence column exists as a REAL (nullable float)"
    - "extracted_at column exists and is NOT NULL text"
    - "All vitest tests for schema structure and migration pass (npm run test -- test/memory/ passes)"
  artifacts:
    - path: "apps/backend-ts/src/memory/schema.ts"
      provides: "typedMemories Drizzle table definition + typedMemoriesRelations"
      contains: "typedMemories"
    - path: "apps/backend-ts/src/memory/migrations/0003_typed_memories.sql"
      provides: "CREATE TABLE typed_memories with CHECK constraint on type"
      contains: "typed_memories"
    - path: "apps/backend-ts/test/memory/schema-typed-memories.test.ts"
      provides: "Tests verifying table columns and enum constraint"
    - path: "apps/backend-ts/test/memory/migration-fresh.test.ts"
      provides: "Tests that migration 0003 runs on a fresh database"
    - path: "apps/backend-ts/test/memory/migration-upgrade.test.ts"
      provides: "Tests that migration 0003 runs on v1.7 database without data loss"
  key_links:
    - from: "apps/backend-ts/src/memory/schema.ts"
      to: "apps/backend-ts/src/memory/migrations/0003_typed_memories.sql"
      via: "drizzle-kit generate (manually authored to match schema)"
      pattern: "typedMemories.*sqliteTable"
    - from: "apps/backend-ts/src/memory/migrations/0003_typed_memories.sql"
      to: "apps/backend-ts/src/memory/migrations/meta/_journal.json"
      via: "Drizzle migration journal entry idx=3"
      pattern: "0003_typed_memories"
---

<objective>
Define the Drizzle ORM schema for `typed_memories`, author the migration SQL file, and write Wave 0 test stubs that prove the schema and migration work on both fresh and v1.7 databases.

Purpose: MTYPE-05 requires the typed_memories table to exist before Phase 36 (Memory Writer) can write any extracted memory. This plan establishes the complete data contract.

Output: schema.ts extended with typedMemories table, migration 0003_typed_memories.sql committed, three test files green in vitest.
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

<!-- Key existing contracts the executor must NOT break -->
<interfaces>
From apps/backend-ts/src/memory/schema.ts (current — all must remain untouched):
```typescript
export const messageRoleEnum = ['user', 'assistant', 'system'] as const;
export const userProfileSourceEnum = ['implicit', 'explicit'] as const;
export const toolCallOutcomeEnum = ['dispatched', 'success', 'error', 'cancelled'] as const;

export const conversations = sqliteTable('conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
});

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: integer('conversation_id').notNull().references(() => conversations.id),
  role: text('role', { enum: messageRoleEnum }).notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull(),
});
// + summaries, userProfile, voiceCalls, toolCalls tables (DO NOT MODIFY)
```

From apps/backend-ts/src/memory/store.ts (existing createStoreForTests helper used in tests):
```typescript
export function createStoreForTests(dbPath: string): { db: Drizzle; sqlite: Database.Database }
// Opens dbPath, runs ALL migrations from src/memory/migrations/, returns handles.
// Test files import this to get a schema-ready database.
```

Migration journal format (apps/backend-ts/src/memory/migrations/meta/_journal.json):
```json
{
  "version": "7",
  "dialect": "sqlite",
  "entries": [
    { "idx": 0, "version": "6", "when": 1775608164740, "tag": "0000_0000_init", "breakpoints": true },
    { "idx": 1, "version": "6", "when": 1775608164741, "tag": "0001_tool_calls_dispatch", "breakpoints": true },
    { "idx": 2, "version": "6", "when": 1775608164742, "tag": "0002_voice_calls", "breakpoints": true }
  ]
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write Wave 0 test stubs (RED phase)</name>
  <files>
    apps/backend-ts/test/memory/schema-typed-memories.test.ts
    apps/backend-ts/test/memory/migration-fresh.test.ts
    apps/backend-ts/test/memory/migration-upgrade.test.ts
  </files>

  <read_first>
    - apps/backend-ts/src/memory/schema.ts (existing tables pattern)
    - apps/backend-ts/test/memory/tool-logger.test.ts (test file template — imports, setup/teardown pattern)
    - apps/backend-ts/src/memory/store.ts (createStoreForTests helper)
    - apps/backend-ts/src/memory/migrations/0000_0000_init.sql (existing migration SQL format)
    - apps/backend-ts/vitest.config.ts (test config — no watch mode allowed)
  </read_first>

  <behavior>
    schema-typed-memories.test.ts:
    - Test: "typed_memories table exists after migration" — use createStoreForTests(dbPath), then raw sqlite PRAGMA table_info('typed_memories'), expect at least 8 rows (id, conversation_id, type, content, confidence, extracted_at, source_id, created_at)
    - Test: "type column rejects invalid enum value" — insert row with type='invalid', expect the insert to throw (CHECK constraint violation)
    - Test: "type column accepts semantic, episodic, procedural" — insert one row per valid type, expect no throw
    - Test: "source_id is nullable" — insert row without source_id (omit the field), expect success
    - Test: "confidence is nullable" — insert row without confidence, expect success

    migration-fresh.test.ts:
    - Test: "migration 0003 runs cleanly on a fresh empty database" — create in-memory Database(':memory:'), run all 4 migration SQL files sequentially via db.exec(), expect no throw
    - Test: "fresh database has typed_memories table with expected columns" — after fresh migration, PRAGMA table_info('typed_memories'), assert column names include: id, conversation_id, type, content, confidence, extracted_at, source_id, created_at

    migration-upgrade.test.ts:
    - Test: "migration 0003 runs on v1.7 database without data loss" — create v1.7 DB (run migrations 0000+0001+0002 only), insert 2 conversations + 3 messages, then run migration 0003, assert conversations and messages tables still have their rows (no data loss), assert typed_memories table exists
    - Test: "existing v1.7 data remains intact after upgrade" — same setup, after 0003 runs, SELECT COUNT(*) FROM conversations returns 2, SELECT COUNT(*) FROM messages returns 3
  </behavior>

  <action>
    Create three test files. These tests MUST FAIL before Task 2 is complete (RED phase).

    Test file import pattern (copy from test/memory/tool-logger.test.ts):
    ```typescript
    import { describe, it, expect, beforeEach, afterEach } from 'vitest';
    import { mkdtempSync, rmSync } from 'node:fs';
    import { readFileSync } from 'node:fs';
    import { tmpdir } from 'node:os';
    import path from 'node:path';
    import Database from 'better-sqlite3';
    import { createStoreForTests } from '../../src/memory/store.js';
    ```

    For migration tests that run SQL directly, read migration files using:
    ```typescript
    const migrationsDir = path.join(process.cwd(), 'src/memory/migrations');
    const sql0000 = readFileSync(path.join(migrationsDir, '0000_0000_init.sql'), 'utf8');
    ```
    Drizzle migrations use `--> statement-breakpoint` as separator. Split on that to get individual statements. Execute each statement via `sqlite.exec(stmt.trim())`.

    For CHECK constraint test: use `better-sqlite3` directly (not Drizzle) to attempt INSERT with invalid type:
    ```typescript
    const raw = new Database(dbPath);
    // run migrations first...
    expect(() => raw.prepare(
      "INSERT INTO typed_memories (id, conversation_id, type, content, extracted_at, created_at) VALUES (?,?,?,?,?,?)"
    ).run('t1', 1, 'invalid', 'test', new Date().toISOString(), new Date().toISOString())).toThrow();
    ```
    Note: SQLite enforces CHECK constraints only when PRAGMA foreign_keys is ON and PRAGMA strict=ON, OR when the CHECK constraint is written with a literal CHECK() clause. The migration SQL in Task 2 must include `CHECK(type IN ('semantic','episodic','procedural'))` inline in CREATE TABLE. Verify the test catches this.

    Run after creating: `pnpm --filter backend-ts test -- test/memory/schema-typed-memories.test.ts`
    Expected: FAIL (typed_memories table does not exist yet).
  </action>

  <verify>
    <automated>pnpm --filter backend-ts test -- test/memory/schema-typed-memories.test.ts test/memory/migration-fresh.test.ts test/memory/migration-upgrade.test.ts 2>&1 | tail -20</automated>
  </verify>

  <acceptance_criteria>
    - All three test files exist at apps/backend-ts/test/memory/{schema-typed-memories,migration-fresh,migration-upgrade}.test.ts
    - Running the test command shows FAIL (not "no tests found") — tests are discovered and running
    - Test failure message references "typed_memories" (not a syntax error in the test file itself)
    - grep -r "typed_memories" apps/backend-ts/test/memory/ returns at least 5 matches across the three files
  </acceptance_criteria>
  <done>See acceptance_criteria above.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Extend schema.ts + author migration 0003 (GREEN phase)</name>
  <files>
    apps/backend-ts/src/memory/schema.ts
    apps/backend-ts/src/memory/migrations/0003_typed_memories.sql
    apps/backend-ts/src/memory/migrations/meta/_journal.json
  </files>

  <read_first>
    - apps/backend-ts/src/memory/schema.ts (MUST READ — append to this file, do not overwrite existing tables)
    - apps/backend-ts/src/memory/migrations/0002_voice_calls.sql (copy SQL format exactly)
    - apps/backend-ts/src/memory/migrations/meta/_journal.json (MUST READ — append journal entry)
    - .planning/phases/35-schema-type-foundation/35-RESEARCH.md (schema design, pitfalls section)
  </read_first>

  <behavior>
    After Task 2, all three test files from Task 1 must turn GREEN.

    schema.ts additions:
    - Export: `export const typedMemoriesEnum = ['semantic', 'episodic', 'procedural'] as const;`
    - Add `real` to the import from 'drizzle-orm/sqlite-core'
    - typedMemories table with columns: id (text PK), conversationId (integer NOT NULL FK→conversations.id onDelete:'cascade'), type (text enum typedMemoriesEnum NOT NULL), content (text NOT NULL), confidence (real nullable), extractedAt (text NOT NULL), sourceId (integer nullable FK→messages.id onDelete:'set null'), source (text nullable), createdAt (text NOT NULL)
    - typedMemoriesRelations: one(conversations), one(messages via sourceId)
    - conversationsRelations: ADD `typedMemories: many(typedMemories)` to existing relation

    Migration SQL (0003_typed_memories.sql) — do NOT run drizzle-kit generate, author manually to match the SQL format in 0002_voice_calls.sql:
    ```sql
    CREATE TABLE `typed_memories` (
      `id` text PRIMARY KEY NOT NULL,
      `conversation_id` integer NOT NULL,
      `type` text NOT NULL,
      `content` text NOT NULL,
      `confidence` real,
      `extracted_at` text NOT NULL,
      `source_id` integer,
      `source` text,
      `created_at` text NOT NULL,
      CHECK(`type` IN ('semantic','episodic','procedural')),
      FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (`source_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null
    );
    ```
    Do NOT include `--> statement-breakpoint` here (single statement, no breakpoints needed).

    _journal.json: append entry after idx=2:
    ```json
    { "idx": 3, "version": "6", "when": 1775608164743, "tag": "0003_typed_memories", "breakpoints": true }
    ```
  </behavior>

  <action>
    Step 1 — Modify schema.ts:
    Add `real` to the existing import line: `import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core';`

    Append after the toolCalls table definition (do not modify any existing table definition):
    ```typescript
    // Typed Memories Table (Phase 35 — v1.8 Memory Intelligence)
    export const typedMemoriesEnum = ['semantic', 'episodic', 'procedural'] as const;

    export const typedMemories = sqliteTable('typed_memories', {
      id: text('id').primaryKey(),
      conversationId: integer('conversation_id')
        .notNull()
        .references(() => conversations.id, { onDelete: 'cascade' }),
      type: text('type', { enum: typedMemoriesEnum }).notNull(),
      content: text('content').notNull(),
      confidence: real('confidence'),
      extractedAt: text('extracted_at').notNull(),
      sourceId: integer('source_id')
        .references(() => messages.id, { onDelete: 'set null' }),
      source: text('source'),
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

    Also update conversationsRelations to add `typedMemories: many(typedMemories)` alongside the existing `messages: many(messages)` and `summaries: many(summaries)`.

    Step 2 — Create migration file exactly as shown in behavior section.

    Step 3 — Update _journal.json by appending the new entry (idx=3) to the entries array.

    Step 4 — Run tests:
    `pnpm --filter backend-ts test -- test/memory/schema-typed-memories.test.ts test/memory/migration-fresh.test.ts test/memory/migration-upgrade.test.ts`
    All must be GREEN. If CHECK constraint test fails, verify the migration SQL uses `CHECK(` not SQLite's non-enforced naming.

    Step 5 — Run full suite to confirm no regressions:
    `pnpm --filter backend-ts test`
  </action>

  <verify>
    <automated>pnpm --filter backend-ts test -- test/memory/schema-typed-memories.test.ts test/memory/migration-fresh.test.ts test/memory/migration-upgrade.test.ts 2>&1 | tail -10 && pnpm --filter backend-ts test 2>&1 | tail -5</automated>
  </verify>

  <acceptance_criteria>
    - grep "typedMemories" apps/backend-ts/src/memory/schema.ts returns at least 3 matches
    - grep "CHECK" apps/backend-ts/src/memory/migrations/0003_typed_memories.sql returns 1 match containing "semantic"
    - grep "source_id" apps/backend-ts/src/memory/migrations/0003_typed_memories.sql returns a match
    - grep "0003_typed_memories" apps/backend-ts/src/memory/migrations/meta/_journal.json returns a match
    - All three Wave 0 test files pass (pnpm --filter backend-ts test -- test/memory/ exits 0)
    - Full test suite (pnpm --filter backend-ts test) exits 0 — no regressions in existing tests
  </acceptance_criteria>
  <done>See acceptance_criteria above.</done>
</task>

</tasks>

<verification>
After both tasks complete:

1. Schema in place: `grep -c "typedMemories" apps/backend-ts/src/memory/schema.ts` returns >= 3
2. Migration exists: `cat apps/backend-ts/src/memory/migrations/0003_typed_memories.sql | grep CHECK` shows CHECK constraint with enum values
3. Journal updated: `cat apps/backend-ts/src/memory/migrations/meta/_journal.json | grep "0003"` returns a match
4. Wave 0 tests green: `pnpm --filter backend-ts test -- test/memory/` exits 0
5. No regressions: `pnpm --filter backend-ts test` exits 0
</verification>

<success_criteria>
- typed_memories table is fully defined in schema.ts and migration SQL
- Migration runs cleanly on both fresh and v1.7 database (tests prove it)
- CHECK constraint on type column is enforced at the SQLite level (test inserts invalid type and expects throw)
- source_id is nullable FK to messages.id (nullable = Phase 36 populates it)
- All vitest tests for schema + migration pass
- No existing tests broken
</success_criteria>

<output>
After completion, create `.planning/phases/35-schema-type-foundation/35-P01-SUMMARY.md`
</output>
