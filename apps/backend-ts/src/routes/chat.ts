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
 * Phase 82 (Plan 03): D-04 confirmation routing — when session.getAwaitingConfirmation()
 * is non-null, the next message is routed to resume the paused agentic graph
 * instead of starting a new LLM invocation.
 *
 * O lock é injetado via closure (DI). Libera sempre em try/finally, inclusive quando
 * o handler lança.
 */
import { Router, type Request, type Response } from 'express';
import { Command } from '@langchain/langgraph';
import type { ChatSession } from '../session/chat-session.js';
import type { SessionLock } from '../session/lock.js';
import { newTaskThreadId, taskCheckpointer } from '../agent/graph.js';
import { activeControllers, activeGraphs } from './tasks.js';
import { matchTaskKeyword } from '../agent/keywords.js';
import { createLangfuseHandler } from '../observability/langfuse.js';

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

    // D-04 (Phase 82): Se há confirmação pendente, rotear mensagem para /resume em vez de LLM
    const pendingConfirmation = session.getAwaitingConfirmation();
    if (pendingConfirmation) {
      const match = matchTaskKeyword(message, 'awaiting-confirmation');
      const resumeKind = match?.kind === 'confirm' ? 'confirm'
        : match?.kind === 'edit' ? 'edit'
        : 'cancel'; // default seguro: cancela se keyword não reconhecida

      session.clearAwaitingConfirmation();

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const pendingTaskId = pendingConfirmation.taskId;
      const graph = activeGraphs.get(pendingTaskId) as ReturnType<typeof import('../agent/graph.js').buildTaskGraph> | undefined;

      if (!graph) {
        res.write(`event: task:error\ndata: ${JSON.stringify({ taskId: pendingTaskId, atStep: 0, message: 'Task not found — may have expired' })}\n\n`);
        res.end();
        release();
        return;
      }

      const controller = activeControllers.get(pendingTaskId) ?? new AbortController();
      activeControllers.set(pendingTaskId, controller);
      session.setActiveSignal(controller.signal);

      const resumeBody = resumeKind === 'edit' && match?.kind === 'edit'
        ? { kind: 'edit' as const, feedback: match.feedback }
        : { kind: resumeKind as 'confirm' | 'cancel' };

      // per D-02: userId is not tracked in the confirmation resume path — undefined is correct.
      let langfuseHandle = null;
      try {
        langfuseHandle = await createLangfuseHandler({ taskId: pendingTaskId, userId: undefined, input: message });
        const resumeStream = await graph.stream(
          new Command({ resume: resumeBody }),
          {
            configurable: { thread_id: pendingTaskId },
            streamMode: ['custom', 'messages'] as unknown as 'custom'[],
            signal: controller.signal,
          },
        );

        let isTerminal = false;
        let resumeOutput: string | undefined;
        for await (const chunk of resumeStream) {
          const [mode, data] = Array.isArray(chunk) ? chunk : ['custom', chunk];
          if (mode === 'custom') {
            const evt = data as { kind: string; summary?: string };
            res.write(`event: ${evt.kind}\ndata: ${JSON.stringify({ taskId: pendingTaskId, ...evt })}\n\n`);
            if (TERMINAL_KINDS.has(evt.kind)) {
              isTerminal = true;
              if (evt.kind === 'task:done' && evt.summary) resumeOutput = evt.summary;
            }
          } else if (mode === 'messages') {
            const [msgChunk] = Array.isArray(data) ? data : [data];
            const content = (msgChunk as { content?: unknown })?.content;
            if (typeof content === 'string' && content) {
              res.write(`data: ${content.replace(/\n/g, '\\n')}\n\n`);
            }
          }
        }

        if (isTerminal) {
          void taskCheckpointer.deleteThread(pendingTaskId).catch(() => {});
          activeControllers.delete(pendingTaskId);
          activeGraphs.delete(pendingTaskId);
        }
      } catch (err) {
        langfuseHandle?.generation.end({ level: 'ERROR', statusMessage: (err as Error).message });
        res.write(`event: task:error\ndata: ${JSON.stringify({ taskId: pendingTaskId, atStep: 0, message: (err as Error).message })}\n\n`);
        void taskCheckpointer.deleteThread(pendingTaskId).catch(() => {});
        activeControllers.delete(pendingTaskId);
        activeGraphs.delete(pendingTaskId);
      } finally {
        langfuseHandle?.generation.end({ output: resumeOutput });
        void langfuseHandle?.flush();
        session.setActiveSignal(null);
        res.end();
        release();
      }
      return; // Não continua para o fluxo normal
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

      // per D-02: handler is per-request (not singleton) to avoid context leakage between concurrent requests.
      // userId is not available from the session object in this path — passing undefined is correct here.
      // See D-02 in 83-CONTEXT.md: userId tracking deferred to SDK Manual root trace (deferred idea).
      let langfuseHandle = null;
      try {
        langfuseHandle = await createLangfuseHandler({ taskId, userId: undefined, input: message });
        const stream = await graph.stream(
          { userInput: message },
          {
            configurable: { thread_id: taskId },
            streamMode: ['custom', 'messages'] as unknown as 'custom'[],
            signal: controller.signal,
          },
        );

        let isTerminal = false;
        let taskOutput: string | undefined;

        for await (const chunk of stream) {
          const [mode, data] = Array.isArray(chunk) ? chunk : ['custom', chunk];
          if (mode === 'custom') {
            const evt = data as { kind: string; summary?: string };
            res.write(`event: ${evt.kind}\ndata: ${JSON.stringify({ taskId, ...evt })}\n\n`);
            if (TERMINAL_KINDS.has(evt.kind)) {
              isTerminal = true;
              if (evt.kind === 'task:done' && evt.summary) taskOutput = evt.summary;
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
            // D-04 (Phase 82): marcar sessão como aguardando confirmação para rotear próxima mensagem
            session.setAwaitingConfirmation(taskId, taskId);
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
          // T-66-03-04: cleanup on terminal events.
          // WR-08: fire-and-forget — do NOT await deleteThread, otherwise the
          // SSE consumer waits for checkpointer cleanup before connection
          // close. MemorySaver is in-memory today (microseconds), but the
          // pattern primes for latency regression on a future SQLite swap.
          void taskCheckpointer.deleteThread(taskId).catch(() => {});
          activeControllers.delete(taskId);
          activeGraphs.delete(taskId);
        }
      } catch (err) {
        const errMessage =
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : 'Erro desconhecido';
        langfuseHandle?.generation.end({ level: 'ERROR', statusMessage: errMessage });
        res.write(
          `event: task:error\ndata: ${JSON.stringify({ taskId, atStep: 0, message: errMessage })}\n\n`,
        );
        // WR-08: fire-and-forget cleanup (see comment above).
        void taskCheckpointer.deleteThread(taskId).catch(() => {});
        activeControllers.delete(taskId);
        activeGraphs.delete(taskId);
      } finally {
        langfuseHandle?.generation.end({ output: taskOutput });
        void langfuseHandle?.flush();
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
        res.write(`data: ${token.replace(/\n/g, '\\n')}\n\n`);
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
