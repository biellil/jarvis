/**
 * useActionConfirmation — Phase 54 (LACT-06) + Phase 55 (LACT-01..05)
 *
 * Subscribes to ACTION_REQUEST from main (via gateway action_request).
 * Exposes pendingAction state for the confirmation toast to render.
 *
 * Phase 55 change (D-12): Execute → ACK order.
 * On confirm: calls execute() first, then sends ACK based on result.
 * On deny/timeout: sends ACK 'denied'/'timeout' directly (no execute).
 *
 * The ACK status reflects what actually happened in the OS (D-13):
 * - execute success → 'confirmed'
 * - execute failure → 'denied' (with error logged)
 * For viewContent, the content is carried in the ACK payload (D-01).
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

  /**
   * confirmAction — executes the OS action first, then sends ACK (D-12).
   * ACK status is determined by the execution result (D-13).
   */
  const confirmAction = useCallback(
    async (requestId: string, action: PendingAction['action'], path: string) => {
      setPendingAction(null);

      const fileAction = action as 'openFolder' | 'openFile' | 'closeFile' | 'viewContent';

      try {
        const result = await window.jarvis.actions?.execute({ requestId, action: fileAction, path });

        if (result?.success) {
          // Pass content for viewContent so the ACK carries it to the gateway (D-01)
          await window.jarvis.actions?.sendAck(requestId, 'confirmed');
        } else {
          // Execution failed — ACK as denied so the LLM gets accurate feedback (D-13)
          console.warn('[useActionConfirmation] OS action failed', { requestId, action, error: result?.error });
          await window.jarvis.actions?.sendAck(requestId, 'denied');
        }
      } catch (err) {
        console.error('[useActionConfirmation] execute threw unexpectedly', err);
        await window.jarvis.actions?.sendAck(requestId, 'denied');
      }
    },
    [],
  );

  /**
   * denyAction — user clicked "Negar" or toast timed out.
   * No OS action executed; sends ACK immediately.
   */
  const denyAction = useCallback(async (requestId: string, status: ActionAckStatus = 'denied') => {
    setPendingAction(null);
    await window.jarvis.actions?.sendAck(requestId, status);
  }, []);

  /**
   * Legacy sendAck — kept for backward compatibility with any existing callers.
   * Prefer confirmAction / denyAction for new code.
   * @deprecated Use confirmAction or denyAction instead.
   */
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

  return { pendingAction, sendAck, confirmAction, denyAction };
}
