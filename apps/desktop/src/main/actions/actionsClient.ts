/**
 * actionsClient — WebSocket client for LLM file action requests (Phase 54, LACT-09)
 *
 * Connects to gateway /api/actions with a stable clientId.
 * Forwards action_request messages to renderer via IPC.
 * Sends action_ack back to gateway after renderer responds.
 * Reconnects with exponential backoff on disconnect.
 */
import WebSocket from 'ws';
import { dialog, desktopCapturer } from 'electron';
import sharp from 'sharp';
import { getOrCreateClientId } from '../store.js';
import type { ActionRequestPayload, ActionAckStatus, FileAction } from '../../shared/ipc-types.js';
import { dispatchFileAction } from './file-action-dispatcher.js';

const GATEWAY_URL = process.env['GATEWAY_URL'] ?? 'ws://localhost:3000';
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

let ws: WebSocket | null = null;
let reconnectDelayMs = RECONNECT_BASE_MS;
let reconnectTimer: NodeJS.Timeout | null = null;
let stopped = false;

const ACTION_LABELS: Record<string, string> = {
  openFolder: 'abrir pasta',
  openFile: 'abrir arquivo',
  closeFile: 'fechar aplicativo',
  viewContent: 'ler conteúdo de arquivo',
};

/**
 * Phase 63 (VISION-01): Handle capture_screen_request from gateway WS.
 * Captures the screen using desktopCapturer, compresses via sharp, sends back capture_screen_response.
 */
async function handleCaptureScreenRequest(requestId: string): Promise<void> {
  let result: { success: true; base64: string } | { success: false; error: string };
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    });
    if (sources.length === 0) {
      result = { success: false, error: 'PERMISSION_DENIED' };
    } else {
      const pngBuffer = sources[0].thumbnail.toPNG();
      const jpegBuffer = await sharp(pngBuffer)
        .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      const base64 = `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
      result = { success: true, base64 };
    }
  } catch (err) {
    result = { success: false, error: (err as Error).message };
  }

  sendCaptureScreenResponse(requestId, result);
}

function sendCaptureScreenResponse(
  requestId: string,
  result: { success: true; base64: string } | { success: false; error: string },
): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('[actionsClient] Cannot send capture response — WS not open', { requestId });
    return;
  }
  ws.send(JSON.stringify({ type: 'capture_screen_response', requestId, ...result }));
}

async function handleActionRequestNative(payload: ActionRequestPayload): Promise<void> {
  const label = ACTION_LABELS[payload.action] ?? payload.action;
  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Permitir', 'Negar'],
    defaultId: 0,
    cancelId: 1,
    title: 'JARVIS — Confirmação',
    message: `JARVIS quer ${label}:`,
    detail: payload.path,
    alwaysOnTop: true,
  });

  if (response === 0) {
    const result = await dispatchFileAction(payload.action as FileAction, payload.path);
    if (result.success) {
      sendActionAck(payload.requestId, 'confirmed', result.content);
    } else {
      console.warn('[actionsClient] dispatchFileAction failed:', result.error);
      sendActionAck(payload.requestId, 'denied');
    }
  } else {
    sendActionAck(payload.requestId, 'denied');
  }
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

      // Phase 63 (VISION-01): handle capture_screen_request from gateway
      if (
        typeof msg === 'object' &&
        msg !== null &&
        (msg as Record<string, unknown>)['type'] === 'capture_screen_request'
      ) {
        const requestId = (msg as Record<string, unknown>)['requestId'] as string;
        void handleCaptureScreenRequest(requestId);
        return;
      }

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
      void handleActionRequestNative(payload);
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

/**
 * Send an action_ack to the gateway.
 * Phase 55 (D-01): content is included when action=viewContent and status='confirmed'.
 */
export function sendActionAck(requestId: string, status: ActionAckStatus, content?: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('[actionsClient] Cannot send ACK — WS not open', { requestId, status });
    return;
  }
  const msg: Record<string, unknown> = { type: 'action_ack', requestId, status };
  if (content !== undefined) {
    msg['content'] = content;
  }
  ws.send(JSON.stringify(msg));
}
