import { vi, describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

// GW-02: GET /api/chat/stream SSE passthrough tests

// Mock undici at module level
vi.mock("undici", () => ({
  fetch: vi.fn(),
}));

// Import after mock
import { fetch } from "undici";
import { createApp } from "../src/app.js";

const mockFetch = vi.mocked(fetch);

describe("GW-02: GET /api/chat/stream", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns SSE headers and pipes upstream data when message provided", async () => {
    const sseData = "data: hello\n\ndata: world\n\n";
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseData));
        controller.close();
      },
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: stream,
    } as any);

    const app = createApp();
    const res = await request(app).get("/api/chat/stream?message=oi");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.text).toContain("data: hello");
    expect(res.text).toContain("data: world");
  });

  it("returns 400 VALIDATION_ERROR when message param is missing", async () => {
    const app = createApp();
    const res = await request(app).get("/api/chat/stream");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: true,
      code: "VALIDATION_ERROR",
      message: "message query param is required",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 VALIDATION_ERROR when message is whitespace only", async () => {
    const app = createApp();
    const res = await request(app).get("/api/chat/stream?message=   ");

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
      body: null,
    } as any);

    const app = createApp();
    const res = await request(app).get("/api/chat/stream?message=oi");

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      error: true,
      code: "UPSTREAM_ERROR",
    });
  });
});
