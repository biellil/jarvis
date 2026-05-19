/**
 * Tasks proxy — Phase 78 terminal fix.
 *
 * Proxies agentic task endpoints to backend-ts so terminal clients
 * (and any other client that only knows the gateway URL) can resume/cancel tasks.
 *
 * Gateway: POST /api/tasks/:taskId/resume  → backend-ts POST /api/tasks/:taskId/resume  (SSE)
 * Gateway: POST /api/tasks/:taskId/cancel  → backend-ts POST /api/tasks/:taskId/cancel  (JSON)
 */
import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
import { SSE_HEADERS, loggedFetch } from '../lib/proxy.js';

export const tasksRouter = Router();

function buildHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const incomingAuth = req.headers.authorization;
  if (incomingAuth) {
    headers['Authorization'] = incomingAuth;
  } else if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }
  return headers;
}

// POST /api/tasks/:taskId/resume — SSE passthrough
tasksRouter.post('/:taskId/resume', async (req: Request, res: Response, next) => {
  const taskId = req.params['taskId'];
  try {
    const upstream = await loggedFetch(
      `${config.backendTsUrl}/api/tasks/${taskId}/resume`,
      {
        method: 'POST',
        headers: buildHeaders(req),
        body: JSON.stringify(req.body ?? {}),
        log: req.log,
      },
    );

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.json().catch(() => ({}));
      const err = Object.assign(new Error((detail as { error?: string }).error ?? 'Upstream error'), {
        status: upstream.status ?? 502,
        code: 'UPSTREAM_ERROR',
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

// POST /api/tasks/:taskId/cancel — JSON proxy
tasksRouter.post('/:taskId/cancel', async (req: Request, res: Response, next) => {
  const taskId = req.params['taskId'];
  try {
    const upstream = await loggedFetch(
      `${config.backendTsUrl}/api/tasks/${taskId}/cancel`,
      {
        method: 'POST',
        headers: buildHeaders(req),
        body: JSON.stringify(req.body ?? {}),
        log: req.log,
      },
    );
    const data = await upstream.json().catch(() => ({}));
    res.status(upstream.status).json(data);
  } catch (err) {
    next(err);
  }
});
