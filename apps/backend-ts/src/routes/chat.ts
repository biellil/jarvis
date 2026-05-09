/**
 * Chat router — paridade 1:1 com src/jarvis/api/routes/chat.py.
 *
 * - POST /chat  body {message: string} → {message: string}. 429 se lock ocupado.
 * - GET  /chat/stream?message=... → SSE `data: <token>\n\n`. 429 se lock ocupado.
 *
 * Phase 66 (Plan 03): extended with agentic graph routing on /chat/stream.
 * When session.agenticEnabled is true AND no imageBase64, the turn goes through
 * buildTaskGraph which emits task:* SSE events. AGENTIC_DISABLED=true env-flag
 * bypasses the graph for debugging.
 *
 * O lock é injetado via closure (DI). Libera sempre em try/finally, inclusive quando
 * o handler lança.
 */
import { Router, type Request, type Response } from 'express';
import type { ChatSession } from '../session/chat-session.js';
import type { SessionLock } from '../session/lock.js';
import { newTaskThreadId, taskCheckpointer } from '../agent/graph.js';
import { activeControllers, activeGraphs } from './tasks.js';

const BUSY_DETAIL = 'Session busy — try again later';

const TERMINAL_KINDS = new Set(['task:done', 'task:cancelled', 'task:error']);

export function createChatRouter(session: ChatSession, lock: SessionLock): Router {
  const router = Router();

  router.post('/chat', async (req: Request, res: Response) => {
    const message = req.body?.message;
    if (typeof message !== 'string' || message.length === 0) {
      res.status(400).json({ detail: 'message required' });
      return;
    }
    const release = lock.tryAcquire();
    if (!release) {
      res.status(429).json({ detail: BUSY_DETAIL });
      return;
    }
    // Phase 55 (D-10): atualiza clientId da tool request_file_action por-request.
    const clientId = req.headers['x-jarvis-client-id'];
    console.log('[chat POST] x-jarvis-client-id:', JSON.stringify(clientId));
    if (typeof clientId === 'string' && clientId.length > 0) {
      session.setClientId(clientId);
      console.log('[chat POST] setClientId:', clientId);
    } else {
      console.warn('[chat POST] header ausente — request_file_action sem clientId');
    }
    const imageBase64 = typeof req.body?.imageBase64 === 'string' ? req.body.imageBase64 : undefined;
    try {
      const reply = await session.send(message, imageBase64);
      res.json({ message: reply });
    } catch (err) {
      res.status(500).json({ detail: (err as Error).message });
    } finally {
      release();
    }
  });

  router.get('/chat/stream', async (req: Request, res: Response) => {
    const message = req.query?.message;
    if (typeof message !== 'string' || message.length === 0) {
      res.status(400).json({ detail: 'message required' });
      return;
    }
    const release = lock.tryAcquire();
    if (!release) {
      res.status(429).json({ detail: BUSY_DETAIL });
      return;
    }

    // Phase 55 (D-10): atualiza clientId da tool request_file_action por-request.
    const clientId = req.headers['x-jarvis-client-id'];
    if (typeof clientId === 'string' && clientId.length > 0) {
      session.setClientId(clientId);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const imageBase64 = typeof req.query?.imageBase64 === 'string' ? req.query.imageBase64 : undefined;

    // Phase 66 (Plan 03): detect agentic turn.
    // Vision turns (imageBase64) always bypass the graph — single-call image analysis.
    // AGENTIC_DISABLED=true env-flag escape hatch for debugging.
    const isAgenticTurn = !imageBase64 && session.agenticEnabled;

    if (isAgenticTurn) {
      // Generate unique thread_id per task (not per session — allows multiple tasks in history)
      const sessionId = typeof req.query?.sessionId === 'string' ? req.query.sessionId : 'default';
      const taskId = newTaskThreadId(sessionId);
      const controller = new AbortController();
      activeControllers.set(taskId, controller);

      const graph = session.getOrCreateAgenticGraph() as ReturnType<typeof import('../agent/graph.js').buildTaskGraph>;
      activeGraphs.set(taskId, graph);

      // Set active signal on session so tools get AbortSignal (D-13)
      session.setActiveSignal(controller.signal);

      try {
        const stream = await graph.stream(
          { userInput: message },
          {
            configurable: { thread_id: taskId },
            streamMode: ['custom', 'messages'] as unknown as 'custom'[],
            signal: controller.signal,
          },
        );

        let isTerminal = false;

        for await (const chunk of stream) {
          const [mode, data] = Array.isArray(chunk) ? chunk : ['custom', chunk];
          if (mode === 'custom') {
            const evt = data as { kind: string };
            res.write(`event: ${evt.kind}\ndata: ${JSON.stringify({ taskId, ...evt })}\n\n`);
            if (TERMINAL_KINDS.has(evt.kind)) {
              isTerminal = true;
            }
          } else if (mode === 'messages') {
            const [msgChunk] = Array.isArray(data) ? data : [data];
            const content = (msgChunk as { content?: unknown })?.content;
            if (typeof content === 'string' && content) {
              res.write(`data: ${content.replace(/\n/g, '\\n')}\n\n`);
            }
          }
        }

        // Check for plan-confirmation or step-failure interrupt after stream drains
        const snapshot = await graph.getState({ configurable: { thread_id: taskId } });
        const interrupts = (snapshot.tasks?.[0] as { interrupts?: Array<{ value: unknown }> })?.interrupts ?? [];
        if (interrupts.length > 0) {
          const v = interrupts[0]!.value as { kind: string; stepId?: number; error?: string };
          if (v.kind === 'plan-confirmation') {
            res.write(`event: task:awaiting-confirmation\ndata: ${JSON.stringify({ taskId })}\n\n`);
          } else if (v.kind === 'step-failure') {
            res.write(
              `event: task:awaiting-failure-decision\ndata: ${JSON.stringify({
                taskId,
                stepId: v.stepId,
                error: v.error,
              })}\n\n`,
            );
          }
        } else if (isTerminal) {
          // T-66-03-04: cleanup on terminal events
          await taskCheckpointer.deleteThread(taskId).catch(() => {});
          activeControllers.delete(taskId);
          activeGraphs.delete(taskId);
        }
      } catch (err) {
        const message = (err as Error).message ?? 'Erro desconhecido';
        res.write(`event: task:error\ndata: ${JSON.stringify({ taskId, atStep: 0, message })}\n\n`);
        await taskCheckpointer.deleteThread(taskId).catch(() => {});
        activeControllers.delete(taskId);
        activeGraphs.delete(taskId);
      } finally {
        session.setActiveSignal(null);
        res.end();
        release();
      }
      return;
    }

    // ─── Existing fast-path: non-agentic turn (chat-only) ─────────────────

    // Plan 18-04: registra listener de dispatch ANTES de iniciar o stream.
    // Quando o agent invocar uma PC tool durante sendStream, o wrapper
    // (plano 18-03) chama esse listener → escrevemos event: action\ndata: ...
    // no response. Mapping snake_case para paridade com o wire Python.
    session.setDispatchListener((ev) => {
      const payload = {
        tool_call_id: ev.toolCallId,
        action: ev.action,
        args: ev.args,
        requires_confirmation: ev.requiresConfirmation,
      };
      res.write(`event: action\ndata: ${JSON.stringify(payload)}\n\n`);
    });

    try {
      for await (const token of session.sendStream(message, imageBase64)) {
        res.write(`data: ${token}\n\n`);
      }
      res.end();
    } catch (err) {
      res.write(`data: [error] ${(err as Error).message}\n\n`);
      res.end();
    } finally {
      session.clearDispatchListener();
      release();
    }
  });

  return router;
}
