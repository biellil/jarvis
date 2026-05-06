import express from "express";
import { chatRouter } from "./routes/chat.js";
import { healthRouter } from "./routes/health.js";
import { toolCallsRouter } from "./routes/tool-calls.js";
import { dispatchActionRouter } from "./routes/dispatch-action.js";
import { diagnosticsRouter } from "./routes/diagnostics.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLog } from "./middleware/requestLog.js";

export function createApp() {
  const app = express();
  // requestLog ANTES de express.json e das rotas para capturar duração total
  app.use(requestLog);
  app.use(express.json());
  app.use("/api", chatRouter);
  app.use("/api", healthRouter);
  app.use("/api", toolCallsRouter);
  app.use("/internal", dispatchActionRouter);
  app.use("/internal", diagnosticsRouter);

  // Error handler MUST be the last middleware
  app.use(errorHandler);
  return app;
}
