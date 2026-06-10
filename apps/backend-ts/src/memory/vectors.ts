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
import { Langfuse } from 'langfuse';
import { embedText, EMBEDDING_MODEL } from './embeddings.js';
import { embeddingQueue } from './embedding-queue.js';
import { config } from '../config.js';

export const COLLECTION_NAME = 'jarvis_memories';

// Langfuse manual spans for ChromaDB operations (Phase 83).
// Module-level singleton — correct for manual spans (unlike CallbackHandler which is per-request).
// null when LANGFUSE_ENABLED=false (zero overhead on disabled path).
const _langfuse = config.langfuseEnabled
  ? new Langfuse({
      publicKey: config.langfusePublicKey,
      secretKey: config.langfuseSecretKey,
      baseUrl: config.langfuseHost,
    })
  : null;

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
  private typedCollections: Map<string, Collection> = new Map();
  private typedInitPromise: Promise<void> | null = null;

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

  /**
   * Upsert a document into the vector store. Errors are logged and swallowed (parity with Python MEM-05).
   * Returns true on successful upsert, false if any error was caught.
   */
  async addMemory(
    docId: string,
    text: string,
    metadata?: Record<string, unknown>,
  ): Promise<boolean> {
    const span = _langfuse?.span({ name: 'memory:add', input: { docId, textLength: text.length } });
    try {
      await this.init();
      if (this.collection === null) throw new Error('collection not initialized');
      const vec = await embeddingQueue.enqueueEmbed(docId, text);
      await this.collection.upsert({
        ids: [docId],
        documents: [text],
        embeddings: [Array.from(vec)],
        metadatas: metadata
          ? [metadata as Record<string, string | number | boolean>]
          : undefined,
      });
      span?.end({ output: { success: true } });
      return true;
    } catch (err) {
      span?.end({ level: 'ERROR', statusMessage: (err as Error).message });
      console.warn(`[vectors] Failed to add memory ${docId}:`, err);
      return false;
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
    const span = _langfuse?.span({ name: 'memory:vector-query', input: { queryText, nResults, threshold } });
    try {
      await this.init();
      if (this.collection === null) throw new Error('collection not initialized');
      const count = await this.collection.count();
      if (count === 0) {
        span?.end({ output: { found: 0 } });
        return [];
      }
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
      span?.end({ output: { found: out.length } });
      return out;
    } catch (err) {
      span?.end({ level: 'ERROR', statusMessage: (err as Error).message });
      console.warn('[vectors] Failed to query memories:', err);
      return [];
    }
  }

  /**
   * Lazily initialize the 3 typed ChromaDB collections:
   *   memories_semantic, memories_episodic, memories_procedural
   *
   * Safe to call repeatedly — subsequent calls await the same promise.
   * Requires the base client to be initialized first (calls init() internally).
   */
  private async initTypedCollections(): Promise<void> {
    if (this.typedCollections.size === 3) return;
    if (this.typedInitPromise !== null) {
      await this.typedInitPromise;
      return;
    }
    this.typedInitPromise = (async () => {
      await this.init(); // ensure base client is ready
      if (this.client === null) throw new Error('ChromaDB client not initialized');
      const types = ['semantic', 'episodic', 'procedural'] as const;
      for (const type of types) {
        const col = await this.client.getOrCreateCollection({
          name: `memories_${type}`,
          metadata: { type },
          embeddingFunction: null,
        });
        this.typedCollections.set(type, col);
      }
    })();
    try {
      await this.typedInitPromise;
    } catch (err) {
      this.typedInitPromise = null;
      throw err;
    }
  }

  /**
   * Return the union of all document IDs across the 3 typed collections.
   * Used by validateMemoryConsistency() to cross-check against SQLite typed_memories.
   * Returns empty Set on error (MEM-05 parity).
   */
  async getAllDocIds(): Promise<Set<string>> {
    try {
      await this.initTypedCollections();
      const ids = new Set<string>();
      for (const col of this.typedCollections.values()) {
        const result = await col.get();
        for (const id of result.ids) {
          ids.add(id);
        }
      }
      return ids;
    } catch (err) {
      console.warn('[vectors] getAllDocIds failed:', err);
      return new Set();
    }
  }

  /**
   * Write a typed memory to the appropriate ChromaDB collection.
   * Routes by type: 'semantic' → memories_semantic, etc.
   * Errors are logged and swallowed (MEM-05 parity). Never throws.
   * Returns true on successful upsert, false if any error was caught.
   */
  async addTypedMemory(
    docId: string,
    text: string,
    type: 'semantic' | 'episodic' | 'procedural',
    metadata?: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      await this.initTypedCollections();
      const collection = this.typedCollections.get(type);
      if (!collection) {
        throw new Error(`Collection ${type} not initialized`);
      }
      const vec = await embeddingQueue.enqueueEmbed(docId, text);
      await collection.upsert({
        ids: [docId],
        documents: [text],
        embeddings: [Array.from(vec)],
        metadatas: metadata
          ? [metadata as Record<string, string | number | boolean>]
          : undefined,
      });
      return true;
    } catch (err) {
      console.warn(`[vectors] addTypedMemory ${type} failed: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Phase 94: Backfill speaker_id = 'unknown' in metadata for all existing ChromaDB docs.
   * Patches metadata only — NO embeddings or documents in the update call (D-09: preserves existing vectors).
   * Idempotent and safe to re-run.
   */
  async backfillSpeakerIds(): Promise<void> {
    try {
      await this.initTypedCollections();
      const BATCH = 100;
      for (const [type, col] of this.typedCollections.entries()) {
        // Fetch all IDs (no filter = get everything)
        const result = await col.get({ include: [] as any });
        const allIds = result.ids;
        for (let i = 0; i < allIds.length; i += BATCH) {
          const batch = allIds.slice(i, i + BATCH);
          // Pass ONLY ids + metadatas — NO embeddings/documents (D-09: preserves vectors)
          await col.update({
            ids: batch,
            metadatas: batch.map(() => ({ speaker_id: 'unknown' })),
          });
        }
        console.log(`[Chroma] ✅ backfilled speaker_id on ${allIds.length} docs in memories_${type}`);
      }
    } catch (err) {
      console.warn(`[vectors] backfillSpeakerIds failed: ${(err as Error).message}`);
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
    whereFilter?: Record<string, string>,
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
        ...(whereFilter ? { where: whereFilter as any } : {}),
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
        if (
          id === undefined ||
          doc === null ||
          doc === undefined ||
          dist === null ||
          dist === undefined
        )
          continue;
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
}
