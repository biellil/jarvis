/**
 * capture-screen-dispatcher — Phase 63 Vision Pipeline (VISION-01)
 *
 * Sends a capture_screen_request to the Electron client via the established WS connection,
 * awaits the capture_screen_response with a 5s timeout.
 *
 * Pattern mirrors sendActionRequest() in action-dispatcher.ts:
 * - Looks up clientConnections.get(clientId)
 * - Registers resolver in pendingCaptureResolvers
 * - Sends WS message, awaits with timeout
 * - Returns CaptureScreenResult
 */
import crypto from 'crypto';
import WebSocket from 'ws';
import { clientConnections, pendingCaptureResolvers, type CaptureScreenResult } from './ws-server.js';
import { logger } from './logger.js';

const CAPTURE_TIMEOUT_MS = 5_000;

export async function dispatchCaptureScreen(clientId: string): Promise<CaptureScreenResult> {
  const ws = clientConnections.get(clientId);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return { success: false, error: `CLIENT_NOT_CONNECTED: no active WS for clientId=${clientId}` };
  }

  const requestId = crypto.randomUUID();

  return new Promise<CaptureScreenResult>((resolve) => {
    const timer = setTimeout(() => {
      pendingCaptureResolvers.delete(requestId);
      resolve({ success: false, error: `TIMEOUT: no response within ${CAPTURE_TIMEOUT_MS}ms` });
    }, CAPTURE_TIMEOUT_MS);

    pendingCaptureResolvers.set(requestId, (result) => {
      clearTimeout(timer);
      resolve(result);
    });

    ws.send(JSON.stringify({ type: 'capture_screen_request', requestId }));
    logger.info({ clientId, requestId }, 'capture_screen_request sent to Electron');
  });
}
