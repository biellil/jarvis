/**
 * Testes do parser SSE + openChatStream (plano 18_5-01).
 * fetch é injetado via opts.fetchImpl — sem vi.mock de módulos nativos.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseFrame,
  splitBuffer,
  computeBackoffMs,
  openChatStream,
  type SseAction,
} from '../sse-client.js';

describe('parseFrame', () => {
  it('parses token frame (sem event:)', () => {
    expect(parseFrame('data: hello')).toEqual({ type: 'token', data: 'hello' });
  });

  it('parses action event with JSON payload', () => {
    const payload = {
      tool_call_id: 7,
      action: 'open_app',
      args: { app: 'firefox' },
      requires_confirmation: false,
    };
    const raw = `event: action\ndata: ${JSON.stringify(payload)}`;
    expect(parseFrame(raw)).toEqual({ type: 'action', payload });
  });

  it('returns null and warns on invalid JSON in action', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseFrame('event: action\ndata: {not-json')).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('joins multi-line data', () => {
    expect(parseFrame('data: line1\ndata: line2')).toEqual({
      type: 'token',
      data: 'line1\nline2',
    });
  });

  it('empty frame → null', () => {
    expect(parseFrame('')).toBeNull();
  });
});

describe('splitBuffer', () => {
  it('splits two complete frames and keeps rest', () => {
    const buf = 'data: a\n\ndata: b\n\ndata: par';
    const { frames, rest } = splitBuffer(buf);
    expect(frames).toEqual(['data: a', 'data: b']);
    expect(rest).toBe('data: par');
  });

  it('no complete frames → empty frames + full rest', () => {
    const { frames, rest } = splitBuffer('data: incompl');
    expect(frames).toEqual([]);
    expect(rest).toBe('data: incompl');
  });
});

describe('computeBackoffMs', () => {
  it('follows [1000,2000,4000,8000,16000,30000,30000]', () => {
    expect(computeBackoffMs(0)).toBe(1000);
    expect(computeBackoffMs(1)).toBe(2000);
    expect(computeBackoffMs(2)).toBe(4000);
    expect(computeBackoffMs(3)).toBe(8000);
    expect(computeBackoffMs(4)).toBe(16000);
    expect(computeBackoffMs(5)).toBe(30000);
    expect(computeBackoffMs(10)).toBe(30000);
  });
});

/** Helper: builds a ReadableStream that emits the given string chunks. */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(enc.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
}

function mockResponse(chunks: string[], status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: streamOf(chunks),
  } as unknown as Response;
}

describe('openChatStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits tokens and actions in order', async () => {
    const payload = {
      tool_call_id: 1,
      action: 'open_app',
      args: { app: 'firefox' },
      requires_confirmation: false,
    };
    const chunks = [
      'data: hel',
      'lo\n\n',
      `event: action\ndata: ${JSON.stringify(payload)}\n\n`,
      'data: world\n\n',
    ];
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse(chunks));
    const tokens: string[] = [];
    const actions: SseAction['payload'][] = [];
    const ctrl = new AbortController();

    const p = openChatStream({
      url: 'http://x/chat/stream',
      apiKey: 'k',
      message: 'oi',
      onToken: (t) => {
        tokens.push(t);
        if (tokens.length === 2) ctrl.abort();
      },
      onAction: (a) => actions.push(a),
      onEnd: () => {},
      onError: () => {},
      signal: ctrl.signal,
      fetchImpl,
    });

    // Let microtasks resolve fetch + reads
    await vi.runAllTimersAsync();
    await p;

    expect(fetchImpl).toHaveBeenCalled();
    const callArgs = fetchImpl.mock.calls[0];
    expect(callArgs[0]).toContain('message=oi');
    expect(callArgs[1].headers.Authorization).toBe('Bearer k');
    expect(tokens).toEqual(['hello', 'world']);
    expect(actions).toEqual([payload]);
  });

  it('reconnects after stream ends with backoff', async () => {
    const first = mockResponse([]); // closes immediately, no data
    const second = mockResponse(['data: x\n\n']);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const tokens: string[] = [];
    const ctrl = new AbortController();

    const p = openChatStream({
      url: 'http://x/chat/stream',
      apiKey: 'k',
      message: 'oi',
      onToken: (t) => {
        tokens.push(t);
        ctrl.abort();
      },
      onAction: () => {},
      onEnd: () => {},
      onError: () => {},
      signal: ctrl.signal,
      fetchImpl,
    });

    await vi.advanceTimersByTimeAsync(1500);
    await vi.runAllTimersAsync();
    await p;

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(tokens).toEqual(['x']);
  });

  it('does not retry on 401 — calls onError + onEnd', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse([], 401));
    const onError = vi.fn();
    const onEnd = vi.fn();
    const ctrl = new AbortController();

    const p = openChatStream({
      url: 'http://x',
      apiKey: 'k',
      message: 'oi',
      onToken: () => {},
      onAction: () => {},
      onEnd,
      onError,
      signal: ctrl.signal,
      fetchImpl,
    });

    await vi.runAllTimersAsync();
    await p;

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalled();
  });

  it('aborts cleanly when signal is already aborted', async () => {
    const fetchImpl = vi.fn();
    const ctrl = new AbortController();
    ctrl.abort();

    const p = openChatStream({
      url: 'http://x',
      apiKey: 'k',
      message: 'oi',
      onToken: () => {},
      onAction: () => {},
      onEnd: () => {},
      onError: () => {},
      signal: ctrl.signal,
      fetchImpl,
    });

    await vi.runAllTimersAsync();
    await p;
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('retries on 5xx with backoff', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse([], 503))
      .mockResolvedValueOnce(mockResponse(['data: ok\n\n']));
    const tokens: string[] = [];
    const ctrl = new AbortController();

    const p = openChatStream({
      url: 'http://x',
      apiKey: 'k',
      message: 'oi',
      onToken: (t) => {
        tokens.push(t);
        ctrl.abort();
      },
      onAction: () => {},
      onEnd: () => {},
      onError: () => {},
      signal: ctrl.signal,
      fetchImpl,
    });

    await vi.advanceTimersByTimeAsync(1500);
    await vi.runAllTimersAsync();
    await p;

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(tokens).toEqual(['ok']);
  });
});
