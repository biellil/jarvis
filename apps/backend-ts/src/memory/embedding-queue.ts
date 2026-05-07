import PQueue from 'p-queue';
import { embedText } from './embeddings.js';

const EMBEDDING_PRIORITY = 1;

class EmbeddingQueue {
  private static instance: EmbeddingQueue | null = null;
  private queue: PQueue;
  private activeTasks: Map<string, AbortController> = new Map();

  private constructor() {
    this.queue = new PQueue({
      concurrency: 1,
      autoStart: true,
    });
  }

  static getInstance(): EmbeddingQueue {
    if (!EmbeddingQueue.instance) {
      EmbeddingQueue.instance = new EmbeddingQueue();
    }
    return EmbeddingQueue.instance;
  }

  /**
   * Enqueue a text embedding write task at low priority.
   * AbortController manages activeTasks Map lifetime only — does NOT interrupt
   * @xenova/transformers v2.17.2 (no native AbortSignal support in this version).
   * Cleanup is guaranteed via finally block (D-06).
   */
  async enqueueEmbed(taskId: string, text: string): Promise<Float32Array> {
    const controller = new AbortController();
    this.activeTasks.set(taskId, controller);

    try {
      const result = await this.queue.add(
        async () => {
          const vec = await embedText(text);
          return vec;
        },
        { priority: EMBEDDING_PRIORITY },
      );
      if (result === undefined) {
        throw new Error(`[embedding-queue] Task ${taskId} returned undefined (queue may have been cleared)`);
      }
      return result;
    } catch (err) {
      console.warn(`[embedding-queue] Task ${taskId} failed: ${(err as Error).message}`);
      throw err;
    } finally {
      // D-06: mandatory cleanup — prevents unbounded Map growth (soak test: heap <100MB)
      this.activeTasks.delete(taskId);
    }
  }

  /** Pause the queue — no new tasks will START while paused. In-flight tasks continue to completion. */
  pause(): void {
    console.log('[embedding-queue] Pausing (chat request in flight)');
    this.queue.pause();
  }

  /** Resume the queue after a chat request completes. */
  start(): void {
    console.log('[embedding-queue] Resuming');
    this.queue.start();
  }

  get isPaused(): boolean {
    return this.queue.isPaused;
  }

  get size(): number {
    return this.queue.size;
  }

  get pending(): number {
    return this.queue.pending;
  }

  /** For testing: reset singleton state between test runs. */
  static _resetForTests(): void {
    EmbeddingQueue.instance = null;
  }
}

export const embeddingQueue = EmbeddingQueue.getInstance();
export { EmbeddingQueue };
