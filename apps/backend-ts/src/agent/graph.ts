import {
  StateGraph,
  Annotation,
  MemorySaver,
  interrupt,
  Command,
  END,
  START,
} from '@langchain/langgraph';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { generatePlan } from './planner.js';
import { runExecutorNode, type ReactAgentLike } from './executor.js';
import type { Plan, ResumeCommand, StepResult } from './types.js';
import { randomUUID } from 'node:crypto';
import { hasCriticalAction, canonicalPlanKey, isApprovedPlan, saveApproval } from './approval.js';
import { db as approvalDb } from '../memory/db.js';

/**
 * D-03 — TaskStateAnnotation: typed state channels.
 * Pitfall 8: every single-value channel uses `(_, x) => x` overwrite reducer
 * so latest value always wins (especially editFeedback for re-edit loops).
 */
export const TaskStateAnnotation = Annotation.Root({
  userInput: Annotation<string>({
    default: () => '',
    reducer: (_, x) => x,
  }),
  plan: Annotation<Plan | null>({
    default: () => null,
    reducer: (_, x) => x,
  }),
  editFeedback: Annotation<string | null>({
    default: () => null,
    reducer: (_, x) => x,
  }),
  stepResults: Annotation<StepResult[]>({
    default: () => [],
    reducer: (a, b) => {
      // If b is replacing (full array), use b. Otherwise concat and dedupe by stepId.
      if (!b || b.length === 0) return a;
      const merged = [...a];
      for (const r of b) {
        const idx = merged.findIndex((x) => x.stepId === r.stepId);
        if (idx >= 0) merged[idx] = r;
        else merged.push(r);
      }
      return merged;
    },
  }),
  cancelRequested: Annotation<boolean>({
    default: () => false,
    reducer: (_, x) => x,
  }),
  lastError: Annotation<{ stepId: number; message: string } | null>({
    default: () => null,
    reducer: (_, x) => x,
  }),
});

export type TaskState = typeof TaskStateAnnotation.State;

/**
 * Singleton checkpointer — one MemorySaver per process, one entry per thread_id.
 * Plan 03 route handler is responsible for calling `deleteThread` on terminal events.
 */
export const taskCheckpointer = new MemorySaver();

/**
 * D-03 — thread_id format: `chat-{chatSessionId}-task-{uuid}`.
 * Permits log correlation with chat session + uniqueness per task.
 */
export function newTaskThreadId(chatSessionId: string): string {
  return `chat-${chatSessionId}-task-${randomUUID()}`;
}

export interface BuildTaskGraphArgs {
  llm: BaseChatModel;
  executorAgent: ReactAgentLike;
}

export function buildTaskGraph(args: BuildTaskGraphArgs) {
  const builder = new StateGraph(TaskStateAnnotation)
    .addNode('planner', async (state: TaskState, config: LangGraphRunnableConfig) => {
      const writer = config.writer as ((payload: unknown) => void) | undefined;

      // Re-prompt path: signal to renderer that a new plan is being generated (D-07).
      if (state.editFeedback) {
        writer?.({ kind: 'task:edit-loop' });
      }

      let plan: Plan;
      try {
        plan = await generatePlan(args.llm, state.userInput, {
          editFeedback: state.editFeedback ?? undefined,
          previousPlan: state.plan ?? undefined,
        });
      } catch (err) {
        // Defensive fallback — UI-SPEC empty-plan copy.
        const fallback: Plan = {
          steps: [
            {
              id: 1,
              description: 'Não consegui planejar essa tarefa.',
              expectedOutcome: 'Tente reformular o pedido com mais detalhes.',
            },
          ],
        };
        writer?.({ kind: 'task:plan', plan: fallback });
        writer?.({ kind: 'task:error', atStep: 0, message: (err as Error).message });
        return { plan: fallback };
      }

      // Only emit task:plan on first run. On resume, state.plan is already set —
      // LangGraph re-runs this node from the top after interrupt(), so skipping
      // prevents the plan from rendering twice in the terminal.
      if (!state.plan) {
        writer?.({ kind: 'task:plan', plan });
      }

      // D-02 (Phase 82): Critical actions always interrupt — never skip from cache.
      if (hasCriticalAction(plan)) {
        const decision = interrupt({
          kind: 'plan-confirmation',
          plan,
        }) as ResumeCommand;

        if (decision.kind === 'cancel') {
          writer?.({ kind: 'task:cancelled', atStep: 0 });
          return new Command({
            goto: END,
            update: { plan, cancelRequested: true, editFeedback: null },
          });
        }

        if (decision.kind === 'edit') {
          return new Command({
            goto: 'planner',
            update: { plan, editFeedback: decision.feedback },
          });
        }

        // confirm — critical actions are never cached (safety requirement)
        return { plan, editFeedback: null };
      }

      // D-01 (Phase 82): Check approval cache — skip interrupt if plan was previously approved.
      const planKey = canonicalPlanKey(plan);
      const alreadyApproved = await isApprovedPlan(planKey, approvalDb as any);

      if (alreadyApproved) {
        // D-03 step 3: auto-approved — execute silently without interrupt.
        writer?.({ kind: 'task:auto-approved' });
        return { plan, editFeedback: null };
      }

      // D-03 step 4: New plan — request confirmation via interrupt.
      const decision = interrupt({
        kind: 'plan-confirmation',
        plan,
      }) as ResumeCommand;

      if (decision.kind === 'cancel') {
        writer?.({ kind: 'task:cancelled', atStep: 0 });
        return new Command({
          goto: END,
          update: { plan, cancelRequested: true, editFeedback: null },
        });
      }

      if (decision.kind === 'edit') {
        // Loop: planner re-runs with feedback. Command({goto:'planner'}) routes back.
        return new Command({
          goto: 'planner',
          update: { plan, editFeedback: decision.feedback },
        });
      }

      // D-03 step 5: User confirmed — save to approval cache for future silent execution.
      await saveApproval(planKey, plan, approvalDb as any);

      // confirm — forward to executor, clear editFeedback so it doesn't re-trigger.
      return { plan, editFeedback: null };
    })
    .addNode('executor', async (state: TaskState, config: LangGraphRunnableConfig) => {
      const result = await runExecutorNode(
        args.executorAgent,
        {
          plan: state.plan,
          stepResults: state.stepResults,
          cancelRequested: state.cancelRequested,
        },
        config,
      );
      return result as Partial<TaskState> | Command;
    })
    .addEdge(START, 'planner')
    .addEdge('planner', 'executor')
    .addEdge('executor', END);

  return builder.compile({ checkpointer: taskCheckpointer });
}
