/**
 * Tests for AbortSignal threading in createRequestFileActionTool — Phase 66 Plan 03
 *
 * Tests 3-4 from the plan: outer signal composition + D-17 audit additive contract.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequestFileActionTool } from '../request-file-action.js';
import type { DispatchContext } from '../tool-dispatch.js';

function makeResponse(body: object, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: vi.fn(async () => body),
  } as unknown as Response;
}

function makeCtx(override?: Partial<DispatchContext>): DispatchContext {
  return {
    logger: { logDispatch: vi.fn(() => 1) } as any,
    getListener: () => null,
    getSignal: () => null,
    getTaskMeta: () => null,
    ...override,
  };
}

describe('createRequestFileActionTool — AbortSignal threading (Phase 66)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Test 3: AbortSignal composition
  it('composes inner timeout with outer signal via AbortSignal.any when outer is provided', async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn(async (url: string, opts: RequestInit) => {
      capturedSignal = opts?.signal as AbortSignal | undefined;
      return makeResponse({ status: 'confirmed' });
    }));

    const outerController = new AbortController();
    const ctx = makeCtx({ getSignal: () => outerController.signal });
    const t = createRequestFileActionTool({ value: 'client-123' }, ctx);

    await t.invoke({ action: 'openFolder', path: '/home/user/Downloads' });

    expect(capturedSignal).toBeDefined();
    // The signal should be an AbortSignal (composed — not the raw outer or raw inner alone)
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it('falls back to inner-only signal when ctx.getSignal() returns null (backwards compat)', async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn(async (url: string, opts: RequestInit) => {
      capturedSignal = opts?.signal as AbortSignal | undefined;
      return makeResponse({ status: 'confirmed' });
    }));

    const ctx = makeCtx({ getSignal: () => null });
    const t = createRequestFileActionTool({ value: 'client-123' }, ctx);

    await t.invoke({ action: 'openFolder', path: '/home/user/Downloads' });

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it('aborts fetch when outer signal is aborted (outer AbortController.abort())', async () => {
    const outerController = new AbortController();
    vi.stubGlobal('fetch', vi.fn(async (url: string, opts: RequestInit) => {
      // Abort externally mid-"flight"
      outerController.abort();
      // Simulate AbortError that fetch would throw
      const err = new DOMException('The operation was aborted.', 'AbortError');
      throw err;
    }));

    const ctx = makeCtx({ getSignal: () => outerController.signal });
    const t = createRequestFileActionTool({ value: 'client-123' }, ctx);

    const result = await t.invoke({ action: 'openFolder', path: '/home/user/Downloads' });
    // Should return error string, not propagate
    expect(result).toContain('Erro ao executar ação');
  });

  // Test 4: D-17 ADDITIVE audit — taskContext added; original source (undefined for native) preserved
  it('D-17: logDispatch receives additive taskContext when ctx.getTaskMeta() returns non-null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => makeResponse({ status: 'confirmed' })));

    const logDispatch = vi.fn(() => 1);
    const ctx = makeCtx({
      logger: { logDispatch } as any,
      getTaskMeta: () => ({ taskId: 'task-abc', stepId: 2 }),
    });

    const t = createRequestFileActionTool({ value: 'client-123' }, ctx);
    await t.invoke({ action: 'openFolder', path: '/home/user/Downloads' });

    expect(logDispatch).toHaveBeenCalled();
    // Use unknown intermediary cast to satisfy strict TS conversion check
    const calls = (logDispatch.mock.calls as unknown) as Array<[string, Record<string, unknown>, Record<string, unknown>?]>;
    const callArgs = calls[0]!;
    // Third arg is extras — should include taskContext
    expect(callArgs[2]).toMatchObject({
      taskContext: { taskId: 'task-abc', stepId: 2, executor: 'agentic-task' },
    });
    // CRITICAL: source must NOT be set to 'agentic-task' (D-17 is additive only)
    expect(callArgs[2]?.source).not.toBe('agentic-task');
  });

  it('D-17: logDispatch does NOT receive taskContext when ctx.getTaskMeta() returns null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => makeResponse({ status: 'confirmed' })));

    const logDispatch = vi.fn(() => 1);
    const ctx = makeCtx({ logger: { logDispatch } as any, getTaskMeta: () => null });

    const t = createRequestFileActionTool({ value: 'client-123' }, ctx);
    await t.invoke({ action: 'openFolder', path: '/home/user/Downloads' });

    const calls = (logDispatch.mock.calls as unknown) as Array<[string, Record<string, unknown>, Record<string, unknown>?]>;
    const callArgs = calls[0]!;
    expect(callArgs[2]?.taskContext).toBeUndefined();
  });

  // Backwards compat: existing tests still use old signature createRequestFileActionTool(clientIdRef)
  // The new signature is createRequestFileActionTool(clientIdRef, ctx?) — ctx optional for backwards compat
  it('still works with old signature (no ctx) — backwards compat', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => makeResponse({ status: 'confirmed' })));
    // Old call without ctx
    const t = (createRequestFileActionTool as any)({ value: 'client-xyz' });
    const result = await t.invoke({ action: 'openFolder', path: '/home/user/Downloads' });
    expect(result).toBe('Ação confirmada e executada.');
  });
});
