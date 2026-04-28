import { Router } from "express";
import { config } from "../config.js";
import { loggedFetch } from "../lib/proxy.js";

export const toolCallsRouter = Router();

// GW-TC-01: POST /tool-calls/:id/result — proxy to backend
toolCallsRouter.post("/tool-calls/:id/result", async (req, res, next) => {
  const idParam = req.params.id;
  if (!/^[1-9]\d*$/.test(idParam)) {
    return res.status(400).json({ detail: "invalid tool call id" });
  }

  // Build headers: forward Authorization if present, else inject config.apiKey if set
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const incomingAuth = req.headers.authorization;
  if (incomingAuth) {
    headers["Authorization"] = incomingAuth;
  } else if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  try {
    const upstream = await loggedFetch(
      `${config.backendTsUrl}/tool-calls/${idParam}/result`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(req.body ?? {}),
        log: req.log,
      },
    );

    if (upstream.status === 204) {
      return res.status(204).end();
    }

    if (upstream.status === 400 || upstream.status === 404) {
      const body = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json(body);
    }

    if (upstream.status >= 500) {
      const err = Object.assign(new Error("Upstream error"), {
        status: 502,
        code: "UPSTREAM_ERROR",
      });
      return next(err);
    }

    // Fallback: propagate other statuses as-is
    const body = await upstream.json().catch(() => ({}));
    return res.status(upstream.status).json(body);
  } catch (err) {
    const wrapped = Object.assign(new Error("Upstream fetch failed"), {
      status: 502,
      code: "UPSTREAM_ERROR",
      cause: err,
    });
    return next(wrapped);
  }
});
