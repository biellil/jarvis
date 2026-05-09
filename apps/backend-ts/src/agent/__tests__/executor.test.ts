import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIMessage } from '@langchain/core/messages';
import { Command, interrupt, isGraphInterrupt } from '@langchain/langgraph';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import {
  runExecutorNode,
  generateFinalSummary,
  extractFinalAiText,
  type ReactAgentLike,
} from '../executor.js';
import type { Plan, StepResult } from '../types.js';

// ──────────────────────────────────────────────────────────────────────────────
// Mock interrupt from @langchain/langgraph so tests can control its return value
// ──────────────────────────────────────────────────────────────────────────────
vi.mock('@langchain/langgraph', async () => {
  const actual = await vi.importActual<typeof import('@langchain/langgraph')>('@langchain/langgraph');
  return {
    ...actual,
    interrupt: vi.fn(),
  };
});

const mockInterrupt = vi.mocked(interrupt);

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeReactAgent(responseText = 'Listei 14 arquivos'): ReactAgentLike & {
  invokedWith: Array<{ messages: unknown[]; config?: unknown }>;
} {
  const invokedWith: Array<{ messages: unknown[]; config?: unknown }> = [];
  return {
    invokedWith,
    invoke: vi.fn(async (input: { messages: unknown[] }, config?: unknown) => {
      invokedWith.push({ messages: input.messages, config });
      return { messages: [new AIMessage(responseText)] };
    }) as ReactAgentLike['invoke'],
  };
}

function makeFailingAgent(errorMsg = 'Tool execution failed'): ReactAgentLike {
  return {
    invoke: vi.fn(async () => {
      throw new Error(errorMsg);
    }) as ReactAgentLike['invoke'],
  };
}

function makeConfig(overrides?: Partial<LangGraphRunnableConfig>): LangGraphRunnableConfig {
  const writer = vi.fn();
  return {
    writer,
    configurable: { thread_id: 'test-thread-id' },
    ...overrides,
  } as unknown as LangGraphRunnableConfig;
}

const twoStepPlan: Plan = {
  steps: [
    { id: 1, description: 'Listar arquivos em Downloads', expectedOutcome: '14 arquivos listados' },
    { id: 2, description: 'Mover PDFs para Documentos', expectedOutcome: '5 PDFs movidos' },
  ],
};

const oneStepPlan: Plan = {
  steps: [{ id: 1, description: 'Listar arquivos em Downloads', expectedOutcome: '14 arquivos listados' }],
};

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('runExecutorNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checks state.cancelRequested BEFORE invoking reactAgent for each step (D-13 primary lever)', async () => {
    const agent = makeReactAgent();
    const config = makeConfig();
    const result = await runExecutorNode(
      agent,
      { plan: twoStepPlan, stepResults: [], cancelRequested: true },
      config,
    );
    // No steps should have been invoked
    expect(agent.invoke).not.toHaveBeenCalled();
    // task:cancelled emitted with atStep = 1 (first pending step)
    const writer = config.writer as ReturnType<typeof vi.fn>;
    const cancelledEvent = writer.mock.calls.find(
      ([ev]) => (ev as { kind: string }).kind === 'task:cancelled',
    );
    expect(cancelledEvent).toBeDefined();
    expect((cancelledEvent![0] as { atStep: number }).atStep).toBe(1);
    // stepResults returned should be empty
    expect((result as { stepResults: StepResult[] }).stepResults).toHaveLength(0);
  });

  it('emits task:step:start before reactAgent.invoke and task:step:end after', async () => {
    const agent = makeReactAgent('Listei 14 arquivos');
    const config = makeConfig();
    const callOrder: string[] = [];

    const writer = config.writer as ReturnType<typeof vi.fn>;
    writer.mockImplementation((ev: { kind: string }) => {
      callOrder.push(ev.kind);
    });
    (agent.invoke as ReturnType<typeof vi.fn>).mockImplementation(async (input: unknown) => {
      callOrder.push('invoke');
      return { messages: [new AIMessage('Listei 14 arquivos')] };
    });

    await runExecutorNode(agent, { plan: oneStepPlan, stepResults: [], cancelRequested: false }, config);

    // Verify order: start → invoke → end → done
    const startIdx = callOrder.indexOf('task:step:start');
    const invokeIdx = callOrder.indexOf('invoke');
    const endIdx = callOrder.indexOf('task:step:end');
    const doneIdx = callOrder.indexOf('task:done');
    expect(startIdx).toBeLessThan(invokeIdx);
    expect(invokeIdx).toBeLessThan(endIdx);
    expect(endIdx).toBeLessThan(doneIdx);
  });

  it('threads config.signal through reactAgent.invoke({messages}, {signal: config.signal, configurable})', async () => {
    const agent = makeReactAgent();
    const controller = new AbortController();
    const config = makeConfig({ signal: controller.signal } as unknown as Partial<LangGraphRunnableConfig>);

    await runExecutorNode(agent, { plan: oneStepPlan, stepResults: [], cancelRequested: false }, config);

    // First call is the step execution — verify signal and configurable were passed
    // (subsequent calls are generateFinalSummary which reuses the same agent)
    const stepInvocations = (agent.invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([input]) => (input as { messages: unknown[] }).messages.length === 1 &&
        (input as { messages: { lc_kwargs?: { content?: string } }[] }).messages[0]?.lc_kwargs?.content?.includes('Passo'),
    );
    expect(stepInvocations.length).toBeGreaterThanOrEqual(1);
    const [, invokedConfig] = stepInvocations[0];
    expect(invokedConfig).toMatchObject({
      signal: controller.signal,
      configurable: expect.objectContaining({ stepId: 1 }),
    });
  });

  it('AbortSignal aborted before any step → emits task:cancelled with atStep = first pending step', async () => {
    const agent = makeReactAgent();
    const controller = new AbortController();
    controller.abort();
    const config = makeConfig({ signal: controller.signal } as unknown as Partial<LangGraphRunnableConfig>);

    await runExecutorNode(agent, { plan: twoStepPlan, stepResults: [], cancelRequested: false }, config);

    expect(agent.invoke).not.toHaveBeenCalled();
    const writer = config.writer as ReturnType<typeof vi.fn>;
    const cancelledEvent = writer.mock.calls.find(([ev]) => (ev as { kind: string }).kind === 'task:cancelled');
    expect(cancelledEvent).toBeDefined();
    expect((cancelledEvent![0] as { atStep: number }).atStep).toBe(1);
  });

  it('on tool error, calls interrupt({kind:"step-failure", stepId, error}) — does NOT swallow', async () => {
    // Mock interrupt to return a decision (we spy to verify it was called)
    mockInterrupt.mockReturnValueOnce({ kind: 'abort' } as unknown as never);

    const agent = makeFailingAgent('Tool execution failed');
    const config = makeConfig();

    await runExecutorNode(agent, { plan: oneStepPlan, stepResults: [], cancelRequested: false }, config);

    expect(mockInterrupt).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'step-failure', stepId: 1, error: 'Tool execution failed' }),
    );
  });

  it('decision.kind === "continue" appends StepResult{status:"skipped"} and continues to next step', async () => {
    // Step 1 fails → interrupt returns 'continue' → step 2 succeeds
    mockInterrupt.mockReturnValueOnce({ kind: 'continue' } as unknown as never);

    const step2Agent = {
      invokeCount: 0,
      invoke: vi.fn(async () => {
        return { messages: [new AIMessage('Movi 5 PDFs')] };
      }) as ReactAgentLike['invoke'],
    };

    // Step 1 fails, step 2 succeeds
    let callCount = 0;
    const mixedAgent: ReactAgentLike = {
      invoke: vi.fn(async (input, cfg) => {
        callCount++;
        if (callCount === 1) throw new Error('Step 1 failed');
        return { messages: [new AIMessage('Movi 5 PDFs')] };
      }) as ReactAgentLike['invoke'],
    };

    const config = makeConfig();
    const result = await runExecutorNode(
      mixedAgent,
      { plan: twoStepPlan, stepResults: [], cancelRequested: false },
      config,
    );

    const results = (result as { stepResults: StepResult[] }).stepResults;
    // Step 1 should be skipped, step 2 should be success
    const step1 = results.find((r) => r.stepId === 1);
    const step2 = results.find((r) => r.stepId === 2);
    expect(step1?.status).toBe('skipped');
    expect(step2?.status).toBe('success');

    // Verify invoke was called 3 times: step 1 (throw) + step 2 (success) + generateFinalSummary
    expect(mixedAgent.invoke).toHaveBeenCalledTimes(3);
  });

  it('decision.kind === "replan" returns Command({goto:"planner", update:{editFeedback, lastError}})', async () => {
    mockInterrupt.mockReturnValueOnce({ kind: 'replan' } as unknown as never);

    const agent = makeFailingAgent('Database connection failed');
    const config = makeConfig();

    const result = await runExecutorNode(
      agent,
      { plan: oneStepPlan, stepResults: [], cancelRequested: false },
      config,
    );

    expect(result).toBeInstanceOf(Command);
    const cmd = result as Command;
    // LangGraph 1.2.8 normalizes goto to array internally — accept both forms
    const gotoVal = Array.isArray(cmd.goto) ? cmd.goto[0] : cmd.goto;
    expect(gotoVal).toBe('planner');
    expect(cmd.update).toMatchObject({
      editFeedback: expect.stringContaining('Database connection failed'),
      lastError: { stepId: 1, message: 'Database connection failed' },
    });
  });

  it('decision.kind === "abort" emits task:error and returns terminal state', async () => {
    mockInterrupt.mockReturnValueOnce({ kind: 'abort' } as unknown as never);

    const agent = makeFailingAgent('Critical tool error');
    const config = makeConfig();

    const result = await runExecutorNode(
      agent,
      { plan: oneStepPlan, stepResults: [], cancelRequested: false },
      config,
    );

    const writer = config.writer as ReturnType<typeof vi.fn>;
    const errorEvent = writer.mock.calls.find(([ev]) => (ev as { kind: string }).kind === 'task:error');
    expect(errorEvent).toBeDefined();
    expect((errorEvent![0] as { atStep: number; message: string }).atStep).toBe(1);
    expect((errorEvent![0] as { atStep: number; message: string }).message).toBe('Critical tool error');

    // result is Partial<ExecutorState> — no steps in stepResults
    const res = result as { stepResults: StepResult[] };
    expect(res.stepResults).toHaveLength(0);
  });

  it('after all steps succeed, emits task:done with summary from generateFinalSummary', async () => {
    const agent = makeReactAgent('Listei 14 arquivos');
    const config = makeConfig();

    await runExecutorNode(agent, { plan: oneStepPlan, stepResults: [], cancelRequested: false }, config);

    const writer = config.writer as ReturnType<typeof vi.fn>;
    const doneEvent = writer.mock.calls.find(([ev]) => (ev as { kind: string }).kind === 'task:done');
    expect(doneEvent).toBeDefined();
    expect((doneEvent![0] as { summary: string }).summary).toBeTruthy();
    expect(typeof (doneEvent![0] as { summary: string }).summary).toBe('string');
  });

  it('outputSummary is sliced to ≤80 chars (D-11 hard cap)', async () => {
    const longText = 'A'.repeat(200);
    const agent = makeReactAgent(longText);
    const config = makeConfig();

    const result = await runExecutorNode(
      agent,
      { plan: oneStepPlan, stepResults: [], cancelRequested: false },
      config,
    );

    const writer = config.writer as ReturnType<typeof vi.fn>;
    const stepEndEvent = writer.mock.calls.find(
      ([ev]) => (ev as { kind: string }).kind === 'task:step:end',
    );
    expect(stepEndEvent).toBeDefined();
    const summary = (stepEndEvent![0] as { summary: string }).summary;
    expect(summary.length).toBeLessThanOrEqual(80);
  });
});

describe('extractFinalAiText', () => {
  it('returns last AIMessage content as string', () => {
    const messages = [
      new AIMessage('primeira mensagem'),
      new AIMessage('última mensagem'),
    ];
    expect(extractFinalAiText(messages)).toBe('última mensagem');
  });

  it('returns empty string when no AIMessage exists', () => {
    expect(extractFinalAiText([])).toBe('');
  });
});
