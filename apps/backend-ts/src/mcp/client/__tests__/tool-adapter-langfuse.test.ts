/**
 * Unit tests for Langfuse span instrumentation in tool-adapter.ts (TBD-04).
 *
 * Separate file from tool-adapter.test.ts to allow vi.resetModules() without
 * affecting existing static imports in the other test file.
 */
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

const sampleDef = {
  name: "send_email",
  description: "Sends an email via SMTP",
  inputSchema: {
    type: "object" as const,
    properties: { to: { type: "string" }, body: { type: "string" } },
    required: ["to", "body"],
  },
};

function makeClient(callTool: (req: any) => Promise<any>): any {
  return { callTool: vi.fn(callTool) };
}
function makeLogger(): any {
  return { logDispatch: vi.fn(() => 1) };
}

describe("tool-adapter.ts — Langfuse spans (TBD-04)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
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

    it("creates span with correct name 'mcp:{serverName}.{toolName}' on invocation", async () => {
      const { buildLangChainTool } = await import("../tool-adapter.js");
      const client = makeClient(async () => ({
        content: [{ type: "text", text: "ok" }],
      }));
      const t = buildLangChainTool(
        sampleDef,
        "n8n",
        client,
        new Set(),
        makeLogger(),
      )!;
      await t.invoke({ to: "a@b", body: "hi" });

      expect(mockSpan).toHaveBeenCalledWith(
        expect.objectContaining({ name: "mcp:n8n.send_email" }),
      );
      // Verify name matches the mcp:{serverName}.{toolName} pattern
      const spanName = (mockSpan.mock.calls[0] as unknown[])?.[0] as { name?: string } | undefined;
      expect(spanName?.name).toMatch(/^mcp:[^.]+\.[^.]+$/);
    });

    it("calls span.end on successful tool invocation", async () => {
      const { buildLangChainTool } = await import("../tool-adapter.js");
      const client = makeClient(async () => ({
        content: [{ type: "text", text: "ok" }],
      }));
      const t = buildLangChainTool(
        sampleDef,
        "n8n",
        client,
        new Set(),
        makeLogger(),
      )!;
      await t.invoke({ to: "a@b", body: "hi" });

      expect(mockSpanEnd).toHaveBeenCalled();
      // Success path ends with output object (not error level)
      const endArgs = mockSpanEnd.mock.calls[0]?.[0];
      expect(endArgs).toBeDefined();
      expect(endArgs).not.toMatchObject({ level: "ERROR" });
    });

    it("calls span.end with level: 'ERROR' on AbortError path", async () => {
      const { buildLangChainTool } = await import("../tool-adapter.js");
      const controller = new AbortController();
      controller.abort(
        new DOMException("The operation was aborted.", "AbortError"),
      );
      const client = {
        callTool: vi.fn(
          async (
            _req: unknown,
            _schema: unknown,
            opts: { signal?: AbortSignal },
          ) => {
            if (opts?.signal?.aborted) {
              throw new DOMException(
                "The operation was aborted.",
                "AbortError",
              );
            }
            return new Promise(() => {});
          },
        ),
      };
      const ctx = {
        logger: makeLogger(),
        getListener: () => null,
        getSignal: () => controller.signal,
        getTaskMeta: () => null,
      };
      const t = buildLangChainTool(
        sampleDef,
        "n8n",
        client as any,
        new Set(),
        makeLogger(),
        ctx,
      )!;
      await t.invoke({ to: "a@b", body: "hi" });

      expect(mockSpanEnd).toHaveBeenCalledWith(
        expect.objectContaining({ level: "ERROR" }),
      );
    });

    it("calls span.end with level: 'ERROR' on generic error path", async () => {
      const { buildLangChainTool } = await import("../tool-adapter.js");
      const client = makeClient(async () => {
        throw new Error("ECONNREFUSED");
      });
      const t = buildLangChainTool(
        sampleDef,
        "n8n",
        client,
        new Set(),
        makeLogger(),
      )!;
      await t.invoke({ to: "a@b", body: "hi" });

      expect(mockSpanEnd).toHaveBeenCalledWith(
        expect.objectContaining({ level: "ERROR" }),
      );
    });
  });

  describe("when LANGFUSE_ENABLED=false (default)", () => {
    beforeEach(() => {
      delete process.env["LANGFUSE_ENABLED"];
    });

    it("does not create any span when tool is invoked", async () => {
      const { buildLangChainTool } = await import("../tool-adapter.js");
      const client = makeClient(async () => ({
        content: [{ type: "text", text: "ok" }],
      }));
      const t = buildLangChainTool(
        sampleDef,
        "n8n",
        client,
        new Set(),
        makeLogger(),
      )!;
      await t.invoke({ to: "a@b", body: "hi" });

      expect(mockSpan).not.toHaveBeenCalled();
    });
  });
});
