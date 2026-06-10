# Phase 93: Hybrid Memory Retrieval - Research

**Researched:** 2026-06-10
**Domain:** SQLite FTS5, Reciprocal Rank Fusion, NDCG benchmarking, TypeScript/better-sqlite3
**Confidence:** HIGH

## Summary

Phase 93 adds a `HybridRetriever` class that merges three ranked lists — semantic (ChromaDB), keyword (SQLite FTS5), and recency signal — via Weighted Reciprocal Rank Fusion (RRF), replacing the current three-parallel-query approach in `buildContext()`. The API surface of `buildContext(userText, rollingSum?)` is unchanged; all changes are internal to the memory subsystem.

The implementation is fully within the existing TypeScript stack. No new runtime dependencies are strictly required: FTS5 is bundled in the SQLite version that `better-sqlite3` ships with (SQLite ≥3.9.0), and NDCG can be implemented inline in ~15 lines of TypeScript. The main risk is RRF weight calibration (Pitfall P-4): the 50-query NDCG gate acts as the quality gate before shipping.

**Primary recommendation:** Implement `HybridRetriever` as a standalone class in `apps/backend-ts/src/memory/hybrid-retriever.ts`. Create FTS5 virtual table + 3 triggers in `MemoryStore` constructor via `sqlite.exec()` (idempotent `IF NOT EXISTS`). Wire it into `manager.ts`'s `buildContext()`. Run NDCG benchmark as a Vitest test with an in-memory SQLite + Chroma mock.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**FTS5 target (HMEM-02)**
- D-01: FTS5 virtual table indexa `typed_memories.content`. Não indexar `messages`.
- D-02: FTS5 indexa somente a coluna `content`. O `id` é coluna auxiliar UNINDEXED. Virtual table: `typed_memories_fts(content, id UNINDEXED)`.
- D-03: Triggers criados para manter FTS sincronizado em INSERT/UPDATE/DELETE sobre `typed_memories`.

**FTS5 setup (HMEM-02)**
- D-04: FTS5 criado no construtor de `MemoryStore` via `db.exec()` com `CREATE VIRTUAL TABLE IF NOT EXISTS`. Idempotente — sem arquivo de migração separado, sem dependência de drizzle-kit para essa table.

**RRF merge strategy (HMEM-03, HMEM-04)**
- D-05: Pool único — todos os typed_memories (semantic + episodic + procedural) jogados num único ranking RRF. Sem separação por tipo no retrieval.
- D-06: Pesos RRF documentados como default: semantic 0.6, keyword 0.25, recency 0.15.
- D-07: Recency como tiebreaker — não domina quando semantic+keyword concordam (HMEM-04).

**buildContext() output (HMEM-06)**
- D-08: As 3 seções separadas (`### Memórias semânticas`, `### Memórias episódicas`, `### Memórias procedurais`) substituídas por uma seção única `### Memórias` com os top-K resultados rankeados por RRF.
- D-09: API de `buildContext(userText, rollingSum?)` não muda — nenhum parâmetro novo, nenhum tipo novo. Callers existentes (ex: `ChatSession`) não precisam de ajuste.

**NDCG benchmark (HMEM-05)**
- D-10: 50 queries + ground truth como fixture estático (arquivo JSON) no diretório de testes. Roda como parte do suite de testes (jest/vitest).
- D-11: Ground truth graded: cada query tem `{ id, relevance: 0 | 1 | 2 | 3 }`. NDCG calculado com relevância graduada (0=irrelevante, 1=marginalmente relevante, 2=relevante, 3=muito relevante).
- D-12: Teste cria banco em memória, insere as memórias do fixture, roda retrieval hybrid vs pure-semantic, compara NDCG. Gate: hybrid NDCG ≥ baseline + 7%.

### Claude's Discretion
- Número de resultados top-K no pool unificado (pode ser 10-15 para compensar a fusão dos 3 tipos anteriores que retornavam 5 cada)
- Implementação do cálculo NDCG (pode usar lib ou implementar inline)
- Constante `k` do RRF (tipicamente 60 — padrão da literatura)

### Deferred Ideas (OUT OF SCOPE)
Nenhuma — discussão ficou dentro do escopo da fase.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HMEM-01 | New `HybridRetriever` class combines semantic (ChromaDB), keyword (SQLite FTS5), and recency-based ranking | HybridRetriever pattern, RRF formula, file location: `src/memory/hybrid-retriever.ts` |
| HMEM-02 | SQLite FTS5 virtual table created for typed_memories.content with triggers maintaining sync on INSERT/UPDATE/DELETE | FTS5 `CREATE VIRTUAL TABLE` + AFTER triggers pattern via `sqlite.exec()` in MemoryStore constructor |
| HMEM-03 | RRF merges three ranked lists with weights (semantic 0.6, keyword 0.25, recency 0.15) | Weighted RRF formula: `score(d) = Σ w_r * 1/(k + rank_r(d))` where k=60 |
| HMEM-04 | Recency applied as tiebreaker only — does not dominate ranking when semantic+keyword strongly agree | Recency weight 0.15 < combined semantic+keyword 0.85 — signal strength by design |
| HMEM-05 | NDCG benchmark with 50 hand-crafted queries validates ≥7% lift vs pure semantic baseline | NDCG inline implementation, fixture JSON, Vitest in-memory SQLite pattern |
| HMEM-06 | `manager.buildContext()` uses HybridRetriever transparently — no API change to callers | Refactor `buildContext()` lines 128-165 in manager.ts; single `### Memórias` section replaces 3 sections |
</phase_requirements>

---

## Standard Stack

### Core (existing — no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | ^12.8.0 | SQLite access + FTS5 raw exec | Already in use; FTS5 bundled in SQLite ≥3.9.0 — no loadExtension() needed |
| drizzle-orm | ^0.45.2 | ORM for typed_memories queries | Already in use; FTS5 virtual table created via `sqlite.exec()` (not drizzle schema) |
| chromadb | ^3.4.3 | Semantic ranking source | Already in use via MemoryVectors |
| vitest | ^4.1.3 | Test framework for NDCG benchmark | Already in use |

### Potentially New
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| (none required) | — | NDCG is ~15 lines inline; RRF is pure math | No npm install needed |

**FTS5 availability confirmation:** SQLite bundles FTS5 since version 3.9.0 (2015). The `better-sqlite3` package ships its own SQLite build with FTS5 enabled. Running `CREATE VIRTUAL TABLE ... USING fts5(...)` via `sqlite.exec()` works without any extension loading. (MEDIUM confidence — verified via community issue tracker and SQLite docs, not direct test run on this machine.)

## Architecture Patterns

### Recommended Project Structure

```
apps/backend-ts/src/memory/
├── hybrid-retriever.ts    # NEW — HybridRetriever class (isolated, testable)
├── manager.ts             # MODIFIED — buildContext() wires HybridRetriever
├── store.ts               # MODIFIED — FTS5 setup in constructor
├── vectors.ts             # READ-ONLY — semantic ranking source
├── schema.ts              # READ-ONLY — typed_memories schema reference
└── __tests__/
    ├── hybrid-retriever.test.ts     # NEW — unit tests for HybridRetriever
    └── hybrid-retriever.ndcg.test.ts # NEW — NDCG benchmark (D-10, D-12)
```

### Pattern 1: FTS5 Virtual Table Creation (Idempotent, in MemoryStore constructor)

The `MemoryStore` constructor has access to `this.sqlite` only when `dbPath` is provided (test path). For the production path, `db.ts` creates the sqlite instance. The FTS5 setup must handle both cases.

**Key insight:** `this.sqlite` is non-null only when `dbPath` is provided (test path). The production singleton in `db.ts` needs its own FTS5 setup call, OR `MemoryStore` should expose a `setupFts5()` method called from both paths.

**Recommended approach:** Add `private setupFts5(): void` to `MemoryStore`, call it from the constructor when `sqlite` is available, and also expose it as a public method so `db.ts` can call it on the singleton. Alternatively, add a `setupFts5(sqlite: Database)` static helper.

```typescript
// In MemoryStore constructor — after db is ready
private setupFts5(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS typed_memories_fts
    USING fts5(content, id UNINDEXED);

    CREATE TRIGGER IF NOT EXISTS typed_memories_fts_insert
    AFTER INSERT ON typed_memories BEGIN
      INSERT INTO typed_memories_fts(content, id) VALUES (new.content, new.id);
    END;

    CREATE TRIGGER IF NOT EXISTS typed_memories_fts_update
    AFTER UPDATE ON typed_memories BEGIN
      DELETE FROM typed_memories_fts WHERE id = old.id;
      INSERT INTO typed_memories_fts(content, id) VALUES (new.content, new.id);
    END;

    CREATE TRIGGER IF NOT EXISTS typed_memories_fts_delete
    AFTER DELETE ON typed_memories BEGIN
      DELETE FROM typed_memories_fts WHERE id = old.id;
    END;
  `);
}
```

**Note on `db.ts` singleton:** The production `db.ts` creates a raw `sqlite` instance but does NOT expose it — only the drizzle `db` is exported. Two options:
1. Export `sqlite` from `db.ts` alongside `db` (minimal change).
2. Run `sqlite.exec()` inside `db.ts` directly after creating the Database instance.

Option 2 is cleaner (no new exports). Either works.

**Warning on UPDATE trigger:** SQLite FTS5 `UPDATE` sync must DELETE old row then INSERT new row — not use FTS UPDATE directly. The pattern above (DELETE + INSERT) is the safe approach.

### Pattern 2: Weighted RRF Formula

```typescript
// Source: Elasticsearch Labs (Weighted RRF), RRF original paper (Cormack 2009)
const RRF_K = 60; // standard constant from literature

interface RankedItem {
  id: string;
  document: string;
  createdAt: string; // ISO timestamp from typed_memories
}

function computeRrfScore(
  semanticRank: number | undefined,   // 1-based, undefined = not in list
  keywordRank: number | undefined,
  recencyRank: number | undefined,
  weights = { semantic: 0.6, keyword: 0.25, recency: 0.15 },
  k = RRF_K,
): number {
  let score = 0;
  if (semanticRank !== undefined) score += weights.semantic * (1 / (k + semanticRank));
  if (keywordRank !== undefined) score += weights.keyword * (1 / (k + keywordRank));
  if (recencyRank !== undefined) score += weights.recency * (1 / (k + recencyRank));
  return score;
}
```

### Pattern 3: FTS5 Keyword Query via better-sqlite3

```typescript
// FTS5 MATCH query using better-sqlite3 raw prepare()
// Note: drizzle-orm does not support FTS5 MATCH — must use sqlite.prepare() directly
function queryFts5(sqlite: Database.Database, queryText: string, topK: number): Array<{ id: string; rank: number }> {
  const stmt = sqlite.prepare(
    `SELECT id, rank FROM typed_memories_fts WHERE typed_memories_fts MATCH ? ORDER BY rank LIMIT ?`
  );
  // FTS5 rank column: lower (more negative) = better match
  const rows = stmt.all(queryText, topK) as Array<{ id: string; rank: number }>;
  return rows;
}
```

**FTS5 rank column note:** The built-in `rank` column in FTS5 returns a negative float (BM25-like score). Lower (more negative) = better match. Sort ascending to get best-first, then convert to 1-based rank position for RRF.

**Query escaping:** FTS5 MATCH syntax is strict — user query text should be sanitized to avoid FTS5 syntax errors. Wrapping in quotes (`"user query"`) performs phrase search; raw words perform token search. For production use: strip special FTS5 operators or wrap in quotes.

### Pattern 4: Recency Ranking

```typescript
// Recency rank: sort by createdAt DESC, assign 1-based rank
function buildRecencyRanking(memories: Array<{ id: string; createdAt: string }>): Map<string, number> {
  const sorted = [...memories].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const rankMap = new Map<string, number>();
  sorted.forEach((m, i) => rankMap.set(m.id, i + 1));
  return rankMap;
}
```

**Source field for recency:** Use `createdAt` from `typed_memories` (D-01 in CONTEXT.md: more stable than `extractedAt`).

### Pattern 5: NDCG Calculation (inline, no library)

```typescript
// Source: Wikipedia DCG formula / evidentlyai.com NDCG guide
// Graded relevance: 0=irrelevant, 1=marginally, 2=relevant, 3=highly relevant
function dcg(relevances: number[]): number {
  return relevances.reduce((sum, rel, i) => {
    return sum + (Math.pow(2, rel) - 1) / Math.log2(i + 2); // i+2 because i is 0-based, log2(pos+1) where pos starts at 1
  }, 0);
}

function ndcg(retrieved: string[], groundTruth: Map<string, number>, k: number): number {
  const rels = retrieved.slice(0, k).map(id => groundTruth.get(id) ?? 0);
  const idealRels = Array.from(groundTruth.values()).sort((a, b) => b - a).slice(0, k);
  const idealDcg = dcg(idealRels);
  if (idealDcg === 0) return 0;
  return dcg(rels) / idealDcg;
}
```

### Pattern 6: HybridRetriever Class Structure

```typescript
// apps/backend-ts/src/memory/hybrid-retriever.ts
import Database from 'better-sqlite3';
import type { MemoryVectors } from './vectors.js';

export interface HybridRetrieverOptions {
  topK?: number;                 // default: 10 (Claude's discretion range: 10-15)
  weights?: { semantic: number; keyword: number; recency: number };
  rrfK?: number;                 // default: 60
}

export interface HybridResult {
  id: string;
  document: string;
  score: number;
}

export class HybridRetriever {
  constructor(
    private readonly sqlite: Database.Database,
    private readonly vectors: MemoryVectors,
    private readonly opts: HybridRetrieverOptions = {},
  ) {}

  async retrieve(queryText: string): Promise<HybridResult[]> {
    // 1. Parallel: semantic query (all 3 collections merged) + keyword query
    // 2. Sequential: recency ranking (cheap — just sort by createdAt)
    // 3. Merge via weighted RRF
    // 4. Return top-K
  }
}
```

### Anti-Patterns to Avoid

- **Using drizzle-orm for FTS5 MATCH queries:** drizzle does not support FTS5 virtual tables or MATCH syntax. Use `sqlite.prepare()` directly for FTS5 queries.
- **Running `CREATE VIRTUAL TABLE` inside a drizzle migration file:** drizzle-kit does not handle FTS5 virtual tables. Use `sqlite.exec()` in the constructor (D-04 decision).
- **Using FTS5 MATCH on unsanitized user input:** FTS5 query syntax errors will throw. Wrap user text in quotes or strip special chars.
- **Sorting FTS5 rank ascending vs descending:** FTS5 `rank` is negative (more negative = better). Sort `ORDER BY rank` (ascending) to get best-first results.
- **Overcomplicating top-K pool size:** Current `buildContext()` returns 5 per type × 3 types = up to 15 results. The new unified pool should target 10-15 total (Claude's discretion). Picking a pool >50 for RRF input is unnecessary overhead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full-text indexing | Custom inverted index | SQLite FTS5 (built into better-sqlite3) | FTS5 handles tokenization, stemming, BM25 ranking, phrase search |
| NDCG calculation | Third-party ranking metrics library | 15-line inline implementation | No npm dep needed; formula is well-defined and stable |
| Rank fusion formula | Bespoke score normalization | Weighted RRF (standard) | RRF is rank-based — not sensitive to score calibration differences between semantic/keyword |

**Key insight:** RRF is superior to score-based fusion here because semantic similarity scores (cosine) and FTS5 BM25 ranks are not on the same scale. RRF works on ordinal positions, not raw scores — no normalization needed.

## Common Pitfalls

### Pitfall 1: FTS5 Out-of-Sync on Existing Data
**What goes wrong:** FTS5 virtual table is created empty — existing `typed_memories` rows are not indexed.
**Why it happens:** `CREATE VIRTUAL TABLE IF NOT EXISTS` creates a clean table; triggers only fire on future INSERT/UPDATE/DELETE.
**How to avoid:** After creating the FTS5 table, run a one-time backfill: `INSERT INTO typed_memories_fts(content, id) SELECT content, id FROM typed_memories`. Wrap in `IF NOT EXISTS` check or use a sentinel row to make idempotent.
**Warning signs:** Keyword queries return 0 results on a database with existing memories.

### Pitfall 2: FTS5 MATCH Throws on Special Characters
**What goes wrong:** User query containing `"`, `*`, `-`, `(`, `)`, or other FTS5 operators causes a parse error.
**Why it happens:** FTS5 MATCH syntax is a mini query language — unescaped operators are interpreted as syntax.
**How to avoid:** Sanitize query text before passing to MATCH. Simplest: wrap in double quotes for phrase match — `"${text.replace(/"/g, '""')}"`. Or strip non-alphanumeric except spaces.
**Warning signs:** `SqliteError: fts5: syntax error near...` in logs when querying with punctuation.

### Pitfall 3: Recency Signal Dominates (P-4 from STATE.md)
**What goes wrong:** If recency weight is too high or semantic/keyword return weak results, recency bias dominates — old relevant memories get suppressed.
**Why it happens:** RRF weight 0.15 for recency vs 0.85 combined for semantic+keyword keeps it in check, but only if semantic+keyword return enough candidates.
**How to avoid:** Keep default weights (D-06). Run NDCG gate (D-12) before shipping. If NDCG gate fails, reduce recency weight, not increase.
**Warning signs:** NDCG benchmark shows < 7% lift, or specific keyword-rich queries that should return old memories fail to surface them.

### Pitfall 4: Pool Size Too Small for RRF
**What goes wrong:** If the semantic query only returns 5 results (one per collection) and keyword returns 5, RRF has limited candidates to merge — results equivalent to pure semantic.
**Why it happens:** Current `buildContext()` uses topK=5 per collection. With 3 collections that's up to 15 unique candidates. For RRF to add value, the input lists should cover more candidates.
**How to avoid:** Query each semantic collection with topK=5 (giving up to 15 unique semantic candidates), query FTS5 with topK=15. The union pool size is the RRF input — aim for 20-30 unique candidates before fusion.
**Warning signs:** Hybrid NDCG equals or is lower than semantic-only baseline.

### Pitfall 5: MemoryStore's `sqlite` Instance Not Accessible for FTS5 Queries
**What goes wrong:** `HybridRetriever` needs direct `sqlite` (better-sqlite3 instance) to run `prepare().all()` for FTS5. Currently `MemoryStore.sqlite` is private and null in production path.
**Why it happens:** Production path (`dbPath` not provided) uses the global `db` singleton from `db.ts`, which doesn't expose the raw sqlite instance.
**How to avoid:** Either (a) expose `sqlite` from `db.ts` and pass it to `MemoryStore`/`HybridRetriever`, or (b) add a `getRawDb()` method to `MemoryStore` that returns the underlying `Database` instance (requires accessing the drizzle internal session). Cleanest: export `sqlite` from `db.ts`.
**Warning signs:** Cannot call `sqlite.prepare()` in `HybridRetriever` because the instance is not accessible.

### Pitfall 6: NDCG Test Fixture Drift
**What goes wrong:** The 50-query fixture JSON is written once and never updated — as the memory schema evolves, IDs change and fixture becomes invalid.
**Why it happens:** Fixture uses hardcoded `id` strings from `typed_memories`.
**How to avoid:** Fixture should define memories by content (not ID), and the test should INSERT the fixture memories and capture the returned IDs to build the ground truth map. (D-12 says "banco em memória + insere memórias do fixture" — matches this approach.)
**Warning signs:** NDCG test always passes or always fails regardless of implementation.

## Code Examples

### FTS5 Setup in MemoryStore Constructor
```typescript
// Source: SQLite FTS5 docs (https://sqlite.org/fts5.html) + store.ts constructor pattern
// Place in MemoryStore constructor after db initialization:
private setupFts5(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS typed_memories_fts
      USING fts5(content, id UNINDEXED);
    
    -- Backfill existing rows (idempotent via INSERT OR IGNORE equivalent)
    INSERT INTO typed_memories_fts(content, id)
      SELECT tm.content, tm.id FROM typed_memories tm
      WHERE tm.id NOT IN (SELECT id FROM typed_memories_fts);
    
    CREATE TRIGGER IF NOT EXISTS typed_memories_fts_ai
      AFTER INSERT ON typed_memories BEGIN
        INSERT INTO typed_memories_fts(content, id) VALUES (new.content, new.id);
      END;
    
    CREATE TRIGGER IF NOT EXISTS typed_memories_fts_au
      AFTER UPDATE ON typed_memories BEGIN
        DELETE FROM typed_memories_fts WHERE id = old.id;
        INSERT INTO typed_memories_fts(content, id) VALUES (new.content, new.id);
      END;
    
    CREATE TRIGGER IF NOT EXISTS typed_memories_fts_ad
      AFTER DELETE ON typed_memories BEGIN
        DELETE FROM typed_memories_fts WHERE id = old.id;
      END;
  `);
}
```

### Weighted RRF Merge
```typescript
// Source: Elasticsearch Labs Weighted RRF blog post + RRF paper (Cormack et al. 2009)
interface RrfCandidate {
  id: string;
  document: string;
  createdAt: string;
}

function weightedRrf(
  semanticList: Array<{ id: string; document: string; createdAt: string }>,
  keywordList: Array<{ id: string }>,
  allMemories: Array<{ id: string; document: string; createdAt: string }>,
  opts: { topK: number; weights: { semantic: number; keyword: number; recency: number }; k: number },
): Array<{ id: string; document: string; score: number }> {
  const { topK, weights, k } = opts;

  // Build recency ranking from full memory set
  const sorted = [...allMemories].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const recencyRank = new Map(sorted.map((m, i) => [m.id, i + 1]));

  // Build rank maps
  const semRank = new Map(semanticList.map((m, i) => [m.id, i + 1]));
  const kwRank = new Map(keywordList.map((m, i) => [m.id, i + 1]));

  // Union of all candidate IDs
  const allIds = new Set([
    ...semanticList.map(m => m.id),
    ...keywordList.map(m => m.id),
  ]);

  // Score each candidate
  const idToDoc = new Map(
    [...semanticList, ...allMemories].map(m => [m.id, m.document]),
  );

  const scored = Array.from(allIds).map(id => {
    let score = 0;
    const sr = semRank.get(id);
    const kr = kwRank.get(id);
    const rr = recencyRank.get(id);
    if (sr !== undefined) score += weights.semantic * (1 / (k + sr));
    if (kr !== undefined) score += weights.keyword * (1 / (k + kr));
    if (rr !== undefined) score += weights.recency * (1 / (k + rr));
    return { id, document: idToDoc.get(id) ?? '', score };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}
```

### NDCG Benchmark Test Structure
```typescript
// apps/backend-ts/src/memory/__tests__/hybrid-retriever.ndcg.test.ts (skeleton)
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { MemoryStore } from '../store.js';
import { HybridRetriever } from '../hybrid-retriever.js';
import fixtureData from './fixtures/ndcg-queries.json' assert { type: 'json' };

// fixtureData shape:
// { memories: Array<{ content: string; type: string }>, queries: Array<{ text: string; ground_truth: Array<{ content: string; relevance: 0|1|2|3 }> }> }

describe('NDCG benchmark — hybrid vs pure semantic', () => {
  it('hybrid NDCG >= baseline + 7%', async () => {
    // Setup in-memory SQLite + insert fixture memories
    // Run hybrid retrieval for each query
    // Run pure semantic (ChromaDB mock) for each query
    // Compute NDCG@10 for both, assert lift >= 0.07
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pure vector search (separate collections per type) | Weighted RRF over semantic + keyword + recency | Phase 93 | More accurate recall for keyword-rich and temporally-specific queries |
| 3 separate `### Memórias X` sections in context | Single `### Memórias` section, top-K ranked | Phase 93 | Cleaner context; recency/keyword boost surfaces most relevant regardless of type |

## Open Questions

1. **How does HybridRetriever access the raw `sqlite` instance in production?**
   - What we know: `MemoryStore.sqlite` is private and null when using the global `db` singleton from `db.ts`. The global `db.ts` creates a `Database` instance but only exports `db` (drizzle).
   - What's unclear: Whether exporting `sqlite` from `db.ts` or adding a `getRawDb()` method to `MemoryStore` is the preferred pattern.
   - Recommendation: Export `sqlite` from `db.ts` alongside `db`. It's a 1-line change, already done for test path. Pass it to `MemoryManager` → `MemoryStore`/`HybridRetriever`.

2. **Should HybridRetriever fetch ALL memories for recency ranking or only the union of semantic+keyword candidates?**
   - What we know: Full recency ranking requires all `typed_memories` rows. The table could grow large over time.
   - What's unclear: Whether a windowed recency (e.g., last 1000 rows) is needed.
   - Recommendation: Fetch the union candidates' `createdAt` from SQLite (targeted SELECT by IDs) rather than all rows. Recency rank among candidates only — this is consistent with how RRF works (ranks within the candidate pool, not globally).

3. **What's the right top-K pool size for each signal?**
   - What we know: Current semantic returns 5/collection × 3 collections = up to 15. FTS5 can return N results. RRF needs a pool to work with.
   - Recommendation: Query semantic with 5/collection (up to 15 unique), FTS5 with 15 results. Final output top-K = 10-15. This gives RRF a 20-30 candidate pool to work with.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| better-sqlite3 | FTS5 setup + keyword query | ✓ | ^12.8.0 (in package.json) | — |
| SQLite FTS5 | HMEM-02 | ✓ (bundled in better-sqlite3's SQLite build, version ≥3.9.0) | SQLite ≥3.9.0 | — |
| vitest | NDCG benchmark tests | ✓ | ^4.1.3 | — |
| chromadb | Semantic ranking | ✓ (via MemoryVectors, existing) | ^3.4.3 | Mock in tests |

**No missing dependencies with no fallback.**

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.3 |
| Config file | `apps/backend-ts/vitest.config.ts` |
| Quick run command | `cd apps/backend-ts && npx vitest run src/memory/hybrid-retriever.test.ts` |
| Full suite command | `cd apps/backend-ts && npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HMEM-01 | HybridRetriever class exists, retrieves and merges results | unit | `npx vitest run src/memory/hybrid-retriever.test.ts` | ❌ Wave 0 |
| HMEM-02 | FTS5 table + triggers created; keyword search returns results | unit | `npx vitest run src/memory/store.test.ts` (extend existing) | ✅ (extend) |
| HMEM-03 | RRF scores are computed with correct weighted formula | unit | `npx vitest run src/memory/hybrid-retriever.test.ts` | ❌ Wave 0 |
| HMEM-04 | Recency does not dominate when semantic+keyword agree | unit | `npx vitest run src/memory/hybrid-retriever.test.ts` | ❌ Wave 0 |
| HMEM-05 | NDCG hybrid ≥ baseline + 7% on 50 fixture queries | integration/benchmark | `npx vitest run src/memory/__tests__/hybrid-retriever.ndcg.test.ts` | ❌ Wave 0 |
| HMEM-06 | buildContext() produces single `### Memórias` section, API unchanged | integration | `npx vitest run src/memory/manager.test.ts` | ✅ (extend) |

### Sampling Rate
- **Per task commit:** `npx vitest run src/memory/hybrid-retriever.test.ts`
- **Per wave merge:** `npx vitest run src/memory/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/memory/hybrid-retriever.ts` — HybridRetriever class (implementation)
- [ ] `src/memory/hybrid-retriever.test.ts` — Unit tests for HMEM-01, HMEM-03, HMEM-04
- [ ] `src/memory/__tests__/hybrid-retriever.ndcg.test.ts` — NDCG benchmark for HMEM-05
- [ ] `src/memory/__tests__/fixtures/ndcg-queries.json` — 50-query fixture with graded ground truth

## Sources

### Primary (HIGH confidence)
- [SQLite FTS5 Extension official docs](https://sqlite.org/fts5.html) — FTS5 table creation, MATCH syntax, trigger sync pattern, rank column semantics
- [SQLite FTS5 trigger sync pattern (simonh.uk)](https://simonh.uk/2021/05/11/sqlite-fts5-triggers/) — AFTER trigger implementation reference
- Codebase: `apps/backend-ts/src/memory/store.ts` — MemoryStore class, sqlite instance handling
- Codebase: `apps/backend-ts/src/memory/manager.ts` — buildContext() lines 124-168, parallel Chroma queries
- Codebase: `apps/backend-ts/src/memory/vectors.ts` — queryMemoriesByType() return type, QueryResult interface
- Codebase: `apps/backend-ts/src/memory/schema.ts` — typed_memories table: id (text PK), content, type, createdAt columns

### Secondary (MEDIUM confidence)
- [Elasticsearch Labs — Weighted RRF](https://www.elastic.co/search-labs/blog/weighted-reciprocal-rank-fusion-rrf) — Weighted RRF formula: `Σ w_r * 1/(k + rank_r(d))`, k=60 standard constant
- [ParadeDB — What is RRF](https://www.paradedb.com/learn/search-concepts/reciprocal-rank-fusion) — RRF semantics, rank-based vs score-based fusion comparison
- [Wikipedia — Discounted Cumulative Gain](https://en.wikipedia.org/wiki/Discounted_cumulative_gain) — DCG/NDCG formula reference
- [evidentlyai.com — NDCG explained](https://www.evidentlyai.com/ranking-metrics/ndcg-metric) — Graded relevance NDCG explanation

### Tertiary (LOW confidence)
- Community GitHub issue ([WiseLibs/better-sqlite3 #1253](https://github.com/WiseLibs/better-sqlite3/issues/1253)) — FTS5 support inquiry; no official resolution visible but SQLite docs confirm FTS5 is standard

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing dependencies confirmed from package.json
- Architecture: HIGH — based on direct codebase reading of manager.ts, store.ts, vectors.ts
- FTS5 patterns: HIGH — official SQLite docs
- RRF formula: HIGH — multiple authoritative sources agree
- NDCG inline: HIGH — well-defined formula, multiple sources
- better-sqlite3 FTS5 support: MEDIUM — SQLite standard but not directly tested on this machine

**Research date:** 2026-06-10
**Valid until:** 2026-07-10 (stable tech — SQLite FTS5, RRF are not changing)
