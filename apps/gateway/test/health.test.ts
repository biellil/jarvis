import { vi, describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

// GW-03: GET /api/health aggregated health tests

// Mock undici at module level
vi.mock("undici", () => ({
  fetch: vi.fn(),
}));

// Import after mock
import { fetch } from "undici";
import { createApp } from "../src/app.js";

const mockFetch = vi.mocked(fetch);

describe("GW-03: GET /api/health", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns {gateway:'ok', python:'ok'} with 200 when FastAPI is healthy", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as any);

    const app = createApp();
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      gateway: "ok",
      python: "ok",
    });
  });

  it("returns {gateway:'ok', python:'not_ready'} with 503 when FastAPI returns 503", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    } as any);

    const app = createApp();
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      gateway: "ok",
      python: "not_ready",
    });
  });

  it("returns {gateway:'ok', python:'unreachable'} with 503 when FastAPI is unreachable", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const app = createApp();
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      gateway: "ok",
      python: "unreachable",
    });
  });
});
