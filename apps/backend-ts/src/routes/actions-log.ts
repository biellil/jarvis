/**
 * Actions audit log route (Plan 54-02 — LACT-08)
 *
 * POST /internal/actions-log — called by gateway after every file action attempt
 * to persist an audit entry (approved/denied/timeout) to SQLite.
 *
 * The /internal prefix is NOT proxied by the gateway (gateway only forwards /api).
 * Full endpoint: POST http://backend-ts:8001/internal/actions-log
 */
import { Router } from 'express';
import { z } from 'zod';
import { ActionLogger } from '../memory/store.js';
import * as schema from '../memory/schema.js';

export const actionsLogRouter = Router();
const actionLogger = new ActionLogger();

const ActionLogBodySchema = z.object({
  timestamp: z.string().optional(),
  path: z.string(),
  action: z.string(),
  result: z.enum(schema.actionsLogResultEnum),
  model: z.string().optional(),
  clientId: z.string().optional(),
  requestId: z.string().optional(),
});

actionsLogRouter.post('/actions-log', (req, res) => {
  const parsed = ActionLogBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid audit log payload', details: parsed.error.issues });
    return;
  }

  const { path, action, result, model, clientId, requestId } = parsed.data;
  actionLogger.log(result, path, action, model, clientId, requestId);

  res.status(204).end();
});
