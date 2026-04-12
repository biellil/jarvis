/**
 * ChromaDB vector memory — semantic search over past conversations and profile facts.
 *
 * Behavioral parity with src/jarvis/memory/vectors.py (MEM-TS-04, MEM-TS-06).
 *
 * NOTE: The `chromadb` JS client (>=1.x) is a **server client only** — it does not
 * support embedded/persistent mode like the Python `PersistentClient`. Users must
 * run a local Chroma server (`chroma run --path <dir> --port <port>`). This class
 * connects via HTTP to that server. The constructor takes `host`/`port` instead of
 * a filesystem path; the `chromaPath` is documented in the SUMMARY as a server-side
 * concern.
 *
 * We bypass Chroma's default embedding function and pass pre-computed embeddings
 * from our Transformers.js embedder (plan 16-03) to guarantee parity with Python.
 */
import { ChromaClient, type Collection } from 'chromadb';
import { embedText, EMBEDDING_MODEL } from './embeddings.js';
import { config } from '../config.js';

export const COLLECTION_NAME = 'jarvis_memories';

export interface QueryResult {
  id: string;
  document: string;
  similarity: number; // 1 - cosine_distance, in [0, 1]
  metadata?: Record<string, unknown>;
}

export interface MemoryVectorsOptions {
  host?: string;
  port?: number;
  ssl?: boolean;
}

export class MemoryVectors {
  private readonly host: string;
  private readonly port: number;
  private readonly ssl: boolean;
  private client: ChromaClient | null = null;
  private collection: Collection | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(options: MemoryVectorsOptions = {}) {
    this.host = options.host ?? config.chromaHost;
    this.port = options.port ?? config.chromaPort;
    this.ssl = options.ssl ?? false;
  }

  /** Lazy initialization — safe to call repeatedly. */
  async init(): Promise<void> {
    if (this.collection !== null) return;
    if (this.initPromise !== null) {
      await this.initPromise;
      return;
    }
    this.initPromise = (async () => {
      this.client = new ChromaClient({
        host: this.host,
        port: this.port,
        ssl: this.ssl,
      });
      this.collection = await this.client.getOrCreateCollection({
        name: COLLECTION_NAME,
        metadata: {
          'hnsw:space': 'cosine',
          embedding_model: EMBEDDING_MODEL,
        },
        // Pass null to disable Chroma's default JS embedder — we supply our own vectors.
        embeddingFunction: null,
      });
    })();
    try {
      await this.initPromise;
    } catch (err) {
      this.initPromise = null;
      throw err;
    }
  }

  /** Upsert a document into the vector store. Errors are logged and swallowed (parity with Python MEM-05). */
  async addMemory(
    docId: string,
    text: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.init();
      if (this.collection === null) throw new Error('collection not initialized');
      const vec = await embedText(text);
      await this.collection.upsert({
        ids: [docId],
        documents: [text],
        embeddings: [Array.from(vec)],
        metadatas: metadata
          ? [metadata as Record<string, string | number | boolean>]
          : undefined,
      });
    } catch (err) {
      console.warn(`[vectors] Failed to add memory ${docId}:`, err);
    }
  }

  /**
   * Return top-K documents by semantic similarity.
   * @param threshold - Optional: filter out results with similarity < threshold (in [0, 1]).
   */
  async queryMemories(
    queryText: string,
    nResults = 5,
    threshold?: number,
  ): Promise<QueryResult[]> {
    try {
      await this.init();
      if (this.collection === null) throw new Error('collection not initialized');
      const count = await this.collection.count();
      if (count === 0) return [];
      const actualN = Math.min(nResults, count);
      const qvec = await embedText(queryText);
      const r = await this.collection.query({
        queryEmbeddings: [Array.from(qvec)],
        nResults: actualN,
      });

      const ids = r.ids?.[0] ?? [];
      const docs = r.documents?.[0] ?? [];
      const dists = r.distances?.[0] ?? [];
      const metas = r.metadatas?.[0] ?? [];

      const out: QueryResult[] = [];
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const doc = docs[i];
        const dist = dists[i];
        if (id === undefined || doc === null || doc === undefined || dist === null || dist === undefined) {
          continue;
        }
        const similarity = 1 - dist;
        if (threshold !== undefined && similarity < threshold) continue;
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
      console.warn('[vectors] Failed to query memories:', err);
      return [];
    }
  }
}
