import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @langfuse/langchain before any imports to avoid real SDK initialization.
vi.mock("@langfuse/langchain", () => {
  const CallbackHandlerMock = vi.fn(function (this: any, opts: any) {
    this._opts = opts;
    this.flushAsync = vi.fn().mockResolvedValue(undefined);
  });
  return { CallbackHandler: CallbackHandlerMock };
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

  it("returns a CallbackHandler when enabled and keys present", async () => {
    process.env["LANGFUSE_ENABLED"] = "true";
    process.env["LANGFUSE_PUBLIC_KEY"] = "pk-test";
    process.env["LANGFUSE_SECRET_KEY"] = "sk-test";
    process.env["LANGFUSE_HOST"] = "http://localhost:3000";
    const { createLangfuseHandler } = await import("./langfuse.js");
    const handler = await createLangfuseHandler({ taskId: "task-123", userId: "user-1" });
    expect(handler).not.toBeNull();
    expect(handler).toHaveProperty("flushAsync");
  });

  it("uses LANGFUSE_HOST from env (not hardcoded)", async () => {
    process.env["LANGFUSE_ENABLED"] = "true";
    process.env["LANGFUSE_PUBLIC_KEY"] = "pk-test";
    process.env["LANGFUSE_SECRET_KEY"] = "sk-test";
    process.env["LANGFUSE_HOST"] = "https://cloud.langfuse.com";
    const { CallbackHandler } = await import("@langfuse/langchain");
    const { createLangfuseHandler } = await import("./langfuse.js");
    await createLangfuseHandler({ taskId: "task-abc" });
    expect(CallbackHandler).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://cloud.langfuse.com" }),
    );
  });

  it("uses taskId as sessionId in handler options", async () => {
    process.env["LANGFUSE_ENABLED"] = "true";
    process.env["LANGFUSE_PUBLIC_KEY"] = "pk-test";
    process.env["LANGFUSE_SECRET_KEY"] = "sk-test";
    const { CallbackHandler } = await import("@langfuse/langchain");
    const { createLangfuseHandler } = await import("./langfuse.js");
    await createLangfuseHandler({ taskId: "my-task-id", userId: "biel" });
    expect(CallbackHandler).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "my-task-id", userId: "biel" }),
    );
  });
});
