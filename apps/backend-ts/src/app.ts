import express from "express";
import { healthRouter } from "./routes/health.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/", healthRouter);

  // Error handler MUST be last middleware
  app.use(errorHandler);
  return app;
}
