import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { logger } from './logger.js';
import { ActionAckSchema, type ActionAck } from './path-validator.js';

export const clientConnections = new Map<string, WebSocket>();
export const pendingAckResolvers = new Map<string, (ack: ActionAck) => void>();

// Phase 63 (VISION-01): capture screen back-channel resolver map
export type CaptureScreenResult =
  | { success: true; base64: string }
  | { success: false; error: string };

export const pendingCaptureResolvers = new Map<string, (result: CaptureScreenResult) => void>();

export function setupWebSocketServer(httpServer: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '', `http://${request.headers.host ?? 'localhost'}`);
    if (url.pathname !== '/api/actions') {
      socket.destroy();
      return;
    }

    const clientId = url.searchParams.get('clientId');
    if (!clientId) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      // Replace stale connection for same clientId
      const old = clientConnections.get(clientId);
      if (old && old.readyState === WebSocket.OPEN) {
        old.terminate();
      }
      clientConnections.set(clientId, ws);
      logger.info({ clientId, total: clientConnections.size }, 'WS client connected');

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());

          // Phase 63 (VISION-01): handle capture_screen_response before ActionAckSchema parse
          if (typeof msg === 'object' && msg !== null && (msg as Record<string, unknown>)['type'] === 'capture_screen_response') {
            const requestId = (msg as Record<string, unknown>)['requestId'] as string;
            const resolver = pendingCaptureResolvers.get(requestId);
            if (resolver) {
              pendingCaptureResolvers.delete(requestId);
              const m = msg as Record<string, unknown>;
              const result: CaptureScreenResult = m['success'] === true
                ? { success: true, base64: m['base64'] as string }
                : { success: false, error: (m['error'] as string) ?? 'Unknown error' };
              resolver(result);
            } else {
              logger.warn({ requestId }, 'No pending capture resolver — dropped');
            }
            return;
          }

          // Existing action_ack handling
          const parsed = ActionAckSchema.safeParse(msg);
          if (!parsed.success) {
            logger.warn({ clientId, error: parsed.error.issues }, 'WS message schema invalid');
            return;
          }
          const ack = parsed.data;
          const resolver = pendingAckResolvers.get(ack.requestId);
          if (resolver) {
            pendingAckResolvers.delete(ack.requestId);
            resolver(ack);
          } else {
            logger.warn({ requestId: ack.requestId }, 'No pending resolver for ACK — dropped');
          }
        } catch (err) {
          logger.warn({ clientId, error: err }, 'WS message parse error');
        }
      });

      ws.on('close', () => {
        clientConnections.delete(clientId);
        logger.info({ clientId, total: clientConnections.size }, 'WS client disconnected');
      });

      ws.on('error', (err) => {
        logger.error({ clientId, error: err }, 'WS error');
      });
    });
  });

  return wss;
}
