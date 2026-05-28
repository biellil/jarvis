/**
 * POST /api/actions/ack — Phase 84 (REQ-84-05)
 *
 * Python client posts action ACK here after user confirmation + execution.
 * Resolves the matching pendingAckResolvers entry set by action-dispatcher.ts.
 *
 * Payload: { requestId: string (uuid), status: 'confirmed'|'denied'|'timeout', content?: string }
 * Returns: { ok: true } on success, 400 on invalid payload, 404 if resolver not found.
 */
import { Router, type Request, type Response } from 'express';
import { pendingAckResolvers } from '../lib/ws-server.js';
import { z } from 'zod';
import { logger } from '../lib/logger.js';

export const actionsAckRouter = Router();

const AckPayloadSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(['confirmed', 'denied', 'timeout']),
  content: z.string().optional(),
});

actionsAckRouter.post('/actions/ack', (req: Request, res: Response) => {
  const parsed = AckPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, '/api/actions/ack: invalid payload');
    res.status(400).json({ error: 'Invalid payload', issues: parsed.error.issues });
    return;
  }

  const { requestId, status, content } = parsed.data;
  const resolver = pendingAckResolvers.get(requestId);

  if (!resolver) {
    logger.warn({ requestId }, '/api/actions/ack: no pending resolver — already resolved or timed out');
    res.status(404).json({ error: 'Request not found or already processed' });
    return;
  }

  // Delete BEFORE resolving to prevent double-resolution race
  pendingAckResolvers.delete(requestId);
  resolver({ type: 'action_ack', requestId, status, content });
  logger.info({ requestId, status }, 'action_ack resolved from Python client');

  res.json({ ok: true });
});
