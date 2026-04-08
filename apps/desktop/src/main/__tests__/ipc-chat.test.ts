/**
 * IPC Chat Handler Tests — Fase 18.5 refactor.
 *
 * Testa `handleSendText` (função pura) com `openStream` e `actionExecutor`
 * mockados. Não depende de ipcMain real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSendText, type ChatHandlerDeps } from '../ipc/chat';
import type { OpenChatStreamOpts } from '../sse-client';
import type { ActionExecutor } from '../action-executor';
import type { BackendConfig } from '../backend-client';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

function makeExecutor(): ActionExecutor & { enqueue: ReturnType<typeof vi.fn> } {
  return {
    enqueue: vi.fn(),
    shutdown: vi.fn(async () => {}),
  } as ActionExecutor & { enqueue: ReturnType<typeof vi.fn> };
}

function makeConfig(): BackendConfig {
  return { backendUrl: 'http://localhost:3000', apiKey: 'test-key' };
}

describe('handleSendText (SSE refactor)', () => {
  let executor: ReturnType<typeof makeExecutor>;
  let config: BackendConfig;

  beforeEach(() => {
    executor = makeExecutor();
    config = makeConfig();
  });

  it('concatena tokens recebidos e retorna reply final', async () => {
    const openStream = vi.fn(async (opts: OpenChatStreamOpts) => {
      opts.onToken('Olá');
      opts.onToken(', ');
      opts.onToken('JARVIS!');
      opts.onEnd();
    });

    const deps: ChatHandlerDeps = { openStream, config, actionExecutor: executor };
    const result = await handleSendText('oi', deps);

    expect(result).toEqual({
      success: true,
      data: { reply: 'Olá, JARVIS!' },
    });
    expect(openStream).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://localhost:3000/api/chat/stream',
        apiKey: 'test-key',
        message: 'oi',
      }),
    );
  });

  it('despacha eventos action pro actionExecutor.enqueue', async () => {
    const actionPayload = {
      tool_call_id: 42,
      action: 'open_app',
      args: { name: 'firefox' },
      requires_confirmation: false,
    };

    const openStream = vi.fn(async (opts: OpenChatStreamOpts) => {
      opts.onToken('abrindo');
      opts.onAction(actionPayload);
      opts.onEnd();
    });

    const deps: ChatHandlerDeps = { openStream, config, actionExecutor: executor };
    const result = await handleSendText('abre firefox', deps);

    expect(executor.enqueue).toHaveBeenCalledWith(actionPayload);
    expect(result.success).toBe(true);
    expect(result.data?.reply).toBe('abrindo');
  });

  it('retorna Result.error quando openStream rejeita', async () => {
    const openStream = vi.fn(async () => {
      throw new Error('connection refused');
    });

    const deps: ChatHandlerDeps = { openStream, config, actionExecutor: executor };
    const result = await handleSendText('oi', deps);

    expect(result.success).toBe(false);
    expect(result.error).toBe('connection refused');
  });

  it('retorna Result.error quando stream emite erro sem tokens', async () => {
    const openStream = vi.fn(async (opts: OpenChatStreamOpts) => {
      opts.onError(new Error('SSE HTTP 500'));
      opts.onEnd();
    });

    const deps: ChatHandlerDeps = { openStream, config, actionExecutor: executor };
    const result = await handleSendText('oi', deps);

    expect(result.success).toBe(false);
    expect(result.error).toBe('SSE HTTP 500');
  });

  it('timeout: AbortError vira error de timeout', async () => {
    const openStream = vi.fn(async (_opts: OpenChatStreamOpts) => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    });

    const deps: ChatHandlerDeps = { openStream, config, actionExecutor: executor };
    const result = await handleSendText('oi', deps);

    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
  });

  it('passa um AbortSignal pro openStream', async () => {
    let capturedSignal: AbortSignal | undefined;
    const openStream = vi.fn(async (opts: OpenChatStreamOpts) => {
      capturedSignal = opts.signal;
      opts.onEnd();
    });

    const deps: ChatHandlerDeps = { openStream, config, actionExecutor: executor };
    await handleSendText('oi', deps);

    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });
});
