import express from "express";
import { healthRouter } from "./routes/health.js";
import { createChatRouter } from "./routes/chat.js";
import { createToolCallsRouter } from "./routes/tool-calls.js";
import { actionsLogRouter } from "./routes/actions-log.js";
import { createReloadLlmRouter } from "./routes/reload-llm.js";
import { debugRouter } from "./routes/debug.js";
import { errorHandler } from "./middleware/errorHandler.js";
import type { ChatSession } from "./session/chat-session.js";
import type { SessionLock } from "./session/lock.js";
import type { ToolLogger } from "./memory/store.js";

export interface CreateAppOptions {
  session?: ChatSession;
  lock?: SessionLock;
  toolLogger?: ToolLogger;
}

export function createApp(opts: CreateAppOptions = {}) {
  const app = express();
  app.use(express.json());
  app.use("/", healthRouter);
  app.use("/", debugRouter);

  if (opts.session && opts.lock) {
    app.use("/", createChatRouter(opts.session, opts.lock));
  }
  if (opts.toolLogger) {
    app.use("/", createToolCallsRouter(opts.toolLogger));
  }

  // Actions audit log — internal endpoint, not proxied by gateway
  app.use("/internal", actionsLogRouter);

  // Live LLM reload — internal endpoint, not proxied by gateway (Plan 57-02)
  if (opts.session && opts.lock) {
    app.use("/internal", createReloadLlmRouter(opts.session, opts.lock));
  }

  // Error handler MUST be last middleware
  app.use(errorHandler);
  return app;
}
