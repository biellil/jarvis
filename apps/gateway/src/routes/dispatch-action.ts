/**
 * POST /internal/dispatch-action — Phase 55 (LACT-01..05)
 *
 * Internal-only endpoint (not proxied externally) called by backend-ts
 * LangGraph tool to request OS-level file actions via the Electron client.
 *
 * Calls sendActionRequest which validates path, sends WS action_request,
 * awaits ACK from Electron (12s timeout), and logs to audit log.
 *
 * Per D-08: Follows /internal/actions-log pattern from Phase 54.
 * Per D-09: backend-ts fetches this with 12s+ timeout matching sendActionRequest.
 */
import { Router } from 'express';
import { z } from 'zod';
import { sendActionRequest } from '../lib/action-dispatcher.js';
import { logger } from '../lib/logger.js';

export const dispatchActionRouter = Router();

const DispatchActionBodySchema = z.object({
  clientId: z.string().min(1),
  action: z.enum(['openFolder', 'openFile', 'closeFile', 'viewContent']),
  path: z.string().min(1),
  model: z.string().min(1),
});

dispatchActionRouter.post('/dispatch-action', async (req, res) => {
  const parsed = DispatchActionBodySchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, '/internal/dispatch-action: invalid payload');
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  try {
    const result = await sendActionRequest(parsed.data);
    res.json(result);
  } catch (err) {
    const message = (err as Error).message;
    logger.error({ err }, '/internal/dispatch-action: sendActionRequest failed');
    res.status(500).json({ error: message });
  }
});
