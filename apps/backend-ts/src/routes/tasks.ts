/**
 * Tasks router — Phase 66 Plan 03.
 *
 * Implements:
 *   POST /api/tasks/:taskId/resume  — resume a paused agentic graph (confirm/cancel/edit)
 *   POST /api/tasks/:taskId/cancel  — abort an in-flight task immediately
 *
 * Security:
 *   T-66-03-01: resumeRequestSchema body validation → 400 on invalid
 *   T-66-03-02: TASK_ID_PATTERN regex rejects malformed taskId → 400
 *   T-66-03-03: Bearer auth (existing middleware) gates all endpoints
 *   T-66-03-04: try/finally cleanup on terminal events (task:done|cancelled|error)
 *
 * Connection lifecycle (RESEARCH Open Questions #5):
 *   SSE closes after each phase (initial → awaiting-confirmation, then resume → executing).
 *   Frontend opens new SSE on POST /resume. Cleaner than keeping one connection open.
 */
import { Router, type Request, type Response } from 'express';
import { Command } from '@langchain/langgraph';
import { taskCheckpointer } from '../agent/graph.js';
import { resumeRequestSchema } from '../agent/types.js';
import type { buildTaskGraph } from '../agent/graph.js';

// ─── Module-level singletons shared with routes/chat.ts ───────────────────

/**
 * Map from taskId → AbortController for the active task.
 * chat.ts creates on initial stream; tasks.ts reuses on resume.
 * Both files import this module — one shared Map instance.
 */
export const activeControllers = new Map<string, AbortController>();

/**
 * Map from taskId → compiled graph instance for the active task.
 * Separate from chatSessions because graph is per-task (thread_id is per-task).
 */
export const activeGraphs = new Map<string, ReturnType<typeof buildTaskGraph>>();

// ─── Security: taskId format validation ───────────────────────────────────

/**
 * T-66-03-02: taskId must match the format produced by newTaskThreadId().
 * Format: `chat-{chatSessionId}-task-{uuid}` where uuid is a v4 UUID.
 * Rejects path traversal, SQL injection, and other malformed inputs.
 */
const TASK_ID_PATTERN = /^chat-[\w-]+-task-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isValidTaskId(id: string): boolean {
  return TASK_ID_PATTERN.test(id);
}

// ─── Terminal event detection ─────────────────────────────────────────────

const TERMINAL_KINDS = new Set(['task:done', 'task:cancelled', 'task:error']);

function isTerminalEvent(kind: string): boolean {
  return TERMINAL_KINDS.has(kind);
}

// ─── Router ───────────────────────────────────────────────────────────────

export function createTasksRouter(): Router {
  const router = Router();

  /**
   * POST /api/tasks/:taskId/resume
   *
   * Resumes a paused agentic graph (plan-confirmation interrupt or step-failure interrupt).
   * Body: { kind: 'confirm' | 'cancel' | 'edit', feedback?: string }
   *
   * Response: SSE stream (text/event-stream) with task:* events.
   * After terminal event (task:done | task:cancelled | task:error), cleanup and end stream.
   */
  router.post('/:taskId/resume', async (req: Request, res: Response) => {
    // Extract taskId as string — req.params values are always string in Express route params
    const taskId = String(req.params['taskId'] ?? '');

    // T-66-03-02: validate taskId format
    if (!taskId || !isValidTaskId(taskId)) {
      return res.status(400).json({ error: 'taskId malformado' });
    }

    // T-66-03-03: task must be active in this process
    const graph = activeGraphs.get(taskId);
    if (!graph) {
      return res.status(404).json({ error: 'Task não encontrada ou já encerrada' });
    }

    // T-66-03-01: validate body via resumeRequestSchema
    const parsed = resumeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Body inválido', issues: parsed.error.format() });
    }

    // Reuse existing controller or create one for this resume
    const controller = activeControllers.get(taskId) ?? new AbortController();
    activeControllers.set(taskId, controller);

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let isTerminal = false;

    try {
      const stream = await graph.stream(
        new Command({ resume: parsed.data }),
        {
          configurable: { thread_id: taskId },
          streamMode: ['custom', 'messages'] as unknown as 'custom'[],
          signal: controller.signal,
        },
      );

      for await (const chunk of stream) {
        const [mode, data] = Array.isArray(chunk) ? chunk : ['custom', chunk];
        if (mode === 'custom') {
          const evt = data as { kind: string };
          res.write(`event: ${evt.kind}\ndata: ${JSON.stringify({ taskId, ...evt })}\n\n`);
          if (isTerminalEvent(evt.kind)) {
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

      // Check for new interrupt (e.g., step-failure) after stream drains
      const snapshot = await graph.getState({ configurable: { thread_id: taskId } });
      const interrupts = (snapshot.tasks?.[0] as { interrupts?: Array<{ value: unknown }> })?.interrupts ?? [];
      if (interrupts.length > 0) {
        const interruptValue = interrupts[0]!.value as { kind: string; stepId?: number; error?: string };
        if (interruptValue.kind === 'step-failure') {
          res.write(
            `event: task:awaiting-failure-decision\ndata: ${JSON.stringify({
              taskId,
              stepId: interruptValue.stepId,
              error: interruptValue.error,
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
      // T-66-03-05: emit sanitized error message (no stack traces)
      const message = (err as Error).message ?? 'Erro desconhecido';
      res.write(`event: task:error\ndata: ${JSON.stringify({ taskId, atStep: 0, message })}\n\n`);
      // T-66-03-04: cleanup on error
      await taskCheckpointer.deleteThread(taskId).catch(() => {});
      activeControllers.delete(taskId);
      activeGraphs.delete(taskId);
    } finally {
      res.end();
    }
  });

  /**
   * POST /api/tasks/:taskId/cancel
   *
   * Cancels an in-flight task immediately.
   * D-13: primary lever = flip cancelRequested in graph state (cancel-gate before each step).
   *        secondary lever = AbortController.abort() for mid-tool cancellation.
   *
   * Response: 200 { status: 'cancelling' }
   */
  router.post('/:taskId/cancel', async (req: Request, res: Response) => {
    // Extract taskId as string — req.params values are always string in Express route params
    const taskId = String(req.params['taskId'] ?? '');

    // T-66-03-02: validate taskId format
    if (!taskId || !isValidTaskId(taskId)) {
      return res.status(400).json({ error: 'taskId malformado' });
    }

    const controller = activeControllers.get(taskId);
    const graph = activeGraphs.get(taskId);

    if (!controller || !graph) {
      return res.status(404).json({ error: 'Task não encontrada' });
    }

    // D-13: flip state.cancelRequested for cancel-gate (primary lever)
    await graph.updateState(
      { configurable: { thread_id: taskId } },
      { cancelRequested: true },
    );

    // D-13: abort active fetch operations (secondary lever — best-effort)
    controller.abort();

    return res.json({ status: 'cancelling' });
  });

  return router;
}
