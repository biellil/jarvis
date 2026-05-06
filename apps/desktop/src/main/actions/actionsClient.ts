/**
 * actionsClient — WebSocket client for LLM file action requests (Phase 54, LACT-09)
 *
 * Connects to gateway /api/actions with a stable clientId.
 * Forwards action_request messages to renderer via IPC.
 * Sends action_ack back to gateway after renderer responds.
 * Reconnects with exponential backoff on disconnect.
 */
import WebSocket from 'ws';
import { BrowserWindow } from 'electron';
import { getOrCreateClientId } from '../store.js';
import { IPC_CHANNELS } from '../../shared/ipc-types.js';
import type { ActionRequestPayload, ActionAckStatus } from '../../shared/ipc-types.js';

const GATEWAY_URL = process.env['GATEWAY_URL'] ?? 'ws://localhost:3000';
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

let ws: WebSocket | null = null;
let reconnectDelayMs = RECONNECT_BASE_MS;
let reconnectTimer: NodeJS.Timeout | null = null;
let stopped = false;

function broadcastActionRequest(payload: ActionRequestPayload): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.ACTION_REQUEST, payload);
    }
  });
}

function connect(): void {
  if (stopped) return;
  const clientId = getOrCreateClientId();
  const url = `${GATEWAY_URL}/api/actions?clientId=${encodeURIComponent(clientId)}`;
  console.log(`[actionsClient] Connecting to ${url}`);

  ws = new WebSocket(url);

  ws.on('open', () => {
    console.log('[actionsClient] WS connected');
    reconnectDelayMs = RECONNECT_BASE_MS;
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as unknown;
      if (
        typeof msg !== 'object' ||
        msg === null ||
        (msg as Record<string, unknown>)['type'] !== 'action_request'
      ) {
        console.warn('[actionsClient] Unexpected message type', msg);
        return;
      }
      const m = msg as Record<string, unknown>;
      if (!m['requestId'] || !m['action'] || !m['path'] || !m['model']) {
        console.warn('[actionsClient] action_request missing required fields', m);
        return;
      }
      const payload: ActionRequestPayload = {
        requestId: m['requestId'] as string,
        action: m['action'] as ActionRequestPayload['action'],
        path: m['path'] as string,
        model: m['model'] as string,
      };
      broadcastActionRequest(payload);
    } catch (err) {
      console.warn('[actionsClient] Message parse error', err);
    }
  });

  ws.on('close', () => {
    ws = null;
    if (stopped) return;
    console.log(`[actionsClient] WS closed — reconnecting in ${reconnectDelayMs}ms`);
    reconnectTimer = setTimeout(() => {
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, RECONNECT_MAX_MS);
      connect();
    }, reconnectDelayMs);
  });

  ws.on('error', (err) => {
    console.error('[actionsClient] WS error', err);
    // 'error' event always followed by 'close' — reconnect handled there
  });
}

export function startActionsClient(): void {
  stopped = false;
  reconnectDelayMs = RECONNECT_BASE_MS;
  connect();
}

export function stopActionsClient(): void {
  stopped = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  ws?.close();
  ws = null;
}

export function sendActionAck(requestId: string, status: ActionAckStatus): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('[actionsClient] Cannot send ACK — WS not open', { requestId, status });
    return;
  }
  ws.send(JSON.stringify({ type: 'action_ack', requestId, status }));
}
