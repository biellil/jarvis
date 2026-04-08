/**
 * Tool-calls router (Plan 18-05).
 *
 * POST /tool-calls/:id/result — reconcilia o audit log com o outcome real
 * reportado pelo Electron executor. Fecha o ciclo iniciado por
 * ToolLogger.logDispatch() (plano 18-03).
 *
 * Mapping:
 *   success=true                             → outcome='success'
 *   success=false, error==='user_denied'     → outcome='cancelled'
 *   success=false, else                      → outcome='error'
 *
 * Responses:
 *   204 No Content  — updateOutcome aplicou mudança
 *   400 Bad Request — :id inválido OU body falha Zod
 *   404 Not Found   — updateOutcome retornou false (id inexistente)
 *
 * Sem auth — single-user local assistant.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { ToolLogger } from '../memory/store.js';

const ToolResultSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    output: z.string().nullable().optional(),
    error: z.null().optional(),
  }),
  z.object({
    success: z.literal(false),
    output: z.string().nullable().optional(),
    error: z.string().min(1),
  }),
]);

export function createToolCallsRouter(toolLogger: ToolLogger): Router {
  const router = Router();

  router.post('/tool-calls/:id/result', (req: Request, res: Response) => {
    const idRaw = req.params.id;
    if (typeof idRaw !== 'string') {
      res.status(400).json({ detail: 'invalid tool call id' });
      return;
    }
    const id = Number.parseInt(idRaw, 10);
    if (!Number.isInteger(id) || id <= 0 || String(id) !== idRaw) {
      res.status(400).json({ detail: 'invalid tool call id' });
      return;
    }

    const parsed = ToolResultSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ detail: 'invalid body', errors: parsed.error.flatten() });
      return;
    }

    const data = parsed.data;
    let outcome: 'success' | 'error' | 'cancelled';
    let error: string | null = null;
    if (data.success) {
      outcome = 'success';
    } else if (data.error === 'user_denied') {
      outcome = 'cancelled';
      error = data.error;
    } else {
      outcome = 'error';
      error = data.error;
    }
    const output = data.output ?? null;

    const ok = toolLogger.updateOutcome(id, outcome, output, error);
    if (!ok) {
      res.status(404).json({ detail: 'tool call not found' });
      return;
    }
    res.status(204).end();
  });

  return router;
}
