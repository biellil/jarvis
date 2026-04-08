/**
 * ActionExecutor (Plan 18_5-04).
 *
 * Orquestra a execução de actions vindas do SSE:
 *   1. Dedup por `tool_call_id` com TTL de 5 minutos (ignora reentradas após
 *      reconexão do stream).
 *   2. Queue FIFO serializada (zero paralelismo entre actions).
 *   3. Dialog de confirmação `dialog.showMessageBox` (pt-BR) para actions
 *      destrutivas — seja pela flag `requires_confirmation` do evento ou pelo
 *      set `requiresConfirmation` injetado.
 *   4. Invocação do handler correspondente em `handlers[event.action]`.
 *   5. Reporting do outcome via `backendClient.postToolCallResult`.
 *
 * Toda dep é injetável pra facilitar testes (dialog, handlers, backendClient,
 * now). `processEvent` jamais propaga erros — senão a promise da queue quebra.
 */
import type { ActionHandler, ActionResult } from './actions/types.js';

export type ActionEvent = {
  tool_call_id: number;
  action: string;
  args: Record<string, unknown>;
  requires_confirmation: boolean;
};

export interface ExecutorDialog {
  showMessageBox(opts: {
    type?: string;
    buttons: string[];
    defaultId?: number;
    cancelId?: number;
    title?: string;
    message: string;
    detail?: string;
  }): Promise<{ response: number }>;
}

export interface ExecutorBackendClient {
  postToolCallResult(
    id: number,
    result:
      | { success: true; output?: string | null }
      | { success: false; output?: string | null; error: string },
  ): Promise<void>;
}

export interface CreateActionExecutorDeps {
  handlers: Record<string, ActionHandler>;
  requiresConfirmation?: Set<string>;
  backendClient: ExecutorBackendClient;
  dialog: ExecutorDialog;
  now?: () => number;
}

export interface ActionExecutor {
  enqueue(event: ActionEvent): void;
  shutdown(): Promise<void>;
}

const TTL_MS = 5 * 60 * 1000;

export function createActionExecutor(
  deps: CreateActionExecutorDeps,
): ActionExecutor {
  const {
    handlers,
    requiresConfirmation = new Set<string>(),
    backendClient,
    dialog,
    now = () => Date.now(),
  } = deps;

  const seen = new Map<number, number>();
  let queue: Promise<void> = Promise.resolve();

  function sweepExpired(): void {
    const cutoff = now() - TTL_MS;
    for (const [id, ts] of seen) {
      if (ts <= cutoff) seen.delete(id);
    }
  }

  async function report(
    id: number,
    result:
      | ActionResult
      | { success: false; error: string }
      | { success: true; output?: string | null },
  ): Promise<void> {
    try {
      await backendClient.postToolCallResult(id, result as never);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[action-executor] postToolCallResult failed for ${id}: ${msg}`,
      );
    }
  }

  async function processEvent(event: ActionEvent): Promise<void> {
    const handler = handlers[event.action];
    if (!handler) {
      await report(event.tool_call_id, {
        success: false,
        error: `unknown_action: ${event.action}`,
      });
      return;
    }

    const needsConfirm =
      event.requires_confirmation === true ||
      requiresConfirmation.has(event.action);

    if (needsConfirm) {
      let response: number;
      try {
        const res = await dialog.showMessageBox({
          type: 'warning',
          buttons: ['Cancelar', 'Sim, executar'],
          defaultId: 0,
          cancelId: 0,
          title: 'Confirmar ação destrutiva',
          message: `JARVIS quer executar "${event.action}". Confirmar?`,
          detail: safeStringify(event.args),
        });
        response = res.response;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await report(event.tool_call_id, {
          success: false,
          error: `dialog_error: ${msg}`,
        });
        return;
      }
      if (response !== 1) {
        await report(event.tool_call_id, {
          success: false,
          error: 'user_denied',
        });
        return;
      }
    }

    let result: ActionResult;
    try {
      result = await handler(event.args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await report(event.tool_call_id, {
        success: false,
        error: `handler_crash: ${msg}`,
      });
      return;
    }
    await report(event.tool_call_id, result);
  }

  function enqueue(event: ActionEvent): void {
    sweepExpired();
    if (seen.has(event.tool_call_id)) {
      console.warn(
        `[action-executor] duplicate tool_call_id ${event.tool_call_id} ignored`,
      );
      return;
    }
    seen.set(event.tool_call_id, now());
    queue = queue.then(() => processEvent(event));
  }

  async function shutdown(): Promise<void> {
    await queue;
  }

  return { enqueue, shutdown };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
