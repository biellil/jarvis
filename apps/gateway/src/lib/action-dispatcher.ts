import crypto from 'crypto';
import WebSocket from 'ws';
import { clientConnections, pendingAckResolvers, pythonSseClients } from './ws-server.js';
import { ActionRequestSchema, type ActionAck } from './path-validator.js';
import { logActionToBackend } from './audit-logger.js';
import { logger } from './logger.js';

export interface ActionDispatchRequest {
  clientId: string;
  action: 'openFolder' | 'openFile' | 'closeFile' | 'viewContent';
  path: string;
  model: string;
}

const TIMEOUT_MS = 12_000;
const TIMEOUT_PY_MS = 30_000;

/**
 * Send an action_request to the connected Electron client identified by clientId.
 * Validates path against whitelist, awaits ACK with 12s timeout, and logs to backend.
 *
 * Returns the ACK status ('confirmed' | 'denied' | 'timeout') to the caller.
 * Phase 55's LangGraph tool will call this directly.
 */
export async function sendActionRequest(
  req: ActionDispatchRequest
): Promise<{ status: 'confirmed' | 'denied' | 'timeout'; content?: string }> {
  const requestId = crypto.randomUUID();

  // STEP 1 — Validate path via ActionRequestSchema (D-08: validate before any WS operation)
  const parseResult = ActionRequestSchema.safeParse({
    type: 'action_request',
    requestId,
    action: req.action,
    path: req.path,
    model: req.model,
  });

  if (!parseResult.success) {
    // Log denied BEFORE throwing (D-05 and D-08)
    await logActionToBackend({
      timestamp: new Date().toISOString(),
      path: req.path,
      action: req.action,
      result: 'denied',
      model: req.model,
      clientId: req.clientId,
      requestId,
    });
    const msg = parseResult.error.issues.map((i) => i.message).join('; ');
    throw new Error(`Path validation failed — whitelist rejected: ${msg}`);
  }

  // STEP 2 — Look up Electron WS, fall back to Python SSE
  const ws = clientConnections.get(req.clientId);
  const isElectronConnected = ws && ws.readyState === WebSocket.OPEN;

  if (!isElectronConnected) {
    // Fallback: attempt Python SSE dispatch
    const pythonSse = pythonSseClients.get(req.clientId);
    if (!pythonSse) {
      throw new Error(`CLIENT_NOT_CONNECTED: no active WS or SSE for clientId=${req.clientId}`);
    }

    // STEP 3 (Python SSE path) — Register resolver + emit SSE event + await ACK
    const ack = await new Promise<ActionAck>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingAckResolvers.delete(requestId);
        reject(new Error(`TIMEOUT: no ACK received within ${TIMEOUT_PY_MS}ms (Python) for requestId=${requestId}`));
      }, TIMEOUT_PY_MS);

      pendingAckResolvers.set(requestId, (incoming) => {
        clearTimeout(timer);
        resolve(incoming);
      });

      const sseEvent = `event: task:pc_action\ndata: ${JSON.stringify({
        requestId,
        action: req.action,
        params: { path: req.path },
      })}\n\n`;

      try {
        pythonSse.write(sseEvent);
        logger.info(
          { clientId: req.clientId, requestId, action: req.action, path: req.path },
          'action_request sent to Python SSE'
        );
      } catch (err) {
        clearTimeout(timer);
        pendingAckResolvers.delete(requestId);
        reject(new Error(`SSE_WRITE_FAILED: could not write to Python SSE for clientId=${req.clientId}: ${String(err)}`));
      }
    });

    logger.info({ requestId, status: ack.status }, 'action_ack received from Python');

    const auditResult = ack.status === 'confirmed' ? 'approved' : ack.status;
    await logActionToBackend({
      timestamp: new Date().toISOString(),
      path: req.path,
      action: req.action,
      result: auditResult,
      model: req.model,
      clientId: req.clientId,
      requestId,
    });

    return { status: ack.status, content: ack.content };
  }

  // STEP 3 (Electron WS path — existing code continues here unchanged)
  const ack = await new Promise<ActionAck>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingAckResolvers.delete(requestId);
      reject(new Error(`TIMEOUT: no ACK received within ${TIMEOUT_MS}ms for requestId=${requestId}`));
    }, TIMEOUT_MS);

    pendingAckResolvers.set(requestId, (incoming) => {
      clearTimeout(timer);
      resolve(incoming);
    });

    ws.send(JSON.stringify(parseResult.data));
    logger.info(
      { clientId: req.clientId, requestId, action: req.action, path: req.path },
      'action_request sent to Electron'
    );
  });

  logger.info({ requestId, status: ack.status }, 'action_ack received');

  // STEP 4 — Map ACK status to audit result and log
  // ack.status: 'confirmed' | 'denied' | 'timeout'
  // audit result: 'confirmed' → 'approved', others keep their name
  const auditResult = ack.status === 'confirmed' ? 'approved' : ack.status;

  await logActionToBackend({
    timestamp: new Date().toISOString(),
    path: req.path,
    action: req.action,
    result: auditResult,
    model: req.model,
    clientId: req.clientId,
    requestId,
  });

  return {
    status: ack.status,
    content: ack.content,  // undefined for actions that are not viewContent
  };
}
