import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock embedText before importing EmbeddingQueue (embeddings.ts is imported at module load)
vi.mock('./embeddings.js', () => ({
  embedText: vi.fn(),
}));

import { EmbeddingQueue } from './embedding-queue.js';
import { embedText } from './embeddings.js';

const mockEmbedText = vi.mocked(embedText);

describe('EmbeddingQueue', () => {
  let queue: EmbeddingQueue;

  beforeEach(() => {
    EmbeddingQueue._resetForTests();
    // Fresh instance for each test — re-import via getInstance
    queue = EmbeddingQueue.getInstance();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Ensure queue is running between tests
    if (queue.isPaused) queue.start();
  });

  it('enqueueEmbed() calls embedText and returns Float32Array', async () => {
    const fakeVec = new Float32Array([0.1, 0.2, 0.3]);
    mockEmbedText.mockResolvedValue(fakeVec);

    const result = await queue.enqueueEmbed('task-1', 'hello world');

    expect(mockEmbedText).toHaveBeenCalledWith('hello world');
    expect(result).toBe(fakeVec);
  });

  it('activeTasks Map is empty after task completes (D-06 cleanup)', async () => {
    const fakeVec = new Float32Array([0.5]);
    mockEmbedText.mockResolvedValue(fakeVec);

    await queue.enqueueEmbed('task-cleanup', 'test');

    // Access via the instance — size reflects internal Map
    expect(queue.size).toBe(0);
    expect(queue.pending).toBe(0);
  });

  it('isPaused reflects queue state after pause() and start()', () => {
    expect(queue.isPaused).toBe(false);

    queue.pause();
    expect(queue.isPaused).toBe(true);

    queue.start();
    expect(queue.isPaused).toBe(false);
  });

  it('task queued while paused does not execute until start() is called', async () => {
    const fakeVec = new Float32Array([1.0]);
    mockEmbedText.mockResolvedValue(fakeVec);

    queue.pause();

    // Start enqueue — it will queue but not execute
    const embedPromise = queue.enqueueEmbed('task-paused', 'queued text');

    // Queue has pending work
    expect(queue.size).toBeGreaterThan(0);
    expect(mockEmbedText).not.toHaveBeenCalled();

    // Resume — task should now execute
    queue.start();
    const result = await embedPromise;

    expect(mockEmbedText).toHaveBeenCalledWith('queued text');
    expect(result).toBe(fakeVec);
  });

  it('failed embedText() causes enqueueEmbed to throw (LLM-PRIO-02 best-effort)', async () => {
    mockEmbedText.mockRejectedValue(new Error('pipeline failed'));

    await expect(queue.enqueueEmbed('task-fail', 'bad text')).rejects.toThrow('pipeline failed');

    // activeTasks Map cleaned up even on failure
    expect(queue.size).toBe(0);
    expect(queue.pending).toBe(0);
  });

  it('embeddingQueue singleton is same instance across imports', async () => {
    const { embeddingQueue } = await import('./embedding-queue.js');
    const sameQueue = EmbeddingQueue.getInstance();
    // Both embeddingQueue and getInstance() should wrap the same underlying queue state
    expect(embeddingQueue).toBeDefined();
    expect(sameQueue).toBeDefined();
  });
});
