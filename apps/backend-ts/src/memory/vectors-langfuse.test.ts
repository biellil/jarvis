import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @langfuse/core to capture span creation and span.end calls
const mockSpanEnd = vi.fn();
const mockSpan = vi.fn(() => ({ end: mockSpanEnd }));
const mockLangfuseInstance = { span: mockSpan };

vi.mock("langfuse", () => ({
  // Must use function keyword — arrow functions cannot be called with `new`
  Langfuse: vi.fn(function (this: unknown) {
    return mockLangfuseInstance;
  }),
}));

// Mock collection methods — mutable so error-path tests can override them
const mockCount = vi.fn().mockResolvedValue(0);
const mockQuery = vi.fn().mockResolvedValue({
  ids: [[]],
  documents: [[]],
  distances: [[]],
  metadatas: [[]],
});
const mockUpsert = vi.fn().mockResolvedValue(undefined);

// Mock chromadb and embedding to avoid real I/O
vi.mock("chromadb", () => ({
  // Must use function keyword — arrow functions cannot be called with `new`
  ChromaClient: vi.fn(function (this: unknown) {
    return {
      getOrCreateCollection: vi.fn().mockResolvedValue({
        count: mockCount,
        query: mockQuery,
        upsert: mockUpsert,
      }),
    };
  }),
}));

// Mock the embedding queue to avoid real embedding
vi.mock("./embedding-queue.js", () => ({
  embeddingQueue: {
    enqueueEmbed: vi.fn().mockResolvedValue(new Float32Array([0.1, 0.2, 0.3])),
  },
}));

describe("vectors.ts — Langfuse spans (TBD-03)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // Reset mock implementations to defaults
    mockCount.mockResolvedValue(0);
    mockQuery.mockResolvedValue({
      ids: [[]],
      documents: [[]],
      distances: [[]],
      metadatas: [[]],
    });
    mockUpsert.mockResolvedValue(undefined);
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("when LANGFUSE_ENABLED=true", () => {
    beforeEach(() => {
      process.env["LANGFUSE_ENABLED"] = "true";
      process.env["LANGFUSE_PUBLIC_KEY"] = "pk-test";
      process.env["LANGFUSE_SECRET_KEY"] = "sk-test";
      process.env["LANGFUSE_HOST"] = "http://localhost:3000";
    });

    it("creates 'memory:vector-query' span when queryMemories is called", async () => {
      const { MemoryVectors } = await import("./vectors.js");
      const store = new MemoryVectors();
      await store.queryMemories("test query", 3);

      expect(mockSpan).toHaveBeenCalledWith(
        expect.objectContaining({ name: "memory:vector-query" }),
      );
    });

    it("calls span.end on success path of queryMemories (count=0 early return)", async () => {
      const { MemoryVectors } = await import("./vectors.js");
      const store = new MemoryVectors();
      await store.queryMemories("test query", 3);

      expect(mockSpanEnd).toHaveBeenCalled();
      // On empty collection path (count=0), span ends with found: 0
      const endCall = mockSpanEnd.mock.calls[0]?.[0];
      expect(endCall).toMatchObject({ output: { found: 0 } });
    });

    it("creates 'memory:add' span when addMemory is called", async () => {
      const { MemoryVectors } = await import("./vectors.js");
      const store = new MemoryVectors();
      await store.addMemory("doc-1", "test content", {});

      expect(mockSpan).toHaveBeenCalledWith(
        expect.objectContaining({ name: "memory:add" }),
      );
    });

    it("calls span.end on success path of addMemory", async () => {
      const { MemoryVectors } = await import("./vectors.js");
      const store = new MemoryVectors();
      await store.addMemory("doc-2", "test content");

      expect(mockSpanEnd).toHaveBeenCalled();
      const endCall = mockSpanEnd.mock.calls[0]?.[0];
      expect(endCall).toMatchObject({ output: { success: true } });
    });

    it("calls span.end with status: 'error' on queryMemories error path", async () => {
      // Simulate ChromaDB failure on count()
      mockCount.mockRejectedValueOnce(new Error("ChromaDB error"));

      const { MemoryVectors } = await import("./vectors.js");
      const store = new MemoryVectors();
      const result = await store.queryMemories("test query");

      // Returns [] on error (MEM-05 parity)
      expect(result).toEqual([]);
      // span.end should have been called with level: "ERROR"
      expect(mockSpanEnd).toHaveBeenCalledWith(
        expect.objectContaining({ level: "ERROR" }),
      );
    });

    it("calls span.end with status: 'error' on addMemory error path", async () => {
      // Simulate ChromaDB failure on upsert()
      mockUpsert.mockRejectedValueOnce(new Error("upsert failed"));

      const { MemoryVectors } = await import("./vectors.js");
      const store = new MemoryVectors();
      const result = await store.addMemory("doc-err", "content");

      // Returns false on error (MEM-05 parity)
      expect(result).toBe(false);
      // span.end should have been called with level: "ERROR"
      expect(mockSpanEnd).toHaveBeenCalledWith(
        expect.objectContaining({ level: "ERROR" }),
      );
    });
  });

  describe("when LANGFUSE_ENABLED=false (default)", () => {
    beforeEach(() => {
      delete process.env["LANGFUSE_ENABLED"];
    });

    it("does not create any span when queryMemories is called", async () => {
      const { MemoryVectors } = await import("./vectors.js");
      const store = new MemoryVectors();
      await store.queryMemories("test query");

      expect(mockSpan).not.toHaveBeenCalled();
    });

    it("does not create any span when addMemory is called", async () => {
      const { MemoryVectors } = await import("./vectors.js");
      const store = new MemoryVectors();
      await store.addMemory("doc-3", "content");

      expect(mockSpan).not.toHaveBeenCalled();
    });
  });
});
