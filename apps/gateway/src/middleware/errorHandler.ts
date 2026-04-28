import type { ErrorRequestHandler } from "express";
import { logger } from "../lib/logger.js";

const isProd = process.env.NODE_ENV === "production";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  const code = err.code ?? "INTERNAL_ERROR";
  const message = err.message ?? "An unexpected error occurred";

  // Usa req.log (child com reqId) quando disponível; fallback para logger raiz
  // (test helpers podem montar errorHandler sem requestLog upstream).
  const log = req.log ?? logger;
  log.error(
    {
      reqId: req.id,
      status,
      code,
      message,
      // stack só vai pro LOG em não-prod; NUNCA vai pro body da response (regressão GW-04)
      ...(isProd ? {} : { stack: err.stack }),
      ...(err.details ? { details: err.details } : {}),
    },
    "request_error",
  );

  res.status(status).json({
    error: true,
    code,
    message,
  });
};
