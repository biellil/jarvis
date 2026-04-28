import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { logger, createRequestLogger } from "../lib/logger.js";

// Healthcheck: silencioso de propósito — evita ruído de probes periódicos.
const SKIP_PATHS = new Set<string>(["/api/health"]);

export function requestLog(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (SKIP_PATHS.has(req.url)) {
    return next();
  }

  const reqId = randomUUID();
  const start = process.hrtime.bigint();
  req.id = reqId;
  req.log = createRequestLogger(reqId);

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    logger.info(
      {
        reqId,
        method: req.method,
        url: req.originalUrl ?? req.url,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      },
      "request",
    );
  });

  next();
}
