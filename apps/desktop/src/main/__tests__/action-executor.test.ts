/**
 * Tests for action-executor (Plan 18_5-04).
 * Mocks dialog, handlers e backendClient — nada real é invocado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createActionExecutor } from '../action-executor.js';
import type { ActionHandler, ActionResult } from '../actions/types.js';

type ActionEvent = {
  tool_call_id: number;
  action: string;
  args: Record<string, unknown>;
  requires_confirmation: boolean;
};

function makeEvent(overrides: Partial<ActionEvent> = {}): ActionEvent {
  return {
    tool_call_id: 1,
    action: 'open_app',
    args: {},
    requires_confirmation: false,
    ...overrides,
  };
}

function okResult(output = 'ok'): ActionResult {
  return { success: true, output, error: null };
}
function failResult(error = 'boom'): ActionResult {
  return { success: false, output: null, error };
}

function makeDeps(partial: {
  handlers?: Record<string, ActionHandler>;
  requiresConfirmation?: Set<string>;
  showMessageBox?: (opts: unknown) => Promise<{ response: number }>;
  postToolCallResult?: (id: number, result: unknown) => Promise<void>;
  now?: () => number;
}) {
  const postToolCallResult = vi.fn(
    partial.postToolCallResult ?? (async () => {}),
  );
  const showMessageBox = vi.fn(
    partial.showMessageBox ?? (async () => ({ response: 1 })),
  );
  return {
    handlers: partial.handlers ?? {},
    requiresConfirmation: partial.requiresConfirmation ?? new Set<string>(),
    backendClient: { postToolCallResult } as unknown as {
      postToolCallResult: (id: number, r: unknown) => Promise<void>;
    },
    dialog: { showMessageBox } as unknown as {
      showMessageBox: (opts: unknown) => Promise<{ response: number }>;
    },
    now: partial.now,
    postToolCallResult,
    showMessageBox,
  };
}

describe('action-executor: dedup + FIFO queue', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('ignores duplicated tool_call_id (idempotency)', async () => {
    const handler = vi.fn<ActionHandler>(async () => okResult());
    const deps = makeDeps({ handlers: { open_app: handler } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const exec = createActionExecutor(deps);
    exec.enqueue(makeEvent({ tool_call_id: 42 }));
    exec.enqueue(makeEvent({ tool_call_id: 42 }));
    await exec.shutdown();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(deps.postToolCallResult).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });

  it('expires dedup entries after TTL (5min)', async () => {
    const handler = vi.fn<ActionHandler>(async () => okResult());
    let current = 1_000_000;
    const deps = makeDeps({
      handlers: { open_app: handler },
      now: () => current,
    });

    const exec = createActionExecutor(deps);
    exec.enqueue(makeEvent({ tool_call_id: 7 }));
    await exec.shutdown();
    expect(handler).toHaveBeenCalledTimes(1);

    // Advance clock past 5min
    current += 5 * 60 * 1000 + 1;

    exec.enqueue(makeEvent({ tool_call_id: 7 }));
    await exec.shutdown();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('processes events FIFO, never in parallel', async () => {
    const order: number[] = [];
    let active = 0;
    let maxActive = 0;
    const slow: ActionHandler = async (args) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      order.push(args.n as number);
      active--;
      return okResult();
    };
    const deps = makeDeps({ handlers: { open_app: slow } });

    const exec = createActionExecutor(deps);
    exec.enqueue(makeEvent({ tool_call_id: 1, args: { n: 1 } }));
    exec.enqueue(makeEvent({ tool_call_id: 2, args: { n: 2 } }));
    exec.enqueue(makeEvent({ tool_call_id: 3, args: { n: 3 } }));
    await exec.shutdown();

    expect(order).toEqual([1, 2, 3]);
    expect(maxActive).toBe(1);
  });
});

describe('action-executor: processEvent — confirm, dispatch, report', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('non-confirmation action: invokes handler and reports result', async () => {
    const handler = vi.fn<ActionHandler>(async () => okResult('done'));
    const deps = makeDeps({ handlers: { open_app: handler } });

    const exec = createActionExecutor(deps);
    exec.enqueue(makeEvent({ tool_call_id: 10, action: 'open_app' }));
    await exec.shutdown();

    expect(deps.showMessageBox).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledWith({});
    expect(deps.postToolCallResult).toHaveBeenCalledWith(10, okResult('done'));
  });

  it('confirmation via event flag: user approves → handler runs', async () => {
    const handler = vi.fn<ActionHandler>(async () => okResult());
    const deps = makeDeps({
      handlers: { delete_file: handler },
      showMessageBox: async () => ({ response: 1 }),
    });

    const exec = createActionExecutor(deps);
    exec.enqueue(
      makeEvent({
        tool_call_id: 11,
        action: 'delete_file',
        requires_confirmation: true,
        args: { path: '/tmp/x' },
      }),
    );
    await exec.shutdown();

    expect(deps.showMessageBox).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ path: '/tmp/x' });
    expect(deps.postToolCallResult).toHaveBeenCalledWith(11, okResult());
  });

  it('confirmation via requiresConfirmation set: user denies → user_denied', async () => {
    const handler = vi.fn<ActionHandler>(async () => okResult());
    const deps = makeDeps({
      handlers: { delete_file: handler },
      requiresConfirmation: new Set(['delete_file']),
      showMessageBox: async () => ({ response: 0 }),
    });

    const exec = createActionExecutor(deps);
    exec.enqueue(
      makeEvent({
        tool_call_id: 12,
        action: 'delete_file',
        requires_confirmation: false,
      }),
    );
    await exec.shutdown();

    expect(handler).not.toHaveBeenCalled();
    expect(deps.postToolCallResult).toHaveBeenCalledWith(12, {
      success: false,
      error: 'user_denied',
    });
  });

  it('handler returns {success:false} → reports it verbatim', async () => {
    const handler = vi.fn<ActionHandler>(async () => failResult('nope'));
    const deps = makeDeps({ handlers: { open_app: handler } });

    const exec = createActionExecutor(deps);
    exec.enqueue(makeEvent({ tool_call_id: 13 }));
    await exec.shutdown();

    expect(deps.postToolCallResult).toHaveBeenCalledWith(13, failResult('nope'));
  });

  it('handler throws → reports handler_crash', async () => {
    const handler = vi.fn<ActionHandler>(async () => {
      throw new Error('kaboom');
    });
    const deps = makeDeps({ handlers: { open_app: handler } });

    const exec = createActionExecutor(deps);
    exec.enqueue(makeEvent({ tool_call_id: 14 }));
    await exec.shutdown();

    expect(deps.postToolCallResult).toHaveBeenCalledWith(14, {
      success: false,
      error: 'handler_crash: kaboom',
    });
  });

  it('unknown action → reports unknown_action', async () => {
    const deps = makeDeps({ handlers: {} });

    const exec = createActionExecutor(deps);
    exec.enqueue(makeEvent({ tool_call_id: 15, action: 'nuke_world' }));
    await exec.shutdown();

    expect(deps.postToolCallResult).toHaveBeenCalledWith(15, {
      success: false,
      error: 'unknown_action: nuke_world',
    });
  });

  it('backendClient.postToolCallResult throws → warn, queue continues', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handler = vi.fn<ActionHandler>(async () => okResult());
    let call = 0;
    const post = vi.fn(async () => {
      call++;
      if (call === 1) throw new Error('network down');
    });
    const deps = makeDeps({
      handlers: { open_app: handler },
      postToolCallResult: post,
    });

    const exec = createActionExecutor(deps);
    exec.enqueue(makeEvent({ tool_call_id: 20 }));
    exec.enqueue(makeEvent({ tool_call_id: 21 }));
    await exec.shutdown();

    expect(handler).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();
  });
});
