import { Router } from "express";
import { fetch } from "undici";
import multer from "multer";
import { config } from "../config.js";
import { validate, ChatRequestSchema } from "../middleware/validate.js";
import { SSE_HEADERS } from "../lib/proxy.js";

export const chatRouter = Router();

// Multer configuration for audio upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

// GW-01: POST /chat — proxy to FastAPI POST /chat
chatRouter.post("/chat", validate(ChatRequestSchema), async (req, res, next) => {
  try {
    const upstream = await fetch(`${config.fastapiUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
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
    const upstream = await fetch(
      `${config.fastapiUrl}/chat/stream?message=${encodeURIComponent(message)}`,
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

// AUDIO-02: POST /chat/audio — proxy multipart audio to FastAPI POST /chat/audio
chatRouter.post("/chat/audio", upload.single("audio"), async (req, res, next) => {
  try {
    // Check if audio file was uploaded
    if (!req.file) {
      const err = Object.assign(new Error("Audio file is required"), {
        status: 400,
        code: "MISSING_FILE",
      });
      return next(err);
    }

    // Create FormData with audio buffer
    const formData = new FormData();
    formData.append("audio", new Blob([req.file.buffer]), "audio.wav");

    // POST to FastAPI with multipart data
    const upstream = await fetch(`${config.fastapiUrl}/chat/audio`, {
      method: "POST",
      body: formData,
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
