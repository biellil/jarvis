import { Router } from "express";
import { fetch } from "undici";
import { config } from "../config.js";

export const healthRouter = Router();

// GW-03: GET /health — aggregated health for gateway + backend-ts service
healthRouter.get("/health", async (_req, res) => {
  let backendStatus: "ok" | "not_ready" | "unreachable" = "unreachable";

  try {
    const upstream = await fetch(`${config.backendTsUrl}/health/ready`, {
      signal: AbortSignal.timeout(3000),
    });
    backendStatus = upstream.ok ? "ok" : "not_ready";
  } catch {
    backendStatus = "unreachable";
  }

  const httpStatus = backendStatus === "ok" ? 200 : 503;
  res.status(httpStatus).json({
    gateway: "ok",
    backend: backendStatus,
  });
});
