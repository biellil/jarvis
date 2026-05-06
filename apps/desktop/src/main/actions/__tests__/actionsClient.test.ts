/**
 * actionsClient.test.ts — Phase 54 (LACT-09)
 *
 * Tests for the WebSocket client that bridges gateway action_request messages
 * to the Electron renderer via IPC, with exponential backoff reconnect.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// --- Hoist hoisted variables so vi.mock factories can reference them ---
const { fakeWsFactory, getFakeLastInstance, resetFakeWs } = vi.hoisted(() => {
  // Minimal EventEmitter implemented inline to avoid import issues inside vi.hoisted
  type Listener = (...args: unknown[]) => void;

  class MinimalEmitter {
    private _listeners: Record<string, Listener[]> = {};

    on(event: string, listener: Listener): this {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event]!.push(listener);
      return this;
    }

    emit(event: string, ...args: unknown[]): void {
      const listeners = this._listeners[event] ?? [];
      listeners.forEach((l) => l(...args));
    }
  }

  class FakeWebSocket extends MinimalEmitter {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState: number = FakeWebSocket.CONNECTING;
    url: string;
    send = vi.fn();
    close = vi.fn(() => { this.readyState = FakeWebSocket.CLOSED; });

    private static _last: FakeWebSocket | null = null;

    constructor(url: string) {
      super();
      this.url = url;
      FakeWebSocket._last = this;
    }

    static getLast() { return FakeWebSocket._last; }
    static reset() { FakeWebSocket._last = null; }
  }

  return {
    fakeWsFactory: FakeWebSocket,
    getFakeLastInstance: () => FakeWebSocket.getLast(),
    resetFakeWs: () => FakeWebSocket.reset(),
  };
});

// --- Mocks ---
vi.mock('ws', () => ({
  default: fakeWsFactory,
}));

const mockSend = vi.fn();
const mockWin = {
  isDestroyed: () => false,
  webContents: { send: mockSend },
};

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [mockWin]),
  },
}));

vi.mock('../../store.js', () => ({
  getOrCreateClientId: vi.fn(() => 'test-client-uuid'),
}));

vi.mock('../../../shared/ipc-types.js', () => ({
  IPC_CHANNELS: {
    ACTION_REQUEST: 'actions:request',
    ACTION_ACK: 'actions:ack',
  },
}));

// --- Imports after mocks ---
import { startActionsClient, stopActionsClient, sendActionAck } from '../actionsClient.js';
import { BrowserWindow } from 'electron';

describe('actionsClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetFakeWs();
    mockSend.mockClear();
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue(
      [mockWin] as unknown as ReturnType<typeof BrowserWindow.getAllWindows>,
    );
  });

  afterEach(() => {
    stopActionsClient();
    vi.useRealTimers();
  });

  it('startActionsClient() connects WS to correct URL', () => {
    startActionsClient();

    const instance = getFakeLastInstance();
    expect(instance).not.toBeNull();
    expect(instance!.url).toBe(
      'ws://localhost:3000/api/actions?clientId=test-client-uuid',
    );
  });

  it('incoming action_request broadcasts to renderer via ACTION_REQUEST IPC channel', () => {
    startActionsClient();
    const fakeWs = getFakeLastInstance()!;

    fakeWs.readyState = fakeWsFactory.OPEN;
    fakeWs.emit(
      'message',
      JSON.stringify({
        type: 'action_request',
        requestId: 'req-001',
        action: 'openFile',
        path: '/home/user/doc.txt',
        model: 'gpt-4',
      }),
    );

    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend).toHaveBeenCalledWith('actions:request', {
      requestId: 'req-001',
      action: 'openFile',
      path: '/home/user/doc.txt',
      model: 'gpt-4',
    });
  });

  it('malformed JSON message: no crash, no IPC send', () => {
    startActionsClient();
    const fakeWs = getFakeLastInstance()!;

    fakeWs.emit('message', 'not valid json {{{{');

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('action_request with missing required fields: warn logged, no IPC send', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    startActionsClient();
    const fakeWs = getFakeLastInstance()!;

    fakeWs.emit(
      'message',
      JSON.stringify({
        type: 'action_request',
        requestId: 'req-002',
        // missing action, path, model
      }),
    );

    expect(mockSend).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('action_request missing required fields'),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it('WS close: reconnect scheduled after base reconnectDelayMs (1000ms)', () => {
    startActionsClient();
    const fakeWs = getFakeLastInstance()!;

    // Simulate open to reset backoff to 1000ms base
    fakeWs.emit('open');
    resetFakeWs(); // clear lastInstance so we can detect reconnect

    // Simulate close
    fakeWs.emit('close');
    expect(getFakeLastInstance()).toBeNull(); // no immediate reconnect

    // Wait for reconnect timer (1000ms base)
    vi.advanceTimersByTime(1001);
    expect(getFakeLastInstance()).not.toBeNull();
  });

  it('sendActionAck sends correctly formatted message when WS is open', () => {
    startActionsClient();
    const fakeWs = getFakeLastInstance()!;
    fakeWs.readyState = fakeWsFactory.OPEN;

    sendActionAck('req-123', 'confirmed');

    expect(fakeWs.send).toHaveBeenCalledOnce();
    expect(fakeWs.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'action_ack', requestId: 'req-123', status: 'confirmed' }),
    );
  });

  it('sendActionAck when WS is closed: console.warn, no throw', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    startActionsClient();
    const fakeWs = getFakeLastInstance()!;
    fakeWs.readyState = fakeWsFactory.CLOSED;

    expect(() => sendActionAck('req-999', 'denied')).not.toThrow();
    expect(fakeWs.send).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cannot send ACK'),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it('message with wrong type: warn logged, no IPC send', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    startActionsClient();
    const fakeWs = getFakeLastInstance()!;

    fakeWs.emit('message', JSON.stringify({ type: 'unknown_type', data: 'something' }));

    expect(mockSend).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unexpected message type'),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it('reconnect delay doubles on second disconnect (exponential backoff)', () => {
    startActionsClient();
    let fakeWs = getFakeLastInstance()!;
    fakeWs.emit('open'); // reset delay to 1000ms base
    resetFakeWs();
    fakeWs.emit('close');

    // First reconnect at 1000ms
    vi.advanceTimersByTime(1001);
    fakeWs = getFakeLastInstance()!;
    expect(fakeWs).not.toBeNull();

    // Second close: delay doubles to 2000ms
    resetFakeWs();
    fakeWs.emit('close');

    // Should NOT reconnect after only 1001ms (need 2000ms)
    vi.advanceTimersByTime(1001);
    expect(getFakeLastInstance()).toBeNull();

    // Advance remaining ~1000ms to reach 2000ms total
    vi.advanceTimersByTime(1001);
    expect(getFakeLastInstance()).not.toBeNull();
  });

  it('stopActionsClient() closes WS and prevents reconnect', () => {
    startActionsClient();
    const fakeWs = getFakeLastInstance()!;
    fakeWs.emit('open');

    stopActionsClient();

    expect(fakeWs.close).toHaveBeenCalled();

    // Even if close fires, no new reconnect should happen
    resetFakeWs();
    fakeWs.emit('close');
    vi.advanceTimersByTime(5000);
    expect(getFakeLastInstance()).toBeNull();
  });
});
