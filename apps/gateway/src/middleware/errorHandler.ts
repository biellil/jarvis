import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  const code = err.code ?? "INTERNAL_ERROR";
  const message = err.message ?? "An unexpected error occurred";

  res.status(status).json({
    error: true,
    code,
    message,
  });
};
