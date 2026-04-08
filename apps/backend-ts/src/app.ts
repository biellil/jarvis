import express from "express";
import { healthRouter } from "./routes/health.js";
import { createChatRouter } from "./routes/chat.js";
import { errorHandler } from "./middleware/errorHandler.js";
import type { ChatSession } from "./session/chat-session.js";
import type { SessionLock } from "./session/lock.js";

export interface CreateAppOptions {
  session?: ChatSession;
  lock?: SessionLock;
}

export function createApp(opts: CreateAppOptions = {}) {
  const app = express();
  app.use(express.json());
  app.use("/", healthRouter);

  if (opts.session && opts.lock) {
    app.use("/", createChatRouter(opts.session, opts.lock));
  }

  // Error handler MUST be last middleware
  app.use(errorHandler);
  return app;
}
