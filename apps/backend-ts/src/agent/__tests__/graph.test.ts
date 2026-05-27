import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from '@langchain/langgraph';
import type { StreamMode } from '@langchain/langgraph';
import { AIMessage } from '@langchain/core/messages';
import {
  buildTaskGraph,
  taskCheckpointer,
  newTaskThreadId,
  TaskStateAnnotation,
} from '../graph.js';
import { createMockChatModel } from './fixtures/mockChatModel.js';
import type { ReactAgentLike } from '../executor.js';
import type { Plan } from '../types.js';

// ──────────────────────────────────────────────────────────────────────────────
// Phase 82 — mock approval module so tests don't touch real SQLite
// ──────────────────────────────────────────────────────────────────────────────
vi.mock('../approval.js', () => ({
  hasCriticalAction: vi.fn(() => false),
  canonicalPlanKey: vi.fn(() => 'mock-plan-key'),
  isApprovedPlan: vi.fn(async () => false),
  saveApproval: vi.fn(async () => undefined),
}));

vi.mock('../../memory/db.js', () => ({
  db: {},
}));

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

// Use mutable StreamMode[] so TypeScript is satisfied
const CUSTOM_STREAM: StreamMode[] = ['custom'];

const simplePlan: Plan = {
  steps: [
    { id: 1, description: 'Listar arquivos em Downloads', expectedOutcome: '14 arquivos listados' },
    { id: 2, description: 'Mover PDFs para Documentos', expectedOutcome: '5 PDFs movidos' },
  ],
};

const threePlan: Plan = {
  steps: [
    { id: 1, description: 'Passo 1', expectedOutcome: 'Feito 1' },
    { id: 2, description: 'Passo 2', expectedOutcome: 'Feito 2' },
    { id: 3, description: 'Passo 3', expectedOutcome: 'Feito 3' },
  ],
};

function makeReactAgent(responseText = 'Concluído com sucesso'): ReactAgentLike {
  return {
    invoke: async ({ messages }) => ({
      messages: [...messages, new AIMessage(responseText)],
    }),
  };
}

/** Drain a graph stream and collect all custom events */
async function drainStream(stream: AsyncIterable<unknown>): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const chunk of stream) {
    if (Array.isArray(chunk) && chunk[0] === 'custom') {
      events.push(chunk[1]);
    } else if (chunk && typeof chunk === 'object' && !Array.isArray(chunk)) {
      events.push(chunk);
    }
  }
  return events;
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('buildTaskGraph', () => {
  let threadId: string;

  beforeEach(async () => {
    threadId = newTaskThreadId('test-session');
  });

  it('returns a compiled graph with stream, invoke, getState, updateState methods', () => {
    const llm = createMockChatModel({ planResponse: simplePlan });
    const graph = buildTaskGraph({ llm, executorAgent: makeReactAgent() });
    expect(typeof graph.stream).toBe('function');
    expect(typeof graph.invoke).toBe('function');
    expect(typeof graph.getState).toBe('function');
    expect(typeof graph.updateState).toBe('function');
  });

  describe('AGENT-02: plan-confirmation interrupt', () => {
    it('after planner runs, graph.getState() shows task with interrupts[0].value.kind === "plan-confirmation"', async () => {
      const llm = createMockChatModel({ planResponse: simplePlan });
      const graph = buildTaskGraph({ llm, executorAgent: makeReactAgent() });
      const config = { configurable: { thread_id: threadId }, streamMode: CUSTOM_STREAM };

      await drainStream(await graph.stream({ userInput: 'organize Downloads' }, config));

      const snapshot = await graph.getState({ configurable: { thread_id: threadId } });
      expect(snapshot.tasks.length).toBeGreaterThan(0);
      const interrupt = snapshot.tasks[0].interrupts[0];
      expect(interrupt).toBeDefined();
      expect((interrupt.value as { kind: string }).kind).toBe('plan-confirmation');

      await taskCheckpointer.deleteThread(threadId);
    });

    it('Command({resume:{kind:"confirm"}}) progresses graph to executor and emits task:step:* events', async () => {
      const llm = createMockChatModel({ planResponse: simplePlan });
      const graph = buildTaskGraph({ llm, executorAgent: makeReactAgent('Listei 14 arquivos') });
      const config = { configurable: { thread_id: threadId }, streamMode: CUSTOM_STREAM };

      const events1 = await drainStream(await graph.stream({ userInput: 'organize Downloads' }, config));
      const planEvent = events1.find((e) => (e as { kind: string }).kind === 'task:plan');
      expect(planEvent).toBeDefined();

      const events2 = await drainStream(
        await graph.stream(new Command({ resume: { kind: 'confirm' } }), config),
      );
      const kinds2 = events2.map((e) => (e as { kind: string }).kind);
      expect(kinds2).toContain('task:step:start');
      expect(kinds2).toContain('task:step:end');
      expect(kinds2).toContain('task:done');

      await taskCheckpointer.deleteThread(threadId);
    });

    it('Command({resume:{kind:"cancel"}}) terminates with cancelRequested=true', async () => {
      const llm = createMockChatModel({ planResponse: simplePlan });

      // Local spy with explicit type
      let executorInvoked = false;
      const executorSpy: ReactAgentLike = {
        invoke: async (input) => {
          executorInvoked = true;
          return { messages: [new AIMessage('done')] };
        },
      };

      const graph = buildTaskGraph({ llm, executorAgent: executorSpy });
      const config = { configurable: { thread_id: threadId }, streamMode: CUSTOM_STREAM };

      await drainStream(await graph.stream({ userInput: 'organize Downloads' }, config));

      const events2 = await drainStream(
        await graph.stream(new Command({ resume: { kind: 'cancel' } }), config),
      );

      const cancelEvent = events2.find((e) => (e as { kind: string }).kind === 'task:cancelled');
      expect(cancelEvent).toBeDefined();
      // WR-06: planner emits task:cancelled with atStep:0 (no step started yet).
      expect(cancelEvent).toMatchObject({ kind: 'task:cancelled', atStep: 0 });

      const snapshot = await graph.getState({ configurable: { thread_id: threadId } });
      expect(snapshot.values.cancelRequested).toBe(true);

      expect(executorInvoked).toBe(false);

      await taskCheckpointer.deleteThread(threadId);
    });

    it('Command({resume:{kind:"edit", feedback:"..."}}) loops back to planner with editFeedback set', async () => {
      const capturedPrompts: string[] = [];
      const llm = createMockChatModel({ planResponse: simplePlan, capturedPrompts });
      const graph = buildTaskGraph({ llm, executorAgent: makeReactAgent() });
      const config = { configurable: { thread_id: threadId }, streamMode: CUSTOM_STREAM };

      await drainStream(await graph.stream({ userInput: 'organize Downloads' }, config));

      // Resume with edit — planner re-runs with editFeedback
      await drainStream(
        await graph.stream(new Command({ resume: { kind: 'edit', feedback: 'tira o passo 2' } }), config),
      );

      const allContent = capturedPrompts.join('\n');
      expect(allContent).toContain('tira o passo 2');

      await taskCheckpointer.deleteThread(threadId);
    });
  });

  describe('AGENT-01: end-to-end', () => {
    it('completes 3-step task end-to-end: plan → confirm → step1 → step2 → step3 → done', async () => {
      const llm = createMockChatModel({ planResponse: threePlan });
      const graph = buildTaskGraph({ llm, executorAgent: makeReactAgent('Concluído') });
      const config = { configurable: { thread_id: threadId }, streamMode: CUSTOM_STREAM };

      const events1 = await drainStream(await graph.stream({ userInput: 'faça 3 coisas' }, config));
      expect(events1.some((e) => (e as { kind: string }).kind === 'task:plan')).toBe(true);

      const events2 = await drainStream(
        await graph.stream(new Command({ resume: { kind: 'confirm' } }), config),
      );

      const kinds = events2.map((e) => (e as { kind: string }).kind);
      expect(kinds.filter((k) => k === 'task:step:start').length).toBe(3);
      expect(kinds.filter((k) => k === 'task:step:end').length).toBe(3);
      expect(kinds).toContain('task:done');

      await taskCheckpointer.deleteThread(threadId);
    });
  });

  describe('AGENT-04: cancellation', () => {
    it('cancelRequested via updateState halts execution before next step', async () => {
      const llm = createMockChatModel({ planResponse: simplePlan });
      let stepCount = 0;
      const countingAgent: ReactAgentLike = {
        invoke: async ({ messages }) => {
          stepCount++;
          return { messages: [...messages, new AIMessage('Concluído step ' + stepCount)] };
        },
      };
      const graph = buildTaskGraph({ llm, executorAgent: countingAgent });
      const config = { configurable: { thread_id: threadId }, streamMode: CUSTOM_STREAM };

      await drainStream(await graph.stream({ userInput: 'organize' }, config));
      await graph.updateState({ configurable: { thread_id: threadId } }, { cancelRequested: true });

      const events2 = await drainStream(
        await graph.stream(new Command({ resume: { kind: 'confirm' } }), config),
      );

      const cancelEvent = events2.find((e) => (e as { kind: string }).kind === 'task:cancelled');
      expect(cancelEvent).toBeDefined();
      expect(events2.some((e) => (e as { kind: string }).kind === 'task:step:end')).toBe(false);

      await taskCheckpointer.deleteThread(threadId);
    });

    it('task:cancelled emitted with atStep field set to the first pending step id', async () => {
      const llm = createMockChatModel({ planResponse: simplePlan });
      const graph = buildTaskGraph({ llm, executorAgent: makeReactAgent() });
      const config = { configurable: { thread_id: threadId }, streamMode: CUSTOM_STREAM };

      await drainStream(await graph.stream({ userInput: 'organize' }, config));
      await graph.updateState({ configurable: { thread_id: threadId } }, { cancelRequested: true });

      const events2 = await drainStream(
        await graph.stream(new Command({ resume: { kind: 'confirm' } }), config),
      );

      const cancelEvent = events2.find((e) => (e as { kind: string }).kind === 'task:cancelled');
      expect((cancelEvent as { atStep: number }).atStep).toBe(1);

      await taskCheckpointer.deleteThread(threadId);
    });
  });

  describe('thread_id factory', () => {
    it('newTaskThreadId returns string matching pattern /^chat-[^-]+-task-[0-9a-f-]{36}$/', () => {
      const id = newTaskThreadId('chat-123');
      expect(id).toMatch(/^chat-chat-123-task-[0-9a-f-]{36}$/);
    });

    it('newTaskThreadId generates unique IDs for same session', () => {
      const id1 = newTaskThreadId('session-abc');
      const id2 = newTaskThreadId('session-abc');
      expect(id1).not.toBe(id2);
    });
  });

  describe('MemorySaver lifecycle', () => {
    it('deleteThread removes thread from MemorySaver (state returns defaults after deletion)', async () => {
      const llm = createMockChatModel({ planResponse: simplePlan });
      const graph = buildTaskGraph({ llm, executorAgent: makeReactAgent() });
      const config = { configurable: { thread_id: threadId }, streamMode: CUSTOM_STREAM };

      await drainStream(await graph.stream({ userInput: 'test' }, config));

      const snapshotBefore = await graph.getState({ configurable: { thread_id: threadId } });
      expect(snapshotBefore.values.userInput).toBe('test');

      await taskCheckpointer.deleteThread(threadId);

      const snapshotAfter = await graph.getState({ configurable: { thread_id: threadId } });
      expect(snapshotAfter.values.userInput ?? '').toBe('');
    });
  });

  describe('Annotation reducers', () => {
    it('editFeedback uses overwrite reducer — second edit replaces first (Pitfall 8 mitigation)', async () => {
      const allCaptured: string[] = [];
      const llm = createMockChatModel({ planResponse: simplePlan, capturedPrompts: allCaptured });
      const graph = buildTaskGraph({ llm, executorAgent: makeReactAgent() });
      const config = { configurable: { thread_id: threadId }, streamMode: CUSTOM_STREAM };

      await drainStream(await graph.stream({ userInput: 'organize' }, config));
      await drainStream(await graph.stream(new Command({ resume: { kind: 'edit', feedback: 'first feedback' } }), config));
      await drainStream(await graph.stream(new Command({ resume: { kind: 'edit', feedback: 'second feedback' } }), config));

      // Most recent planner call should include 'second feedback'
      const lastPrompt = allCaptured[allCaptured.length - 1] ?? '';
      expect(lastPrompt).toContain('second feedback');

      await taskCheckpointer.deleteThread(threadId);
    });
  });
});

describe('TaskStateAnnotation', () => {
  it('has 6 channels: userInput, plan, editFeedback, stepResults, cancelRequested, lastError', () => {
    const channels = Object.keys(TaskStateAnnotation.spec);
    expect(channels).toContain('userInput');
    expect(channels).toContain('plan');
    expect(channels).toContain('editFeedback');
    expect(channels).toContain('stepResults');
    expect(channels).toContain('cancelRequested');
    expect(channels).toContain('lastError');
    expect(channels).toHaveLength(6);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Phase 82 — conditional interrupt tests
// ──────────────────────────────────────────────────────────────────────────────

describe('conditional interrupt (Phase 82)', () => {
  // Import mocked functions lazily to manipulate per-test
  let hasCriticalActionMock: ReturnType<typeof vi.fn>;
  let isApprovedPlanMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const approvalModule = await import('../approval.js');
    hasCriticalActionMock = approvalModule.hasCriticalAction as unknown as ReturnType<typeof vi.fn>;
    isApprovedPlanMock = approvalModule.isApprovedPlan as unknown as ReturnType<typeof vi.fn>;
    // Reset to safe defaults
    hasCriticalActionMock.mockReturnValue(false);
    isApprovedPlanMock.mockResolvedValue(false);
  });

  it('APR-02: pre-approved plan skips interrupt and emits task:auto-approved', async () => {
    // Plan with no critical action and approved key in cache
    hasCriticalActionMock.mockReturnValue(false);
    isApprovedPlanMock.mockResolvedValue(true);

    const approvedPlan: Plan = {
      steps: [
        { id: 1, description: 'Listar arquivos em Downloads', expectedOutcome: '14 arquivos listados' },
      ],
    };
    const llm = createMockChatModel({ planResponse: approvedPlan });
    const graph = buildTaskGraph({ llm, executorAgent: makeReactAgent() });
    const tid = newTaskThreadId('phase82-test');
    const config = { configurable: { thread_id: tid }, streamMode: CUSTOM_STREAM as StreamMode[] };

    const events = await drainStream(await graph.stream({ userInput: 'listar arquivos' }, config));
    const kinds = events.map((e) => (e as { kind: string }).kind);

    // Should NOT interrupt (no task:awaiting-confirmation)
    expect(kinds).not.toContain('task:awaiting-confirmation');
    // Should emit auto-approved signal
    expect(kinds).toContain('task:auto-approved');
    // Should proceed to executor — emitting task:done
    expect(kinds).toContain('task:done');

    await taskCheckpointer.deleteThread(tid);
  });

  it('APR-03: plan with critical keyword always interrupts, even if key is in cache', async () => {
    // Critical action plan — should always interrupt regardless of approval cache
    hasCriticalActionMock.mockReturnValue(true);
    isApprovedPlanMock.mockResolvedValue(true); // cache would approve, but critical overrides

    const criticalPlan: Plan = {
      steps: [
        { id: 1, description: 'delete file.txt', expectedOutcome: 'done' },
      ],
    };
    const llm = createMockChatModel({ planResponse: criticalPlan });
    const graph = buildTaskGraph({ llm, executorAgent: makeReactAgent() });
    const tid = newTaskThreadId('phase82-critical');
    const config = { configurable: { thread_id: tid }, streamMode: CUSTOM_STREAM as StreamMode[] };

    await drainStream(await graph.stream({ userInput: 'delete file' }, config));

    // Graph should be paused at interrupt
    const snapshot = await graph.getState({ configurable: { thread_id: tid } });
    expect(snapshot.tasks.length).toBeGreaterThan(0);
    const interruptVal = snapshot.tasks[0].interrupts[0];
    expect(interruptVal).toBeDefined();
    expect((interruptVal.value as { kind: string }).kind).toBe('plan-confirmation');

    await taskCheckpointer.deleteThread(tid);
  });

  it('KWD-check: plan without critical keywords and not in cache goes through normal interrupt', async () => {
    hasCriticalActionMock.mockReturnValue(false);
    isApprovedPlanMock.mockResolvedValue(false);

    const newPlan: Plan = {
      steps: [
        { id: 1, description: 'Mover PDFs para Documentos', expectedOutcome: '5 PDFs movidos' },
      ],
    };
    const llm = createMockChatModel({ planResponse: newPlan });
    const graph = buildTaskGraph({ llm, executorAgent: makeReactAgent() });
    const tid = newTaskThreadId('phase82-new');
    const config = { configurable: { thread_id: tid }, streamMode: CUSTOM_STREAM as StreamMode[] };

    await drainStream(await graph.stream({ userInput: 'mover pdfs' }, config));

    // Graph should be paused at interrupt waiting for confirmation
    const snapshot = await graph.getState({ configurable: { thread_id: tid } });
    expect(snapshot.tasks.length).toBeGreaterThan(0);
    const interruptVal = snapshot.tasks[0].interrupts[0];
    expect(interruptVal).toBeDefined();
    expect((interruptVal.value as { kind: string }).kind).toBe('plan-confirmation');

    await taskCheckpointer.deleteThread(tid);
  });
});
