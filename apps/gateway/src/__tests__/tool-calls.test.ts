/**
 * Gateway Tool Calls Proxy Route Tests
 * POST /api/tool-calls/:id/result → backend POST /tool-calls/:id/result
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { toolCallsRouter } from "../routes/tool-calls.js";

vi.mock("undici", () => ({
  fetch: vi.fn(),
}));

describe("Gateway Tool Calls Routes", () => {
  let app: Express;
  let mockFetch: any;

  beforeEach(async () => {
    const { fetch } = await import("undici");
    mockFetch = fetch as any;
    mockFetch.mockReset();

    app = express();
    app.use(express.json());
    app.use("/api", toolCallsRouter);
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

  describe("POST /api/tool-calls/:id/result", () => {
    it("proxies 204 success to backend", async () => {
      mockFetch.mockResolvedValue({
        status: 204,
        json: async () => ({}),
      });

      await request(app)
        .post("/api/tool-calls/42/result")
        .send({ success: true, output: "done" })
        .expect(204);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/tool-calls/42/result"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ success: true, output: "done" }),
        }),
      );
    });

    it("returns 400 for invalid id without calling upstream", async () => {
      const res = await request(app)
        .post("/api/tool-calls/abc/result")
        .send({ success: true })
        .expect(400);

      expect(res.body.detail).toBe("invalid tool call id");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns 400 for zero/negative id", async () => {
      await request(app)
        .post("/api/tool-calls/0/result")
        .send({ success: true })
        .expect(400);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("propagates upstream 400 body", async () => {
      mockFetch.mockResolvedValue({
        status: 400,
        json: async () => ({ detail: "invalid body" }),
      });

      const res = await request(app)
        .post("/api/tool-calls/7/result")
        .send({ bogus: true })
        .expect(400);

      expect(res.body).toEqual({ detail: "invalid body" });
    });

    it("propagates upstream 404", async () => {
      mockFetch.mockResolvedValue({
        status: 404,
        json: async () => ({ detail: "not found" }),
      });

      const res = await request(app)
        .post("/api/tool-calls/999/result")
        .send({ success: true })
        .expect(404);

      expect(res.body).toEqual({ detail: "not found" });
    });

    it("maps upstream 5xx to 502 UPSTREAM_ERROR", async () => {
      mockFetch.mockResolvedValue({
        status: 500,
        json: async () => ({ detail: "kaboom" }),
      });

      const res = await request(app)
        .post("/api/tool-calls/1/result")
        .send({ success: true })
        .expect(502);

      expect(res.body.code).toBe("UPSTREAM_ERROR");
    });

    it("maps fetch network error to 502", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

      const res = await request(app)
        .post("/api/tool-calls/1/result")
        .send({ success: true })
        .expect(502);

      expect(res.body.code).toBe("UPSTREAM_ERROR");
    });

    it("forwards Authorization header from client", async () => {
      mockFetch.mockResolvedValue({ status: 204, json: async () => ({}) });

      await request(app)
        .post("/api/tool-calls/5/result")
        .set("Authorization", "Bearer client-token")
        .send({ success: true })
        .expect(204);

      const call = mockFetch.mock.calls[0];
      expect(call[1].headers.Authorization).toBe("Bearer client-token");
    });

    it("injects config.apiKey when no Authorization header present", async () => {
      process.env.JARVIS_API_KEY = "injected-key";
      // Re-import config/router with new env
      vi.resetModules();
      const { toolCallsRouter: router } = await import("../routes/tool-calls.js");
      const { fetch } = await import("undici");
      const mf = fetch as any;
      mf.mockReset();
      mf.mockResolvedValue({ status: 204, json: async () => ({}) });

      const app2 = express();
      app2.use(express.json());
      app2.use("/api", router);

      await request(app2)
        .post("/api/tool-calls/5/result")
        .send({ success: true })
        .expect(204);

      const call = mf.mock.calls[0];
      expect(call[1].headers.Authorization).toBe("Bearer injected-key");
    });

    it("omits Authorization when neither client header nor apiKey present", async () => {
      mockFetch.mockResolvedValue({ status: 204, json: async () => ({}) });

      await request(app)
        .post("/api/tool-calls/5/result")
        .send({ success: true })
        .expect(204);

      const call = mockFetch.mock.calls[0];
      expect(call[1].headers.Authorization).toBeUndefined();
    });
  });
});
