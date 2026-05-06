import { Router } from "express";
import { config } from "../config.js";
import { validate, ChatRequestSchema } from "../middleware/validate.js";
import { SSE_HEADERS, loggedFetch } from "../lib/proxy.js";
import { clientConnections } from "../lib/ws-server.js";

export const chatRouter = Router();

// GW-01: POST /chat — proxy to FastAPI POST /chat
chatRouter.post("/chat", validate(ChatRequestSchema), async (req, res, next) => {
  try {
    const upstream = await loggedFetch(`${config.backendTsUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      log: req.log,
    });

    if (!upstream.ok) {
      const detail = await upstream.json().catch(() => ({}));
      const err = Object.assign(
        new Error((detail as any)?.detail ?? "FastAPI error"),
        {
          status: upstream.status,
          code: "UPSTREAM_ERROR",
        },
      );
      return next(err);
    }

    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GW-02: GET /chat/stream — SSE passthrough from FastAPI GET /chat/stream
chatRouter.get("/chat/stream", async (req, res, next) => {
  const message = req.query.message as string | undefined;
  if (!message || message.trim().length === 0) {
    const err = Object.assign(
      new Error("message query param is required"),
      {
        status: 400,
        code: "VALIDATION_ERROR",
      },
    );
    return next(err);
  }

  try {
    const upstreamHeaders: Record<string, string> = {};
    const incomingAuth = req.headers.authorization;
    if (incomingAuth) {
      upstreamHeaders["Authorization"] = incomingAuth;
    } else if (config.apiKey) {
      upstreamHeaders["Authorization"] = `Bearer ${config.apiKey}`;
    }
    // Phase 55 (D-10): injeta clientId do cliente WS conectado para a request_file_action tool.
    const connectedClientId = clientConnections.keys().next().value;
    if (connectedClientId) {
      upstreamHeaders["X-Jarvis-Client-Id"] = connectedClientId;
    }

    const upstream = await loggedFetch(
      `${config.backendTsUrl}/chat/stream?message=${encodeURIComponent(message)}`,
      { headers: upstreamHeaders, log: req.log },
    );

    if (!upstream.ok || !upstream.body) {
      const err = Object.assign(new Error("Upstream error"), {
        status: upstream.status ?? 502,
        code: "UPSTREAM_ERROR",
      });
      return next(err);
    }

    for (const [key, value] of Object.entries(SSE_HEADERS)) {
      res.setHeader(key, value);
    }
    res.flushHeaders();

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      next(err);
    } else {
      res.end();
    }
  }
});
