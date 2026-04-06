import express from "express";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();
  app.use(express.json());

  // Routes will be registered here by Plan 02:
  // app.use("/api", chatRouter);
  // app.use("/api", healthRouter);

  // Error handler MUST be the last middleware
  app.use(errorHandler);
  return app;
}
