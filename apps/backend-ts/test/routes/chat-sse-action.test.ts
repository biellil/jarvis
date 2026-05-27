/**
 * SSE action event tests (Plan 18-04 Task 2).
 *
 * Verifica que GET /chat/stream:
 *   - registra dispatch listener antes de começar o stream
 *   - emite `event: action\ndata: <json>\n\n` quando listener é chamado
 *   - continua emitindo tokens como `data: <token>\n\n`
 *   - limpa o listener no finally (clearDispatchListener)
 *
 * Usa um ChatSession stub com sendStream custom que dispara o listener mid-stream.
 * Não sobe LLM real.
 */
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { SessionLock } from '../../src/session/lock.js';
import type { OnToolDispatched } from '../../src/session/tool-dispatch.js';

interface StubSession {
  setDispatchListener: ReturnType<typeof vi.fn>;
  clearDispatchListener: ReturnType<typeof vi.fn>;
  sendStream: (text: string) => AsyncGenerator<string, void, unknown>;
  send: ReturnType<typeof vi.fn>;
  // Phase 82 D-04: required by chat.ts GET /chat/stream routing check
  getAwaitingConfirmation: ReturnType<typeof vi.fn>;
  agenticEnabled: boolean;
}

function makeStubSession(opts: {
  tokens: string[];
  dispatchAfter?: number; // índice após qual dispara dispatch
  dispatchEvent?: Parameters<OnToolDispatched>[0];
}): StubSession {
  let listener: OnToolDispatched | null = null;
  const setDispatchListener = vi.fn((fn: OnToolDispatched) => {
    listener = fn;
  });
  const clearDispatchListener = vi.fn(() => {
    listener = null;
  });

  async function* sendStream(_text: string): AsyncGenerator<string, void, unknown> {
    for (let i = 0; i < opts.tokens.length; i++) {
      yield opts.tokens[i]!;
      if (i === opts.dispatchAfter && opts.dispatchEvent && listener) {
        listener(opts.dispatchEvent);
      }
    }
  }

  return {
    setDispatchListener,
    clearDispatchListener,
    sendStream,
    send: vi.fn(),
    // Phase 82 D-04: returns null so tests bypass confirmation routing
    getAwaitingConfirmation: vi.fn().mockReturnValue(null),
    agenticEnabled: false,
  };
}

describe('GET /chat/stream action events (18-04)', () => {
  it('emite event: action com payload snake_case mid-stream', async () => {
    const ev = {
      toolCallId: 42,
      action: 'open_app',
      args: { app: 'firefox' },
      requiresConfirmation: false,
    };
    const session = makeStubSession({
      tokens: ['Vou ', 'abrir ', 'o ', 'firefox'],
      dispatchAfter: 1,
      dispatchEvent: ev,
    });
    const lock = new SessionLock();
    const app = createApp({ session: session as any, lock });

    const res = await request(app).get('/chat/stream?message=abre+firefox');
    expect(res.status).toBe(200);
    const body = res.text;

    // Tokens presentes
    expect(body).toContain('data: Vou \n\n');
    expect(body).toContain('data: abrir \n\n');
    expect(body).toContain('data: firefox\n\n');

    // Event action presente com payload snake_case
    expect(body).toContain('event: action\n');
    const actionMatch = body.match(/event: action\ndata: (.+)\n\n/);
    expect(actionMatch).not.toBeNull();
    const payload = JSON.parse(actionMatch![1]!);
    expect(payload).toEqual({
      tool_call_id: 42,
      action: 'open_app',
      args: { app: 'firefox' },
      requires_confirmation: false,
    });

    // Ordem: event action entre tokens (após "abrir ", antes de "o ")
    const idxAbrir = body.indexOf('data: abrir \n\n');
    const idxAction = body.indexOf('event: action');
    const idxO = body.indexOf('data: o \n\n');
    expect(idxAbrir).toBeLessThan(idxAction);
    expect(idxAction).toBeLessThan(idxO);

    // Listener registrado e limpo
    expect(session.setDispatchListener).toHaveBeenCalledOnce();
    expect(session.clearDispatchListener).toHaveBeenCalledOnce();
  });

  it('stream sem dispatch: tokens normais + clearDispatchListener no finally', async () => {
    const session = makeStubSession({ tokens: ['a', 'b', 'c'] });
    const lock = new SessionLock();
    const app = createApp({ session: session as any, lock });

    const res = await request(app).get('/chat/stream?message=oi');
    expect(res.status).toBe(200);
    expect(res.text).toContain('data: a\n\n');
    expect(res.text).toContain('data: b\n\n');
    expect(res.text).toContain('data: c\n\n');
    expect(res.text).not.toContain('event: action');
    expect(session.clearDispatchListener).toHaveBeenCalledOnce();
  });

  it('clearDispatchListener roda mesmo quando sendStream lança', async () => {
    const session: StubSession = {
      setDispatchListener: vi.fn(),
      clearDispatchListener: vi.fn(),
      send: vi.fn(),
      getAwaitingConfirmation: vi.fn().mockReturnValue(null),
      agenticEnabled: false,
      sendStream: async function* () {
        yield 'oi';
        throw new Error('boom');
      },
    };
    const lock = new SessionLock();
    const app = createApp({ session: session as any, lock });

    const res = await request(app).get('/chat/stream?message=x');
    expect(res.status).toBe(200);
    expect(res.text).toContain('data: oi\n\n');
    expect(res.text).toContain('[error] boom');
    expect(session.clearDispatchListener).toHaveBeenCalledOnce();
  });

  it('requiresConfirmation=true mapeia para requires_confirmation no wire', async () => {
    const session = makeStubSession({
      tokens: ['x'],
      dispatchAfter: 0,
      dispatchEvent: {
        toolCallId: 7,
        action: 'delete_file',
        args: { file_path: '/tmp/a' },
        requiresConfirmation: true,
      },
    });
    const lock = new SessionLock();
    const app = createApp({ session: session as any, lock });
    const res = await request(app).get('/chat/stream?message=apaga');
    const actionMatch = res.text.match(/event: action\ndata: (.+)\n\n/);
    const payload = JSON.parse(actionMatch![1]!);
    expect(payload.requires_confirmation).toBe(true);
    expect(payload.tool_call_id).toBe(7);
    expect(payload.action).toBe('delete_file');
  });
});
