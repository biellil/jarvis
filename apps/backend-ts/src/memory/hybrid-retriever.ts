import Database from 'better-sqlite3';
import type { MemoryVectors, QueryResult } from './vectors.js';

export interface HybridRetrieverOptions {
  topK?: number;
  weights?: { semantic: number; keyword: number; recency: number };
  rrfK?: number;
}

export interface HybridResult {
  id: string;
  document: string;
  score: number;
}

const DEFAULT_WEIGHTS = { semantic: 0.6, keyword: 0.25, recency: 0.15 };
const DEFAULT_K = 60;
const DEFAULT_TOP_K = 12;
// Semantic pool: 5 per type × 3 types = up to 15; keyword pool: 15; recency across candidates
const SEMANTIC_PER_TYPE = 5;
const KEYWORD_POOL = 15;

export class HybridRetriever {
  private readonly topK: number;
  private readonly weights: { semantic: number; keyword: number; recency: number };
  private readonly rrfK: number;

  constructor(
    private readonly sqlite: Database.Database,
    private readonly vectors: MemoryVectors,
    opts: HybridRetrieverOptions = {},
  ) {
    this.topK = opts.topK ?? DEFAULT_TOP_K;
    this.weights = opts.weights ?? DEFAULT_WEIGHTS;
    this.rrfK = opts.rrfK ?? DEFAULT_K;
  }

  async retrieve(queryText: string): Promise<HybridResult[]> {
    // 1. Semantic ranking (parallel across 3 collections, merged)
    const [semSemantic, semEpisodic, semProcedural] = await Promise.all([
      this.vectors.queryMemoriesByType(queryText, 'semantic', SEMANTIC_PER_TYPE),
      this.vectors.queryMemoriesByType(queryText, 'episodic', SEMANTIC_PER_TYPE),
      this.vectors.queryMemoriesByType(queryText, 'procedural', SEMANTIC_PER_TYPE),
    ]);

    // Deduplicate and assign 1-based semantic rank (order from Chroma is already ranked by similarity)
    const semanticList = this._deduplicateByRank([...semSemantic, ...semEpisodic, ...semProcedural]);

    // 2. Keyword ranking via FTS5
    const keywordList = this._queryFts5(queryText, KEYWORD_POOL);

    // 3. Collect union of candidate IDs
    const allCandidateIds = new Set<string>([
      ...semanticList.map(m => m.id),
      ...keywordList.map(m => m.id),
    ]);

    if (allCandidateIds.size === 0) return [];

    // 4. Fetch createdAt for all candidates (for recency ranking)
    const idList = Array.from(allCandidateIds);
    const candidateMeta = this._fetchCandidateMeta(idList);

    // 5. Build recency rank map (1-based, most recent = rank 1)
    const sorted = [...candidateMeta].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const recencyRank = new Map(sorted.map((m, i) => [m.id, i + 1]));

    // 6. Build rank maps
    const semRank = new Map(semanticList.map((m, i) => [m.id, i + 1]));
    const kwRank = new Map(keywordList.map((m, i) => [m.id, i + 1]));

    // 7. Build doc content map (semantic list has documents; keyword has ids only)
    const docMap = new Map<string, string>(semanticList.map(m => [m.id, m.document]));
    // For keyword-only candidates, fetch content from SQLite
    const keywordOnlyIds = idList.filter(id => !docMap.has(id));
    if (keywordOnlyIds.length > 0) {
      const rows = this._fetchDocuments(keywordOnlyIds);
      for (const row of rows) docMap.set(row.id, row.content);
    }

    // 8. Weighted RRF scoring
    const { semantic: ws, keyword: wk, recency: wr } = this.weights;
    const k = this.rrfK;

    const scored: HybridResult[] = Array.from(allCandidateIds).map(id => {
      let score = 0;
      const sr = semRank.get(id);
      const kr = kwRank.get(id);
      const rr = recencyRank.get(id);
      if (sr !== undefined) score += ws * (1 / (k + sr));
      if (kr !== undefined) score += wk * (1 / (k + kr));
      if (rr !== undefined) score += wr * (1 / (k + rr));
      return { id, document: docMap.get(id) ?? '', score };
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, this.topK);
  }

  /** Deduplicate semantic results preserving first occurrence (best rank). */
  private _deduplicateByRank(results: QueryResult[]): QueryResult[] {
    const seen = new Set<string>();
    return results.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }

  /** Query FTS5 for keyword matches. Sanitizes input by wrapping in quotes. */
  private _queryFts5(queryText: string, limit: number): Array<{ id: string }> {
    try {
      // Sanitize: escape double quotes, wrap in quotes for phrase/token match
      const safe = queryText.replace(/"/g, '""');
      const stmt = this.sqlite.prepare(
        `SELECT id FROM typed_memories_fts WHERE typed_memories_fts MATCH ? ORDER BY rank LIMIT ?`,
      );
      return stmt.all(`"${safe}"`, limit) as Array<{ id: string }>;
    } catch {
      // FTS5 syntax error on unusual input — fallback to token search
      try {
        const tokens = queryText.replace(/[^\w\s]/g, ' ').trim();
        if (!tokens) return [];
        const stmt = this.sqlite.prepare(
          `SELECT id FROM typed_memories_fts WHERE typed_memories_fts MATCH ? ORDER BY rank LIMIT ?`,
        );
        return stmt.all(tokens, limit) as Array<{ id: string }>;
      } catch {
        return [];
      }
    }
  }

  /** Fetch id + createdAt for a list of candidate IDs. */
  private _fetchCandidateMeta(ids: string[]): Array<{ id: string; createdAt: string }> {
    if (ids.length === 0) return [];
    try {
      const placeholders = ids.map(() => '?').join(',');
      const stmt = this.sqlite.prepare(
        `SELECT id, created_at as createdAt FROM typed_memories WHERE id IN (${placeholders})`,
      );
      return stmt.all(...ids) as Array<{ id: string; createdAt: string }>;
    } catch {
      return ids.map(id => ({ id, createdAt: new Date(0).toISOString() }));
    }
  }

  /** Fetch id + content for keyword-only candidates not found in semantic list. */
  private _fetchDocuments(ids: string[]): Array<{ id: string; content: string }> {
    if (ids.length === 0) return [];
    try {
      const placeholders = ids.map(() => '?').join(',');
      const stmt = this.sqlite.prepare(
        `SELECT id, content FROM typed_memories WHERE id IN (${placeholders})`,
      );
      return stmt.all(...ids) as Array<{ id: string; content: string }>;
    } catch {
      return [];
    }
  }
}
