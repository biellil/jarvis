import { vi, describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

// GW-01: POST /api/chat proxy tests

// Mock undici at module level
vi.mock("undici", () => ({
  fetch: vi.fn(),
}));

// Import after mock
import { fetch } from "undici";
import { createApp } from "../src/app.js";

const mockFetch = vi.mocked(fetch);

describe("GW-01: POST /api/chat", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns proxied response when upstream succeeds", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ message: "Olá! Como posso ajudar?" }),
    } as any);

    const app = createApp();
    const res = await request(app)
      .post("/api/chat")
      .send({ message: "oi" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Olá! Como posso ajudar?" });
  });

  it("returns 400 VALIDATION_ERROR when body is empty", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/chat")
      .send({})
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: true,
      code: "VALIDATION_ERROR",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 VALIDATION_ERROR when message is empty string", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/chat")
      .send({ message: "" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: true,
      code: "VALIDATION_ERROR",
    });
  });

  it("normalizes upstream 429 to error response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ detail: "Session busy — try again later" }),
    } as any);

    const app = createApp();
    const res = await request(app)
      .post("/api/chat")
      .send({ message: "oi" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      error: true,
      code: "UPSTREAM_ERROR",
      message: "Session busy — try again later",
    });
  });

  it("returns 500 when upstream is unreachable", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const app = createApp();
    const res = await request(app)
      .post("/api/chat")
      .send({ message: "oi" })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      error: true,
    });
  });
});
