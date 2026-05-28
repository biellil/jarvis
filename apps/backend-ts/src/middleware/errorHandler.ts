import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // SSE streams send headers before the body streams. If an error bubbles up
  // after flushHeaders(), attempting res.status().json() throws ERR_HTTP_HEADERS_SENT.
  // Guard: if headers already sent, just close the connection cleanly.
  if (res.headersSent) {
    if (!res.writableEnded) {
      res.end();
    }
    return;
  }

  const status = err.status ?? err.statusCode ?? 500;
  const code = err.code ?? "INTERNAL_ERROR";
  const message = err.message ?? "An unexpected error occurred";

  res.status(status).json({
    error: true,
    code,
    message,
  });
};
