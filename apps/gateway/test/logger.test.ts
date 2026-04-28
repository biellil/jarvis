import { vi, describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

// Hoisted mocks: vi.mock factory roda antes de qualquer top-level statement
const mocks = vi.hoisted(() => {
  const childMock = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  const loggerMock = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => childMock),
  };
  return { childMock, loggerMock };
});

vi.mock("../src/lib/logger.js", () => ({
  logger: mocks.loggerMock,
  createRequestLogger: vi.fn(() => mocks.childMock),
}));

vi.mock("undici", () => ({
  fetch: vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ message: "ok" }),
  })),
}));

import { createApp } from "../src/app.js";
import { createRequestLogger } from "../src/lib/logger.js";

const mockedCreateRequestLogger = vi.mocked(createRequestLogger);

describe("GW-LOG: request logging", () => {
  beforeEach(() => {
    mocks.loggerMock.info.mockReset();
    mocks.loggerMock.warn.mockReset();
    mocks.loggerMock.error.mockReset();
    mocks.childMock.info.mockReset();
    mocks.childMock.warn.mockReset();
    mocks.childMock.error.mockReset();
    mockedCreateRequestLogger.mockClear();
  });

  it("logs one line on finish with status and durationMs", async () => {
    const app = createApp();
    await request(app).post("/api/chat").send({ message: "oi" });
    const calls = mocks.loggerMock.info.mock.calls.filter(
      (c) => typeof c[1] === "string" && c[1] === "request",
    );
    expect(calls.length).toBe(1);
    const payload = calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      method: "POST",
      url: "/api/chat",
      status: expect.any(Number),
    });
    expect(payload.durationMs as number).toBeGreaterThanOrEqual(0);
    expect(payload.reqId as string).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("skips logging for /api/health", async () => {
    const { fetch: mockedFetch } = await import("undici");
    vi.mocked(mockedFetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as any);

    const app = createApp();
    await request(app).get("/api/health");
    const requestCalls = mocks.loggerMock.info.mock.calls.filter(
      (c) => typeof c[1] === "string" && c[1] === "request",
    );
    expect(requestCalls.length).toBe(0);
    expect(mockedCreateRequestLogger).not.toHaveBeenCalled();
  });

  it("creates a child logger with reqId UUID per request", async () => {
    const app = createApp();
    await request(app).post("/api/chat").send({ message: "oi" });
    expect(mockedCreateRequestLogger).toHaveBeenCalledTimes(1);
    const reqId = mockedCreateRequestLogger.mock.calls[0][0];
    expect(reqId).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
