import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { logger } from './logger.js';
import { ActionAckSchema, type ActionAck } from './path-validator.js';

export const clientConnections = new Map<string, WebSocket>();
export const pendingAckResolvers = new Map<string, (ack: ActionAck) => void>();

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
