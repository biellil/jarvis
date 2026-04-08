/**
 * Gateway chat stream — Authorization forwarding tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { chatRouter } from "../routes/chat.js";

vi.mock("undici", () => ({
  fetch: vi.fn(),
}));

function makeSseBody(chunks: string[]) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    getReader() {
      return {
        read: async () => {
          if (i >= chunks.length) return { done: true, value: undefined };
          return { done: false, value: encoder.encode(chunks[i++]) };
        },
      };
    },
  };
}

describe("Gateway GET /api/chat/stream — Authorization forwarding", () => {
  let app: Express;
  let mockFetch: any;

  beforeEach(async () => {
    const { fetch } = await import("undici");
    mockFetch = fetch as any;
    mockFetch.mockReset();

    app = express();
    app.use(express.json());
    app.use("/api", chatRouter);
    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(err.status || 500).json({
        error: err.message || "Internal server error",
        code: err.code || "UNKNOWN_ERROR",
      });
    });
  });

  afterEach(() => {
    delete process.env.JARVIS_API_KEY;
  });

  it("forwards client Authorization header to upstream", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeSseBody(["data: hi\n\n"]),
    });

    await request(app)
      .get("/api/chat/stream?message=oi")
      .set("Authorization", "Bearer xyz")
      .expect(200);

    const call = mockFetch.mock.calls[0];
    expect(call[1]).toBeDefined();
    expect(call[1].headers.Authorization).toBe("Bearer xyz");
  });

  it("injects config.apiKey when no client Authorization header", async () => {
    process.env.JARVIS_API_KEY = "env-key";
    vi.resetModules();
    const { chatRouter: router } = await import("../routes/chat.js");
    const { fetch } = await import("undici");
    const mf = fetch as any;
    mf.mockReset();
    mf.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeSseBody(["data: hi\n\n"]),
    });

    const app2 = express();
    app2.use(express.json());
    app2.use("/api", router);

    await request(app2).get("/api/chat/stream?message=oi").expect(200);

    const call = mf.mock.calls[0];
    expect(call[1].headers.Authorization).toBe("Bearer env-key");
  });

  it("omits Authorization when neither client header nor apiKey present", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: makeSseBody(["data: hi\n\n"]),
    });

    await request(app).get("/api/chat/stream?message=oi").expect(200);

    const call = mockFetch.mock.calls[0];
    expect(call[1].headers.Authorization).toBeUndefined();
  });
});
