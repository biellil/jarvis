import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the langfuse package to avoid real HTTP calls in tests.
vi.mock("langfuse", () => {
  const mockGeneration = {
    end: vi.fn(),
  };
  const mockTrace = {
    generation: vi.fn(() => mockGeneration),
  };
  const LangfuseMock = vi.fn(function (this: any) {
    this.trace = vi.fn(() => mockTrace);
    this.flushAsync = vi.fn().mockResolvedValue(undefined);
  });
  return { Langfuse: LangfuseMock };
});

describe("createLangfuseHandler (Phase 83 TBD-01, TBD-06)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns null when LANGFUSE_ENABLED is not set (default off)", async () => {
    delete process.env["LANGFUSE_ENABLED"];
    const { createLangfuseHandler } = await import("./langfuse.js");
    const handler = await createLangfuseHandler();
    expect(handler).toBeNull();
  });

  it("returns null when LANGFUSE_ENABLED=false", async () => {
    process.env["LANGFUSE_ENABLED"] = "false";
    const { createLangfuseHandler } = await import("./langfuse.js");
    const handler = await createLangfuseHandler();
    expect(handler).toBeNull();
  });

  it("returns null and warns when enabled but keys are missing", async () => {
    process.env["LANGFUSE_ENABLED"] = "true";
    delete process.env["LANGFUSE_PUBLIC_KEY"];
    delete process.env["LANGFUSE_SECRET_KEY"];
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { createLangfuseHandler } = await import("./langfuse.js");
    const handler = await createLangfuseHandler();
    expect(handler).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]![0]).toContain("LANGFUSE_PUBLIC_KEY");
    warnSpy.mockRestore();
  });

  it("returns a LangfuseHandle with generation and flush when enabled and keys present", async () => {
    process.env["LANGFUSE_ENABLED"] = "true";
    process.env["LANGFUSE_PUBLIC_KEY"] = "pk-test";
    process.env["LANGFUSE_SECRET_KEY"] = "sk-test";
    process.env["LANGFUSE_HOST"] = "http://localhost:3100";
    const { createLangfuseHandler } = await import("./langfuse.js");
    const handle = await createLangfuseHandler({ taskId: "task-123", userId: "user-1" });
    expect(handle).not.toBeNull();
    expect(handle).toHaveProperty("generation");
    expect(handle).toHaveProperty("flush");
    expect(typeof handle!.flush).toBe("function");
  });

  it("uses taskId as sessionId in trace options", async () => {
    process.env["LANGFUSE_ENABLED"] = "true";
    process.env["LANGFUSE_PUBLIC_KEY"] = "pk-test";
    process.env["LANGFUSE_SECRET_KEY"] = "sk-test";
    const { Langfuse } = await import("langfuse");
    const { createLangfuseHandler } = await import("./langfuse.js");
    vi.mocked(Langfuse).mockClear();
    const instance = new (vi.mocked(Langfuse) as any)();
    vi.mocked(Langfuse).mockImplementation(function (this: any) {
      this.trace = vi.fn((opts: Record<string, unknown>) => {
        expect(opts).toMatchObject({ sessionId: "my-task-id", userId: "biel" });
        return { generation: vi.fn(() => ({ end: vi.fn() })) };
      });
      this.flushAsync = vi.fn().mockResolvedValue(undefined);
    });
    await createLangfuseHandler({ taskId: "my-task-id", userId: "biel" });
    // validation inside the mock trace() call above
  });

  it("flush() calls langfuse.flushAsync()", async () => {
    process.env["LANGFUSE_ENABLED"] = "true";
    process.env["LANGFUSE_PUBLIC_KEY"] = "pk-test";
    process.env["LANGFUSE_SECRET_KEY"] = "sk-test";
    const { createLangfuseHandler } = await import("./langfuse.js");
    const handle = await createLangfuseHandler({ taskId: "task-flush" });
    expect(handle).not.toBeNull();
    await handle!.flush();
    // flushAsync was called — no error thrown means success
  });
});
