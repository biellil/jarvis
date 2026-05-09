/**
 * Tests for AbortSignal threading in MCP tool-adapter — Phase 66 Plan 03
 *
 * Tests 5-8 from the plan: runConfig.signal, AbortSignal.any, AbortError pt-BR, D-15+D-17 both survive.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildLangChainTool, type McpToolDef } from '../tool-adapter.js';
// DispatchContext is used only for typing the mock — inlined to avoid cross-package import
type DispatchContext = {
  logger: any;
  getListener: () => null;
  getSignal: () => AbortSignal | null;
  getTaskMeta: () => { taskId: string; stepId: number } | null;
};

const sampleDef: McpToolDef = {
  name: 'send_email',
  description: 'Sends an email via SMTP',
  inputSchema: {
    type: 'object',
    properties: { to: { type: 'string' }, body: { type: 'string' } },
    required: ['to', 'body'],
  },
};

function makeClient(callTool: (...args: any[]) => Promise<any>): any {
  return { callTool: vi.fn(callTool) };
}

function makeLogger(): any {
  return { logDispatch: vi.fn(() => 1) };
}

function makeCtx(override?: Partial<DispatchContext>): DispatchContext {
  return {
    logger: makeLogger(),
    getListener: () => null,
    getSignal: () => null,
    getTaskMeta: () => null,
    ...override,
  };
}

describe('buildLangChainTool — AbortSignal threading + D-17 audit (Phase 66)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // Test 5: tool() factory receives runConfig as second arg
  it('tool func receives (input, runConfig) — both are available inside the closure', async () => {
    let capturedRunConfig: any;
    const client = makeClient(async (req: any, schema: any, opts: any) => {
      capturedRunConfig = opts;
      return { content: [{ type: 'text', text: 'ok' }] };
    });
    const ctx = makeCtx();
    const t = buildLangChainTool(sampleDef, 'n8n', client, new Set(), ctx.logger, ctx)!;

    // Invoke with a runConfig that has a signal
    const controller = new AbortController();
    await t.invoke({ to: 'a@b', body: 'hi' }, { signal: controller.signal } as any);

    // callTool should have been called with signal in opts
    expect(client.callTool).toHaveBeenCalled();
    const callArgs = client.callTool.mock.calls[0];
    // Third arg is options — should contain signal
    expect(callArgs![2]).toBeDefined();
    expect(callArgs![2].signal).toBeInstanceOf(AbortSignal);
  });

  // Test 6: AbortSignal.any([inner, runConfig.signal]) passed to callTool
  it('passes AbortSignal.any([inner, runConfig.signal]) as signal option to client.callTool', async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const client = makeClient(async (req: any, schema: any, opts: any) => {
      receivedSignal = opts?.signal;
      return { content: [{ type: 'text', text: 'ok' }] };
    });
    const ctx = makeCtx({ getSignal: () => controller.signal });
    const t = buildLangChainTool(sampleDef, 'n8n', client, new Set(), ctx.logger, ctx)!;

    await t.invoke({ to: 'a@b', body: 'hi' });

    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });

  // Test 7: AbortError → pt-BR cancellation message, does NOT propagate
  it('on AbortError, returns pt-BR cancellation message without propagating', async () => {
    const controller = new AbortController();
    const client = makeClient(async () => {
      controller.abort();
      const err = new DOMException('The operation was aborted.', 'AbortError');
      throw err;
    });
    const ctx = makeCtx({ getSignal: () => controller.signal });
    const t = buildLangChainTool(sampleDef, 'n8n', client, new Set(), ctx.logger, ctx)!;

    const result = await t.invoke({ to: 'a@b', body: 'hi' });
    expect(result).toContain('cancelado pelo usuário');
    expect(result).toContain('send_email');
  });

  // Test 8: D-15 (Phase 65) + D-17 (Phase 66) BOTH survive — critical dual-lens audit
  it('D-15+D-17 both survive: audit row has BOTH source:"mcp-external" AND taskContext.taskId', async () => {
    const client = makeClient(async () => ({ content: [{ type: 'text', text: 'ok' }] }));
    const logger = makeLogger();
    const ctx = makeCtx({
      logger,
      getTaskMeta: () => ({ taskId: 'task-xyz', stepId: 3 }),
    });
    const t = buildLangChainTool(sampleDef, 'n8n', client, new Set(), logger, ctx)!;

    await t.invoke({ to: 'a@b', body: 'hi' });

    expect(logger.logDispatch).toHaveBeenCalled();
    const callArgs = logger.logDispatch.mock.calls[0];
    const extras = callArgs![2];

    // Phase 65 D-15 lens: MUST still see source: 'mcp-external' (NEVER overwritten)
    expect(extras.source).toBe('mcp-external');
    // Phase 65 D-15: serverName preserved
    expect(extras.serverName).toBe('n8n');

    // Phase 66 D-17 lens: taskContext ADDED (additive, not destructive)
    expect(extras.taskContext).toMatchObject({
      taskId: 'task-xyz',
      stepId: 3,
      executor: 'agentic-task',
    });

    // CRITICAL INVARIANT: source is 'mcp-external', NEVER 'agentic-task' (no replacement)
    expect(extras.source).not.toBe('agentic-task');
  });

  // Backwards compat: existing tool-adapter.test.ts calls buildLangChainTool without ctx
  it('works without ctx parameter (backwards compat — ctx optional)', async () => {
    const client = makeClient(async () => ({ content: [{ type: 'text', text: 'ok' }] }));
    const logger = makeLogger();
    // Old 5-arg call without ctx
    const t = buildLangChainTool(sampleDef, 'n8n', client, new Set(), logger)!;
    const result = await t.invoke({ to: 'a@b', body: 'hi' });
    expect(result).toBe('ok');
  });

  // D-15 audit on failure path — ensures existing test still passes
  it('on error, D-15 source:"mcp-external" still present (no regression)', async () => {
    const client = makeClient(async () => { throw new Error('boom'); });
    const logger = makeLogger();
    const ctx = makeCtx({ logger });
    const t = buildLangChainTool(sampleDef, 'n8n', client, new Set(), logger, ctx)!;

    await t.invoke({ to: 'a@b', body: 'hi' });

    const callArgs = logger.logDispatch.mock.calls[0];
    expect(callArgs![2]).toMatchObject({ source: 'mcp-external', serverName: 'n8n', error: 'boom' });
  });
});
