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

describe("GW-LOG: proxy + error + validate logging", () => {
  beforeEach(() => {
    mocks.loggerMock.info.mockReset();
    mocks.loggerMock.warn.mockReset();
    mocks.loggerMock.error.mockReset();
    mocks.childMock.info.mockReset();
    mocks.childMock.warn.mockReset();
    mocks.childMock.error.mockReset();
    mockedCreateRequestLogger.mockClear();
  });

  it("logs proxy info on successful upstream call", async () => {
    const { fetch: mockedFetch } = await import("undici");
    vi.mocked(mockedFetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ message: "ok" }),
    } as any);
    await request(createApp()).post("/api/chat").send({ message: "oi" });

    // proxy log sai do child logger (req.log) que loggedFetch recebe
    const proxyCalls = mocks.childMock.info.mock.calls.filter(
      (c) => c[1] === "proxy",
    );
    expect(proxyCalls.length).toBe(1);
    expect(proxyCalls[0][0]).toMatchObject({
      method: "POST",
      status: 200,
      target: expect.stringContaining("/chat"),
    });
    expect(
      (proxyCalls[0][0] as Record<string, unknown>).durationMs as number,
    ).toBeGreaterThanOrEqual(0);
  });

  it("logs proxy_error when upstream throws", async () => {
    const { fetch: mockedFetch } = await import("undici");
    vi.mocked(mockedFetch).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await request(createApp()).post("/api/chat").send({ message: "oi" });

    const errorCalls = mocks.childMock.error.mock.calls.filter(
      (c) => c[1] === "proxy_error",
    );
    expect(errorCalls.length).toBe(1);
    const payload = errorCalls[0][0] as { err: { message: string } };
    expect(payload.err.message).toBe("ECONNREFUSED");
  });

  it("logs request_error with status/code/message and never puts stack in response body", async () => {
    const { fetch: mockedFetch } = await import("undici");
    vi.mocked(mockedFetch).mockRejectedValueOnce(new Error("boom"));
    const res = await request(createApp())
      .post("/api/chat")
      .send({ message: "oi" });

    // errorHandler usa req.log (child)
    const errCalls = mocks.childMock.error.mock.calls.filter(
      (c) => c[1] === "request_error",
    );
    expect(errCalls.length).toBe(1);
    expect(errCalls[0][0]).toMatchObject({
      status: 500,
      code: expect.any(String),
    });
    expect(res.body).not.toHaveProperty("stack");
  });

  it("logs validation_failed with failedPaths when body is invalid", async () => {
    const res = await request(createApp()).post("/api/chat").send({});

    // validate usa req.log (child)
    const warnCalls = mocks.childMock.warn.mock.calls.filter(
      (c) => c[1] === "validation_failed",
    );
    expect(warnCalls.length).toBe(1);
    expect(warnCalls[0][0]).toMatchObject({
      code: "VALIDATION_ERROR",
      failedPaths: expect.arrayContaining(["message"]),
    });
    expect(res.status).toBe(400);
  });
});
