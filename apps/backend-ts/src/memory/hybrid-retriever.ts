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

export interface RetrieveOptions {
  /** Phase 94 D-03/D-04: filter all branches to this speaker. undefined = no filter (legacy/unknown path). */
  speakerId?: string;
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

  async retrieve(queryText: string, opts: RetrieveOptions = {}): Promise<HybridResult[]> {
    // 1. Semantic ranking (parallel across 3 collections, merged)
    const whereFilter = opts.speakerId ? { speaker_id: opts.speakerId } : undefined;
    const [semSemantic, semEpisodic, semProcedural] = await Promise.all([
      this.vectors.queryMemoriesByType(queryText, 'semantic', SEMANTIC_PER_TYPE, whereFilter),
      this.vectors.queryMemoriesByType(queryText, 'episodic', SEMANTIC_PER_TYPE, whereFilter),
      this.vectors.queryMemoriesByType(queryText, 'procedural', SEMANTIC_PER_TYPE, whereFilter),
    ]);

    // Deduplicate and assign 1-based semantic rank (order from Chroma is already ranked by similarity)
    const semanticList = this._deduplicateByRank([...semSemantic, ...semEpisodic, ...semProcedural]);

    // 2. Keyword ranking via FTS5
    const keywordList = this._queryFts5(queryText, KEYWORD_POOL, opts.speakerId);

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

  /**
   * Query FTS5 for keyword matches.
   *
   * Strategy:
   *  - Single-word query → phrase search (exact token match, high precision)
   *  - Multi-word query → token OR search (any word matches, higher recall)
   *    This is intentional: for conversational queries like "Python automação scripts",
   *    phrase search requires exact word sequence in the document (fails most of the time).
   *    Token search matches documents containing ANY of the query terms, letting FTS5
   *    rank signal complement semantic ranking via RRF.
   */
  private _queryFts5(queryText: string, limit: number, speakerId?: string): Array<{ id: string }> {
    // Tokenize: strip punctuation/special chars (keep unicode word chars + spaces)
    const tokens = queryText
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .trim()
      .split(/\s+/)
      .filter(t => t.length > 0);

    if (tokens.length === 0) return [];

    try {
      const baseQuery = speakerId
        ? `SELECT tm.id FROM typed_memories_fts fts JOIN typed_memories tm ON fts.rowid = tm.rowid WHERE fts.typed_memories_fts MATCH ? AND tm.speaker_id = ? ORDER BY fts.rank LIMIT ?`
        : `SELECT id FROM typed_memories_fts WHERE typed_memories_fts MATCH ? ORDER BY rank LIMIT ?`;

      const stmt = this.sqlite.prepare(baseQuery);

      if (tokens.length === 1) {
        // Single-word: phrase search for exact token match
        const safe = tokens[0].replace(/"/g, '""');
        if (speakerId) {
          return stmt.all(`"${safe}"`, speakerId, limit) as Array<{ id: string }>;
        }
        return stmt.all(`"${safe}"`, limit) as Array<{ id: string }>;
      }

      // Multi-word: OR token search — any token matching boosts the result
      // FTS5 implicit OR: pass space-separated tokens without quotes
      const tokenQuery = tokens.map(t => t.replace(/"/g, '""')).join(' OR ');
      if (speakerId) {
        return stmt.all(tokenQuery, speakerId, limit) as Array<{ id: string }>;
      }
      return stmt.all(tokenQuery, limit) as Array<{ id: string }>;
    } catch {
      // Final fallback: try raw token string (no speaker filter — best-effort)
      try {
        const raw = tokens.join(' ');
        const stmt = this.sqlite.prepare(
          `SELECT id FROM typed_memories_fts WHERE typed_memories_fts MATCH ? ORDER BY rank LIMIT ?`,
        );
        return stmt.all(raw, limit) as Array<{ id: string }>;
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
