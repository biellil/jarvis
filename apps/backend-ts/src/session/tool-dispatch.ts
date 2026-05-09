/**
 * Tool dispatch wrapper — Plan 18-03.
 *
 * Envolve cada PC tool (payload-only) num wrapper que, ao ser invocada pelo agent:
 *   1. Executa a tool original pra obter o payload JSON-stringified.
 *   2. Grava audit log via `ToolLogger.logDispatch(name, args)` → retorna `id`.
 *   3. Se um listener estiver ativo (via `DispatchContext.getListener()`),
 *      chama `listener({toolCallId, action, args, requiresConfirmation})`.
 *   4. Retorna o payload original pro agent (transparente).
 *
 * O wrapper é o ponto de costura entre "agent invocou tool" e "resto do sistema
 * precisa saber" (audit + SSE do plano 18-04). Listener é opcional — sem listener,
 * só o audit roda. Degrada suave quando `logDispatch` retorna null (DB erro):
 * NÃO chama listener (sem id pra referenciar) mas ainda devolve o payload ao agent.
 *
 * recall_memory NÃO é wrappada — só as 9 PC tools da `createAllPcTools()`.
 */
import { tool, type StructuredToolInterface } from '@langchain/core/tools';

import type { ToolLogger } from '../memory/store.js';

export interface DispatchEvent {
  toolCallId: number;
  action: string;
  args: Record<string, unknown>;
  requiresConfirmation: boolean;
}

export type OnToolDispatched = (ev: DispatchEvent) => void;

/** Phase 66 D-17: metadata about the active agentic task for audit enrichment. */
export interface TaskMeta {
  taskId: string;
  stepId: number;
}

export interface DispatchContext {
  logger: ToolLogger;
  getListener: () => OnToolDispatched | null;
  /** Phase 66 D-13: AbortSignal from the active task's AbortController. Null outside tasks. */
  getSignal: () => AbortSignal | null;
  /** Phase 66 D-17: returns taskId + stepId for audit enrichment. Null outside tasks. */
  getTaskMeta: () => TaskMeta | null;
}

export function wrapPcTool(
  original: StructuredToolInterface,
  ctx: DispatchContext,
): StructuredToolInterface {
  const originalName = original.name;
  const originalDescription = original.description;
  const originalSchema = (original as unknown as { schema: unknown }).schema;

  const wrapped = tool(
    async (input: Record<string, unknown>, runConfig?: unknown) => {
      // Executa a original — retorna a content string (JSON-stringified payload)
      // porque as PC tools usam responseFormat: 'content_and_artifact' e .invoke()
      // sem config só pega a content.
      // Phase 66: forward runConfig so AbortSignal from LangGraph flows through.
      const rawResult = await original.invoke(input, runConfig as Record<string, unknown>);

      let payload: Record<string, unknown>;
      try {
        payload =
          typeof rawResult === 'string'
            ? (JSON.parse(rawResult) as Record<string, unknown>)
            : (rawResult as Record<string, unknown>);
      } catch {
        // Não é JSON — passa pro agent sem dispatch (degradação suave)
        return rawResult;
      }

      const action = String(payload.action ?? originalName);
      const args = (payload.args as Record<string, unknown> | undefined) ?? {};
      const requiresConfirmation = payload.requires_confirmation === true;

      const id = ctx.logger.logDispatch(originalName, args);
      if (id !== null) {
        const listener = ctx.getListener();
        if (listener) {
          try {
            listener({ toolCallId: id, action, args, requiresConfirmation });
          } catch (exc) {
            console.warn(
              `tool-dispatch: listener threw for ${originalName}: ${(exc as Error).message}`,
            );
          }
        }
      }

      return rawResult;
    },
    {
      name: originalName,
      description: originalDescription,
      // @ts-expect-error — schema is passthrough; runtime type is zod schema
      schema: originalSchema,
    },
  );
  return wrapped as unknown as StructuredToolInterface;
}

export function wrapAllPcTools(
  tools: StructuredToolInterface[],
  ctx: DispatchContext,
): StructuredToolInterface[] {
  return tools.map((t) => wrapPcTool(t, ctx));
}
