/**
 * WebSocket Actions Server Tests
 * Tests for setupWebSocketServer, clientConnections Map lifecycle,
 * and pendingAckResolvers callback routing
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import WebSocket from 'ws';
import {
  setupWebSocketServer,
  clientConnections,
  pendingAckResolvers,
} from '../lib/ws-server.js';

// Helper: wait for a condition with polling
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

// Helper: connect a WS client and wait for open
function connectClient(port: number, clientId?: string): Promise<WebSocket> {
  const url = clientId
    ? `ws://localhost:${port}/api/actions?clientId=${clientId}`
    : `ws://localhost:${port}/api/actions`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
    // Timeout fallback for rejected connections
    setTimeout(() => reject(new Error('Connection timed out')), 2000);
  });
}

describe('WebSocket Server — connection lifecycle', () => {
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    // Clear shared Maps between tests
    clientConnections.clear();
    pendingAckResolvers.clear();

    server = http.createServer();
    setupWebSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
    port = (server.address() as any).port;
  });

  afterEach(async () => {
    // Close all connections
    for (const ws of clientConnections.values()) {
      ws.terminate();
    }
    clientConnections.clear();
    pendingAckResolvers.clear();

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('connects with valid clientId and adds to Map', async () => {
    const clientId = 'test-client-001';
    const ws = await connectClient(port, clientId);

    // clientConnections stores the server-side WS; client is a separate object
    expect(clientConnections.has(clientId)).toBe(true);
    expect(clientConnections.get(clientId)).toBeInstanceOf(WebSocket);

    ws.close();
  });

  it('rejects connection without clientId (socket destroyed, no upgrade)', async () => {
    // Without clientId, the server writes 400 and destroys the socket
    await expect(connectClient(port, undefined)).rejects.toThrow();
  });

  it('removes clientId from Map on disconnect', async () => {
    const clientId = 'test-client-002';
    const ws = await connectClient(port, clientId);

    expect(clientConnections.has(clientId)).toBe(true);

    ws.close();
    await waitFor(() => !clientConnections.has(clientId));

    expect(clientConnections.has(clientId)).toBe(false);
  });

  it('replaces stale entry when same clientId reconnects', async () => {
    const clientId = 'test-client-003';
    const ws1 = await connectClient(port, clientId);
    const firstServerWs = clientConnections.get(clientId);

    // Reconnect with same clientId — old entry should be replaced
    const ws2 = await connectClient(port, clientId);
    const secondServerWs = clientConnections.get(clientId);

    // Map should have exactly 1 entry (old replaced by new)
    expect(clientConnections.size).toBe(1);
    // Both server-side references are WebSocket instances
    expect(secondServerWs).toBeInstanceOf(WebSocket);
    // The server-side WS must have been replaced (different objects)
    expect(secondServerWs).not.toBe(firstServerWs);

    ws2.close();
  });

  it('routes valid action_ack to registered resolver', async () => {
    const clientId = 'test-client-004';
    const requestId = '123e4567-e89b-12d3-a456-426614174000';

    const ws = await connectClient(port, clientId);

    const resolvedAck = await new Promise<any>((resolve) => {
      pendingAckResolvers.set(requestId, resolve);

      ws.send(JSON.stringify({
        type: 'action_ack',
        requestId,
        status: 'confirmed',
      }));
    });

    expect(resolvedAck.status).toBe('confirmed');
    expect(resolvedAck.requestId).toBe(requestId);
    // Resolver should be removed after being called
    expect(pendingAckResolvers.has(requestId)).toBe(false);

    ws.close();
  });

  it('drops action_ack with unknown requestId (no throw)', async () => {
    const clientId = 'test-client-005';
    const unknownId = '999e4567-e89b-12d3-a456-426614174000';

    const ws = await connectClient(port, clientId);

    // Send ack with no matching resolver — should not throw
    ws.send(JSON.stringify({
      type: 'action_ack',
      requestId: unknownId,
      status: 'confirmed',
    }));

    // Wait a bit and verify no crash; Map remains unchanged
    await new Promise((r) => setTimeout(r, 100));
    expect(pendingAckResolvers.has(unknownId)).toBe(false);

    ws.close();
  });

  it('handles malformed JSON without throwing', async () => {
    const clientId = 'test-client-006';
    const ws = await connectClient(port, clientId);

    // Send invalid JSON — server should log warn, not crash
    ws.send('this is not valid json {{{');

    // Wait briefly; server stays alive
    await new Promise((r) => setTimeout(r, 100));
    expect(clientConnections.has(clientId)).toBe(true);

    ws.close();
  });

  it('rejects WS connections to paths other than /api/actions', async () => {
    const url = `ws://localhost:${port}/wrong-path?clientId=x`;
    await expect(
      new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(url);
        ws.once('open', () => resolve(ws));
        ws.once('error', reject);
        ws.once('close', () => reject(new Error('Connection closed')));
        setTimeout(() => reject(new Error('Timed out')), 2000);
      })
    ).rejects.toThrow();
  });
});
