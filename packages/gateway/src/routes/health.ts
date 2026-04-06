import { Router } from "express";
import { fetch } from "undici";
import { config } from "../config.js";

export const healthRouter = Router();

// GW-03: GET /health — aggregated health for gateway + python service
healthRouter.get("/health", async (_req, res) => {
  let pythonStatus: "ok" | "not_ready" | "unreachable" = "unreachable";

  try {
    const upstream = await fetch(`${config.fastapiUrl}/health/ready`, {
      signal: AbortSignal.timeout(3000),
    });
    pythonStatus = upstream.ok ? "ok" : "not_ready";
  } catch {
    pythonStatus = "unreachable";
  }

  const httpStatus = pythonStatus === "ok" ? 200 : 503;
  res.status(httpStatus).json({
    gateway: "ok",
    python: pythonStatus,
  });
});
