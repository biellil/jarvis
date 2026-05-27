import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from '@langchain/langgraph';
import type { StreamMode } from '@langchain/langgraph';
import { AIMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Runnable } from '@langchain/core/runnables';
import { z } from 'zod';
import {
  buildTaskGraph,
  taskCheckpointer,
  newTaskThreadId,
} from '../graph.js';
import { createMockChatModel } from './fixtures/mockChatModel.js';
import type { ReactAgentLike } from '../executor.js';
import type { Plan } from '../types.js';

// Phase 82 — mock approval so e2e tests don't touch real SQLite and remain deterministic
vi.mock('../approval.js', () => ({
  hasCriticalAction: vi.fn(() => false),
  canonicalPlanKey: vi.fn(() => 'e2e-mock-key'),
  isApprovedPlan: vi.fn(async () => false),
  saveApproval: vi.fn(async () => undefined),
}));

vi.mock('../../memory/db.js', () => ({
  db: {},
}));

// ──────────────────────────────────────────────────────────────────────────────
// E2E: full plan→confirm→execute→done with mocked LLM + real compiled graph.
// Covers AGENT-01 (full path), AGENT-04 (cancel-gate), AGENT-02 (edit-loop).
// No LM Studio dependency; runs in <5s on CI.
// ──────────────────────────────────────────────────────────────────────────────

const CUSTOM_STREAM: StreamMode[] = ['custom'];

const threePlan: Plan = {
  steps: [
    { id: 1, description: 'Listar arquivos em Downloads', expectedOutcome: '14 arquivos listados' },
    { id: 2, description: 'Filtrar PDFs', expectedOutcome: '5 PDFs identificados' },
    { id: 3, description: 'Mover PDFs para Documentos', expectedOutcome: '5 PDFs movidos' },
  ],
};

/** ReAct stub that returns a step-specific summary based on the configurable.stepId. */
function makeStepAwareAgent(perStep: Record<number, string>, fallback = 'Concluído'): ReactAgentLike {
  return {
    invoke: async ({ messages }, config) => {
      const stepId = (config?.configurable as { stepId?: number } | undefined)?.stepId;
      const text = (stepId !== undefined && perStep[stepId]) || fallback;
      return { messages: [...messages, new AIMessage(text)] };
    },
  };
}

/** Mock chat model that returns DIFFERENT plans per invocation order. Used by edit-loop test. */
function createSequencedMockChatModel(plans: Plan[], capturedPrompts: string[]): BaseChatModel {
  let callIdx = 0;
  const stub = {
    withStructuredOutput<T>(_schema: z.ZodType<T>): Runnable<unknown, T> {
      return {
        invoke: async (input: unknown): Promise<T> => {
          if (Array.isArray(input)) {
            for (const msg of input as Array<{ content?: unknown }>) {
              if (msg && typeof msg.content === 'string') capturedPrompts.push(msg.content);
            }
          } else if (typeof input === 'string') {
            capturedPrompts.push(input);
          }
          const plan = plans[Math.min(callIdx, plans.length - 1)] as unknown as T;
          callIdx++;
          return plan;
        },
      } as unknown as Runnable<unknown, T>;
    },
    invoke: async () => {
      throw new Error('sequencedMock.invoke not implemented — use withStructuredOutput path');
    },
  };
  return stub as unknown as BaseChatModel;
}

async function drainStream(stream: AsyncIterable<unknown>): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const chunk of stream) {
    if (Array.isArray(chunk) && chunk[0] === 'custom') {
      events.push(chunk[1]);
    }
  }
  return events;
}

describe('graph e2e — plan → confirm → execute → done', () => {
  let threadId: string;

  beforeEach(() => {
    threadId = newTaskThreadId('e2e-session');
  });

  // ── AGENT-01 ─────────────────────────────────────────────────────────────
  it('AGENT-01: completes 3-step task with exact event sequence', async () => {
    const llm = createMockChatModel({ planResponse: threePlan });
    const agent = makeStepAwareAgent({
      1: 'Listei 14 arquivos',
      2: 'Filtrei 5 PDFs',
      3: 'Movi 5 PDFs',
    }, 'Tarefa concluída');
    const graph = buildTaskGraph({ llm, executorAgent: agent });
    const config = { configurable: { thread_id: threadId }, streamMode: CUSTOM_STREAM };

    // Phase 1: planner runs and graph interrupts on plan-confirmation.
    await drainStream(await graph.stream({ userInput: 'organize Downloads' }, config));
    const snapshot = await graph.getState({ configurable: { thread_id: threadId } });
    expect(snapshot.tasks.length).toBeGreaterThan(0);
    expect((snapshot.tasks[0].interrupts[0]?.value as { kind: string }).kind).toBe('plan-confirmation');

    // Phase 2: resume with confirm — executor walks all 3 steps then emits task:done.
    const events = await drainStream(
      await graph.stream(new Command({ resume: { kind: 'confirm' } }), config),
    );

    // Filter to executor-emitted events (drop task:plan from the planner re-entry).
    const stepStarts = events.filter((e) => (e as { kind: string }).kind === 'task:step:start') as Array<{ stepId: number }>;
    const stepEnds = events.filter((e) => (e as { kind: string }).kind === 'task:step:end') as Array<{ stepId: number; summary: string }>;
    const dones = events.filter((e) => (e as { kind: string }).kind === 'task:done');

    expect(stepStarts).toHaveLength(3);
    expect(stepEnds).toHaveLength(3);
    expect(dones).toHaveLength(1);

    // Order: each step:start must precede its step:end, and task:done must be last.
    const order = events
      .filter((e) => {
        const k = (e as { kind: string }).kind;
        return k === 'task:step:start' || k === 'task:step:end' || k === 'task:done';
      })
      .map((e) => (e as { kind: string }).kind);
    expect(order).toEqual([
      'task:step:start',
      'task:step:end',
      'task:step:start',
      'task:step:end',
      'task:step:start',
      'task:step:end',
      'task:done',
    ]);

    // Step summaries propagate from ReAct agent → step:end.summary.
    expect(stepEnds[0]?.summary).toBe('Listei 14 arquivos');
    expect(stepEnds[1]?.summary).toBe('Filtrei 5 PDFs');
    expect(stepEnds[2]?.summary).toBe('Movi 5 PDFs');

    await taskCheckpointer.deleteThread(threadId);
  });

  // ── AGENT-04 cancel-gate ─────────────────────────────────────────────────
  it('AGENT-04: cancelRequested before resume halts at step 1 with no step:start emitted', async () => {
    const llm = createMockChatModel({ planResponse: threePlan });
    let agentInvocations = 0;
    const agent: ReactAgentLike = {
      invoke: async ({ messages }) => {
        agentInvocations++;
        return { messages: [...messages, new AIMessage('should-not-appear')] };
      },
    };
    const graph = buildTaskGraph({ llm, executorAgent: agent });
    const config = { configurable: { thread_id: threadId }, streamMode: CUSTOM_STREAM };

    await drainStream(await graph.stream({ userInput: 'organize' }, config));
    await graph.updateState({ configurable: { thread_id: threadId } }, { cancelRequested: true });

    const events = await drainStream(
      await graph.stream(new Command({ resume: { kind: 'confirm' } }), config),
    );

    const cancelled = events.find((e) => (e as { kind: string }).kind === 'task:cancelled') as
      | { atStep: number }
      | undefined;
    expect(cancelled).toBeDefined();
    expect(cancelled?.atStep).toBe(1);

    expect(events.some((e) => (e as { kind: string }).kind === 'task:step:start')).toBe(false);
    expect(events.some((e) => (e as { kind: string }).kind === 'task:done')).toBe(false);
    expect(agentInvocations).toBe(0);

    await taskCheckpointer.deleteThread(threadId);
  });

  // ── AGENT-02 edit-loop ───────────────────────────────────────────────────
  it('AGENT-02 edit-loop: feedback re-runs planner with feedback inside the prompt', async () => {
    const firstPlan: Plan = {
      steps: [
        { id: 1, description: 'Original step', expectedOutcome: 'Original outcome' },
      ],
    };
    const editedPlan: Plan = {
      steps: [
        { id: 1, description: 'Edited step', expectedOutcome: 'Edited outcome' },
      ],
    };
    const captured: string[] = [];
    const llm = createSequencedMockChatModel([firstPlan, editedPlan], captured);
    const graph = buildTaskGraph({ llm, executorAgent: makeStepAwareAgent({}, 'ok') });
    const config = { configurable: { thread_id: threadId }, streamMode: CUSTOM_STREAM };

    // Phase 1: planner returns firstPlan, graph interrupts.
    const phase1 = await drainStream(await graph.stream({ userInput: 'do something' }, config));
    const firstPlanEvent = phase1.find((e) => (e as { kind: string }).kind === 'task:plan') as
      | { plan: Plan }
      | undefined;
    expect(firstPlanEvent?.plan.steps[0]?.description).toBe('Original step');

    // Phase 2: resume with edit → planner re-runs with feedback baked into the prompt.
    const phase2 = await drainStream(
      await graph.stream(
        new Command({ resume: { kind: 'edit', feedback: 'use a different step' } }),
        config,
      ),
    );

    // Captured planner prompts should include the feedback string.
    expect(captured.some((p) => p.includes('use a different step'))).toBe(true);

    // Second task:plan event reflects the edited plan.
    const planEvents = phase2.filter((e) => (e as { kind: string }).kind === 'task:plan') as Array<{ plan: Plan }>;
    expect(planEvents.length).toBeGreaterThan(0);
    const lastPlan = planEvents[planEvents.length - 1]?.plan;
    expect(lastPlan?.steps[0]?.description).toBe('Edited step');

    await taskCheckpointer.deleteThread(threadId);
  });
});
