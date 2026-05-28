/**
 * GET /api/actions/events — Phase 84 (REQ-84-01)
 *
 * Python client SSE registration endpoint. Python client connects on boot and keeps
 * connection open. Gateway stores the response object in pythonSseClients Map for
 * action dispatch. Client disconnect removes entry automatically via 'close' event.
 *
 * Heartbeat ping emitted every 30s to detect stale clients (EPIPE detection).
 */
import { Router, type Request, type Response } from 'express';
import { pythonSseClients } from '../lib/ws-server.js';
import { logger } from '../lib/logger.js';

export const actionsEventsRouter = Router();

actionsEventsRouter.get('/actions/events', (req: Request, res: Response) => {
  const clientId = req.query['clientId'];

  if (!clientId || typeof clientId !== 'string' || clientId.length === 0) {
    res.status(400).json({ error: 'clientId query param required' });
    return;
  }

  // Set SSE headers — keep connection open indefinitely
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Replace stale connection for same clientId
  const old = pythonSseClients.get(clientId);
  if (old) {
    try { old.end(); } catch { /* ignore if already closed */ }
  }
  pythonSseClients.set(clientId, res);
  logger.info({ clientId, total: pythonSseClients.size }, 'Python SSE client connected');

  // Heartbeat every 30s to detect stale TCP connections
  const heartbeat = setInterval(() => {
    try {
      res.write(':heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
      pythonSseClients.delete(clientId);
    }
  }, 30_000);

  // Clean up on disconnect
  res.on('close', () => {
    clearInterval(heartbeat);
    pythonSseClients.delete(clientId);
    logger.info({ clientId, total: pythonSseClients.size }, 'Python SSE client disconnected');
  });

  res.on('error', (err) => {
    clearInterval(heartbeat);
    pythonSseClients.delete(clientId);
    logger.error({ clientId, err }, 'Python SSE connection error');
  });
});
