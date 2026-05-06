/**
 * Action Dispatcher Tests
 * Tests for sendActionRequest — gateway→Electron orchestration
 * Covers: valid dispatch, user deny, invalid path, missing client, timeout, cleanup
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import os from 'os';
import path from 'path';
import WebSocket from 'ws';

// Mock audit-logger BEFORE importing action-dispatcher
vi.mock('../lib/audit-logger.js', () => ({
  logActionToBackend: vi.fn().mockResolvedValue(undefined),
}));

import { sendActionRequest } from '../lib/action-dispatcher.js';
import { clientConnections, pendingAckResolvers, setupWebSocketServer } from '../lib/ws-server.js';
import { logActionToBackend } from '../lib/audit-logger.js';

// Helper: wait for a condition with polling (copied from ws-actions.test.ts)
function waitFor(fn: () => boolean, timeout = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (fn()) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > timeout) {
        clearInterval(interval);
        reject(new Error('waitFor timed out'));
      }
    }, 10);
  });
}

// Helper: connect a WS client and wait for it to appear in clientConnections
function connectClient(port: number, clientId: string): Promise<WebSocket> {
  const url = `ws://localhost:${port}/api/actions?clientId=${clientId}`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
    setTimeout(() => reject(new Error('Connection timed out')), 2000);
  });
}

// Valid path in the whitelist (cross-platform)
const VALID_PATH = path.join(os.homedir(), 'Downloads', 'test-folder');

describe('sendActionRequest', () => {
  let server: http.Server;
  let port: number;
  const mockLogAction = logActionToBackend as ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    clientConnections.clear();
    pendingAckResolvers.clear();
    mockLogAction.mockClear();

    server = http.createServer();
    setupWebSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
    port = (server.address() as { port: number }).port;
  });

  afterEach(async () => {
    // Restore real timers if fake were used
    vi.useRealTimers();

    // Terminate all active connections
    for (const ws of clientConnections.values()) {
      ws.terminate();
    }
    clientConnections.clear();
    pendingAckResolvers.clear();

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('Scenario 1 — valid path + connected client → sends WS + logs approved', async () => {
    const clientId = 'e2e-client-001';
    const electronWs = await connectClient(port, clientId);

    // Wait for server-side Map to register
    await waitFor(() => clientConnections.has(clientId));

    // Wire Electron fake: receive action_request → reply with ACK confirmed
    electronWs.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      electronWs.send(JSON.stringify({
        type: 'action_ack',
        requestId: msg.requestId,
        status: 'confirmed',
      }));
    });

    const result = await sendActionRequest({
      clientId,
      action: 'openFolder',
      path: VALID_PATH,
      model: 'test-model',
    });

    expect(result).toBe('confirmed');

    // logActionToBackend called once with result='approved' (confirmed→approved mapping)
    expect(mockLogAction).toHaveBeenCalledTimes(1);
    const logCall = mockLogAction.mock.calls[0][0];
    expect(logCall.result).toBe('approved');
    expect(logCall.path).toBe(VALID_PATH);
    expect(logCall.action).toBe('openFolder');
    expect(logCall.model).toBe('test-model');
    expect(logCall.clientId).toBe(clientId);
    expect(logCall.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );

    electronWs.close();
  });

  it('Scenario 2 — valid path + connected client, user denies → logs denied', async () => {
    const clientId = 'e2e-client-002';
    const electronWs = await connectClient(port, clientId);

    await waitFor(() => clientConnections.has(clientId));

    // Wire Electron fake: reply with denied
    electronWs.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      electronWs.send(JSON.stringify({
        type: 'action_ack',
        requestId: msg.requestId,
        status: 'denied',
      }));
    });

    const result = await sendActionRequest({
      clientId,
      action: 'openFolder',
      path: VALID_PATH,
      model: 'test-model',
    });

    expect(result).toBe('denied');

    expect(mockLogAction).toHaveBeenCalledTimes(1);
    const logCall = mockLogAction.mock.calls[0][0];
    expect(logCall.result).toBe('denied');

    electronWs.close();
  });

  it('Scenario 3 — invalid path → logs denied and throws without WS send', async () => {
    const invalidPath = '/etc/passwd';

    await expect(
      sendActionRequest({
        clientId: 'any-client',
        action: 'openFile',
        path: invalidPath,
        model: 'x',
      })
    ).rejects.toThrow(/whitelist/i);

    // logActionToBackend called once with denied
    expect(mockLogAction).toHaveBeenCalledTimes(1);
    const logCall = mockLogAction.mock.calls[0][0];
    expect(logCall.result).toBe('denied');
    expect(logCall.path).toBe(invalidPath);
    expect(logCall.action).toBe('openFile');

    // clientConnections was NOT looked up (Map is empty, no WS send)
    expect(clientConnections.size).toBe(0);
  });

  it('Scenario 4 — clientId not in clientConnections → throws CLIENT_NOT_CONNECTED', async () => {
    // clientConnections is empty — no connected Electron
    await expect(
      sendActionRequest({
        clientId: 'ghost-client',
        action: 'openFolder',
        path: VALID_PATH,
        model: 'x',
      })
    ).rejects.toThrow(/CLIENT_NOT_CONNECTED/);

    // logActionToBackend NOT called for missing connection
    expect(mockLogAction).not.toHaveBeenCalled();

    // pendingAckResolvers remains empty
    expect(pendingAckResolvers.size).toBe(0);
  });

  it('Scenario 5 — timeout (12s) → rejects and cleans up pendingAckResolvers', async () => {
    const clientId = 'e2e-client-timeout';
    const electronWs = await connectClient(port, clientId);

    await waitFor(() => clientConnections.has(clientId));

    // Wire Electron fake: receive message but never reply (simulates no ACK)
    // No message handler attached

    vi.useFakeTimers();

    const dispatchPromise = sendActionRequest({
      clientId,
      action: 'openFolder',
      path: VALID_PATH,
      model: 'timeout-model',
    });

    // Advance past 12s timeout
    await vi.advanceTimersByTimeAsync(12_001);

    await expect(dispatchPromise).rejects.toThrow(/timeout|TIMEOUT/i);

    // pendingAckResolvers cleaned up after timeout
    expect(pendingAckResolvers.size).toBe(0);

    electronWs.close();
  });

  it('Scenario 6 — pendingAckResolvers cleaned up after success', async () => {
    const clientId = 'e2e-client-cleanup';
    const electronWs = await connectClient(port, clientId);

    await waitFor(() => clientConnections.has(clientId));

    electronWs.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      electronWs.send(JSON.stringify({
        type: 'action_ack',
        requestId: msg.requestId,
        status: 'confirmed',
      }));
    });

    await sendActionRequest({
      clientId,
      action: 'openFolder',
      path: VALID_PATH,
      model: 'test-model',
    });

    // Resolver should be removed after ACK received
    expect(pendingAckResolvers.size).toBe(0);

    electronWs.close();
  });
});
