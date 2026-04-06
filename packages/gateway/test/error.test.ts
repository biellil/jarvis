import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { validate, ChatRequestSchema } from "../src/middleware/validate.js";

function createTestApp() {
  const app = express();
  app.use(express.json());

  // Test route that triggers validation
  app.post("/test-validate", validate(ChatRequestSchema), (_req, res) => {
    res.json({ ok: true });
  });

  // Test route that throws
  app.get("/test-error", () => {
    throw new Error("boom");
  });

  // Test route that throws with status
  app.get("/test-error-status", () => {
    const err = new Error("not found") as any;
    err.status = 404;
    err.code = "NOT_FOUND";
    throw err;
  });

  app.use(errorHandler);
  return app;
}

describe("GW-04: Error normalization", () => {
  it("returns {error: true, code, message} for unhandled errors", async () => {
    const res = await request(createTestApp()).get("/test-error");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: true,
      code: "INTERNAL_ERROR",
      message: "boom",
    });
  });

  it("respects err.status and err.code", async () => {
    const res = await request(createTestApp()).get("/test-error-status");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: true,
      code: "NOT_FOUND",
      message: "not found",
    });
  });

  it("never includes stack trace in response", async () => {
    const res = await request(createTestApp()).get("/test-error");
    expect(res.body).not.toHaveProperty("stack");
  });
});

describe("GW-05: Zod validation", () => {
  it("passes valid payload through", async () => {
    const res = await request(createTestApp())
      .post("/test-validate")
      .send({ message: "hello" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("rejects missing message with 400 VALIDATION_ERROR", async () => {
    const res = await request(createTestApp())
      .post("/test-validate")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(true);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects empty string message", async () => {
    const res = await request(createTestApp())
      .post("/test-validate")
      .send({ message: "" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });
});
