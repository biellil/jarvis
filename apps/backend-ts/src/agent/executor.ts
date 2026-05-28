import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { HumanMessage, AIMessage, type BaseMessage } from '@langchain/core/messages';
import {
  type Plan,
  type StepResult,
  type ResumeCommand,
} from './types.js';

/**
 * Minimal interface the executor needs from the existing createReactAgent in chat-session.ts:206.
 * D-04: REUSE the existing agent — do NOT rebuild here.
 */
export interface ReactAgentLike {
  invoke(
    input: { messages: BaseMessage[] },
    config?: { signal?: AbortSignal; configurable?: Record<string, unknown> },
  ): Promise<{ messages: BaseMessage[] }>;
}

/** Extract the final AI message text from a ReAct conversation tail. Mirrors chat-session.ts:486. */
export function extractFinalAiText(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg instanceof AIMessage) {
      const c = msg.content;
      if (typeof c === 'string') return c;
      if (Array.isArray(c)) {
        return c
          .map((part) => (typeof part === 'string' ? part : (part as { text?: string }).text ?? ''))
          .join('');
      }
    }
  }
  return '';
}

/** D-11 hard cap: output summary ≤ 80 chars. Truncate with ellipsis if longer. */
function clampSummary(text: string): string {
  const trimmed = text.trim().split(/\r?\n/)[0]?.trim() ?? '';
  if (trimmed.length <= 80) return trimmed;
  return `${trimmed.slice(0, 77)}…`;
}

interface ExecutorState {
  plan: Plan | null;
  stepResults: StepResult[];
  cancelRequested: boolean;
  userInput?: string;
}

/**
 * Final summary LLM call (D-08 task:done summary).
 * Single small call — accepts the executor's React agent (which already has SYSTEM_PROMPT).
 * Returns 1-3 sentence pt-BR summary of what was actually done based on stepResults.
 */
export async function generateFinalSummary(
  reactAgent: ReactAgentLike,
  plan: Plan,
  results: StepResult[],
): Promise<string> {
  const successful = results.filter((r) => r.status === 'success');
  if (successful.length === 0) return 'Tarefa concluída sem ações executadas.';
  // Construct a recap prompt — ReAct agent will likely respond with plain text (no tool calls needed).
  const recap = successful
    .map((r) => `${r.stepId}. ${r.outputSummary}`)
    .join('\n');
  const summaryPrompt = new HumanMessage(
    `Os passos abaixo foram concluídos. Escreva 1 a 3 frases curtas em português brasileiro resumindo o que foi feito. NÃO repita os passos literalmente — agregue.\n\n${recap}`,
  );
  const result = await reactAgent.invoke({ messages: [summaryPrompt] });
  return extractFinalAiText(result.messages).trim() || 'Tarefa concluída.';
}

/**
 * Execute the plan step-by-step with cancel-gate (D-13), AbortSignal threading,
 * and step-failure interrupt (D-16). Emits SSE events via config.writer (D-10).
 */
export async function runExecutorNode(
  reactAgent: ReactAgentLike,
  state: ExecutorState,
  config: LangGraphRunnableConfig,
): Promise<Partial<ExecutorState> | Command> {
  const { plan, stepResults: existingResults, userInput } = state;
  if (!plan) throw new Error('executor: plan missing');

  const writer = config.writer as ((payload: unknown) => void) | undefined;
  const signal = (config as { signal?: AbortSignal }).signal;
  const newResults: StepResult[] = [];

  for (const step of plan.steps) {
    // ── D-13 PRIMARY LEVER: cancel-gate before each step ─────────────
    if (state.cancelRequested || signal?.aborted) {
      writer?.({ kind: 'task:cancelled', atStep: step.id });
      return { stepResults: [...newResults] };
    }

    // Skip steps already done (replan-resume path: results carry forward)
    if (existingResults.some((r) => r.stepId === step.id)) continue;

    writer?.({
      kind: 'task:step:start',
      stepId: step.id,
      description: step.description,
    });

    // Conversational step ("Responder ao usuário") — pass original user message directly
    // so the LLM can give a natural reply instead of a task-execution summary phrase.
    const isConversational =
      plan.steps.length === 1 &&
      step.description.trim().toLowerCase() === 'responder ao usuário';

    const stepInstruction = isConversational
      ? new HumanMessage(userInput ?? step.description)
      : new HumanMessage(
          `Passo ${step.id} de ${plan.steps.length} de uma tarefa multi-step.\n\n` +
            `Ação: ${step.description}\n` +
            `Resultado esperado: ${step.expectedOutcome}\n\n` +
            `Execute APENAS este passo (não pule pra frente). Quando terminar, responda com UMA frase em português brasileiro de no máximo 80 caracteres no formato '{verbo no passado} {objeto}', exemplos: "Listei 14 arquivos", "Movi 3 PDFs", "Capturei a tela".`,
        );

    try {
      const result = await reactAgent.invoke(
        { messages: [stepInstruction] },
        {
          signal,
          configurable: {
            taskId: (config.configurable as Record<string, unknown> | undefined)?.thread_id,
            stepId: step.id,
          },
        },
      );

      const rawResponse = extractFinalAiText(result.messages);

      // For conversational steps, use the full LLM response as task:done summary directly.
      // No generateFinalSummary call needed — the response IS the answer.
      if (isConversational) {
        writer?.({ kind: 'task:done', summary: rawResponse.trim() });
        return { stepResults: [] };
      }

      const outputSummary = clampSummary(rawResponse);
      const stepResult: StepResult = {
        stepId: step.id,
        status: 'success',
        outputSummary,
      };
      newResults.push(stepResult);
      writer?.({
        kind: 'task:step:end',
        stepId: step.id,
        status: 'success',
        summary: outputSummary,
      });
    } catch (err) {
      const errMessage = (err as Error).message ?? 'Erro desconhecido';

      // AbortError caused by cancel — exit cleanly, NOT a failure interrupt.
      if ((err as Error).name === 'AbortError' || signal?.aborted) {
        writer?.({ kind: 'task:cancelled', atStep: step.id });
        return { stepResults: [...newResults] };
      }

      // D-16: pause the graph for human decision (continue / replan / abort).
      // SSE event `task:awaiting-failure-decision` is emitted EXCLUSIVELY by the
      // route handler (Plan 03 tasks.ts) after `getState()` detects this pending
      // interrupt — same pattern used for `task:awaiting-confirmation`. Emitting
      // here too would duplicate the event (reducer is idempotent, but the wire
      // protocol should be clean: one logical interrupt → one SSE event).
      const decision = interrupt({
        kind: 'step-failure',
        stepId: step.id,
        error: errMessage,
      }) as ResumeCommand;

      if (decision.kind === 'continue') {
        const skipResult: StepResult = {
          stepId: step.id,
          status: 'skipped',
          outputSummary: 'Pulado pelo usuário',
        };
        newResults.push(skipResult);
        writer?.({
          kind: 'task:step:end',
          stepId: step.id,
          status: 'error',
          summary: errMessage,
        });
        continue;
      }

      if (decision.kind === 'replan') {
        return new Command({
          goto: 'planner',
          update: {
            stepResults: [...newResults],
            editFeedback: `O passo ${step.id} (${step.description}) falhou com: "${errMessage}". Replanejar evitando essa abordagem.`,
            lastError: { stepId: step.id, message: errMessage },
          },
        });
      }

      // decision.kind === 'abort' — emit task:error and terminate.
      writer?.({ kind: 'task:error', atStep: step.id, message: errMessage });
      return {
        stepResults: [...newResults],
      };
    }
  }

  // ── All steps successful → final summary + task:done ─────────────────
  const summary = await generateFinalSummary(reactAgent, plan, newResults);
  writer?.({ kind: 'task:done', summary });
  return { stepResults: [...newResults] };
}
