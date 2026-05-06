/**
 * useActionConfirmation — Phase 54 (LACT-06)
 *
 * Subscribes to ACTION_REQUEST from main (via gateway action_request).
 * Exposes pendingAction state for the confirmation toast to render.
 * Calls sendAck on confirm, deny, or 10s timeout.
 */
import { useState, useEffect, useCallback } from 'react';
import type { ActionRequestPayload, ActionAckStatus } from '../../../shared/ipc-types.js';

export interface PendingAction {
  requestId: string;
  action: string;
  path: string;
  model: string;
}

export function useActionConfirmation() {
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const sendAck = useCallback((requestId: string, status: ActionAckStatus) => {
    void window.jarvis.actions?.sendAck(requestId, status);
    setPendingAction(null);
  }, []);

  useEffect(() => {
    const unsub = window.jarvis.actions?.onRequest((payload: ActionRequestPayload) => {
      // Replace any existing pending action (only one toast at a time)
      // If replacing, the old requestId gets no explicit ACK — gateway timeout handles it
      setPendingAction({
        requestId: payload.requestId,
        action: payload.action,
        path: payload.path,
        model: payload.model,
      });
    });

    return () => unsub?.();
  }, []);

  return { pendingAction, sendAck };
}
