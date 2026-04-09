import express from "express";
import { healthRouter } from "./routes/health.js";
import { createChatRouter } from "./routes/chat.js";
import { createChatAudioRouter } from "./routes/chat-audio.js";
import { createToolCallsRouter } from "./routes/tool-calls.js";
import { errorHandler } from "./middleware/errorHandler.js";
import type { ChatSession } from "./session/chat-session.js";
import type { SessionLock } from "./session/lock.js";
import type { ToolLogger } from "./memory/store.js";
import type { VoiceHandler } from "./voice/voice-handler.js";

export interface CreateAppOptions {
  session?: ChatSession;
  lock?: SessionLock;
  toolLogger?: ToolLogger;
  voiceHandler?: VoiceHandler;
}

export function createApp(opts: CreateAppOptions = {}) {
  const app = express();
  app.use(express.json());
  app.use("/", healthRouter);

  if (opts.session && opts.lock) {
    app.use("/", createChatRouter(opts.session, opts.lock));
  }
  if (opts.voiceHandler && opts.lock) {
    app.use("/", createChatAudioRouter(opts.voiceHandler, opts.lock));
  }
  if (opts.toolLogger) {
    app.use("/", createToolCallsRouter(opts.toolLogger));
  }

  // Error handler MUST be last middleware
  app.use(errorHandler);
  return app;
}
