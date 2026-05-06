import crypto from 'crypto';
import WebSocket from 'ws';
import { clientConnections, pendingAckResolvers } from './ws-server.js';
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

/**
 * Result of sendActionRequest — Phase 55 (D-02).
 * status: 'confirmed' | 'denied' | 'timeout'
 * content: file text for viewContent actions (only when status='confirmed')
 */
export interface ActionDispatchResult {
  status: 'confirmed' | 'denied' | 'timeout';
  content?: string;
}

export async function sendActionRequest(
  req: ActionDispatchRequest
): Promise<ActionDispatchResult> {
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

  // STEP 2 — Look up Electron connection
  const ws = clientConnections.get(req.clientId);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    // Missing connection is not an auditable action attempt — no logActionToBackend
    throw new Error(`CLIENT_NOT_CONNECTED: no active WS for clientId=${req.clientId}`);
  }

  // STEP 3 — Register resolver + send + await ACK with 12s timeout
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

  // Phase 55 (D-02): return structured result with optional content
  return { status: ack.status, content: ack.content };
}
