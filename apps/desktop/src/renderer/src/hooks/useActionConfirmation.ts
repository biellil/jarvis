/**
 * useActionConfirmation — Phase 54 (LACT-06) + Phase 55 (LACT-01..05) + Phase 58 (FACT-10/11)
 *
 * Subscribes to ACTION_REQUEST from main (via gateway action_request).
 * Exposes pendingAction state for the confirmation toast to render.
 *
 * Phase 55 change (D-12): Execute → ACK order.
 * On confirm: calls execute() first, then sends ACK based on result.
 * On deny/timeout: sends ACK 'denied'/'timeout' directly (no execute).
 *
 * Phase 58 change (FACT-10/11):
 * Read-only actions (openFolder, openFile, closeFile, viewContent) auto-execute
 * immediately — no toast shown (pendingAction stays null).
 * Destructive actions (deleteFile, moveFile, renameFile) go through the existing
 * pendingAction → toast → user confirm flow (FACT-11).
 *
 * The ACK status reflects what actually happened in the OS (D-13):
 * - execute success → 'confirmed'
 * - execute failure → 'denied' (with error logged)
 * For viewContent, the content is carried in the ACK payload (D-01).
 */
import { useState, useEffect, useCallback } from 'react';
import type { ActionRequestPayload, ActionAckStatus } from '../../../shared/ipc-types.js';

/**
 * Actions that execute immediately without user confirmation (FACT-10).
 * All others (deleteFile, moveFile, renameFile) require the toast (FACT-11).
 */
const READ_ONLY_ACTIONS = new Set<string>(['openFolder', 'openFile', 'closeFile', 'viewContent']);

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

  /**
   * executeAndAck — Phase 55 Plan 05 (LACT-01..05)
   * Execute→ACK flow (D-12, D-13): executes the OS action via IPC, then sends
   * ACK based on the execution result. For viewContent, carries the file content
   * in the ACK payload so the gateway can forward it to the LLM (D-01).
   */
  const executeAndAck = useCallback(async (requestId: string): Promise<void> => {
    if (!pendingAction || pendingAction.requestId !== requestId) {
      console.warn('[useActionConfirmation] executeAndAck called with unknown requestId', requestId);
      return;
    }

    const { action, path } = pendingAction;
    setPendingAction(null);

    console.log('[executeAndAck] iniciando:', { requestId, action, path });
    console.log('[executeAndAck] window.jarvis.actions:', !!window.jarvis?.actions, '| execute:', !!window.jarvis?.actions?.execute);

    try {
      const result = await window.jarvis.actions?.execute({
        requestId,
        action: action as import('../../../shared/ipc-types.js').FileAction,
        path,
      });

      console.log('[executeAndAck] resultado IPC:', result);

      if (result?.success) {
        // Pass content for viewContent so the ACK carries file text to the gateway (D-01)
        await window.jarvis.actions?.sendAck(requestId, 'confirmed', result.content);
        console.log('[executeAndAck] ACK confirmed enviado');
      } else {
        console.warn('[useActionConfirmation] executeAndAck: OS action failed', { requestId, action, error: result?.error });
        await window.jarvis.actions?.sendAck(requestId, 'denied');
      }
    } catch (err) {
      console.error('[useActionConfirmation] executeAndAck threw unexpectedly', err);
      await window.jarvis.actions?.sendAck(requestId, 'denied');
    }
  }, [pendingAction]);

  useEffect(() => {
    const unsub = window.jarvis.actions?.onRequest(async (payload: ActionRequestPayload) => {
      // FACT-10: Read-only actions execute immediately — no confirmation toast
      if (READ_ONLY_ACTIONS.has(payload.action)) {
        try {
          const result = await window.jarvis.actions?.execute({
            requestId: payload.requestId,
            action: payload.action as import('../../../shared/ipc-types.js').FileAction,
            path: payload.path,
          });
          if (result?.success) {
            await window.jarvis.actions?.sendAck(payload.requestId, 'confirmed', result.content);
          } else {
            console.warn('[useActionConfirmation] read-only auto-execute failed', { payload, error: result?.error });
            await window.jarvis.actions?.sendAck(payload.requestId, 'denied');
          }
        } catch (err) {
          console.error('[useActionConfirmation] read-only auto-execute threw', err);
          await window.jarvis.actions?.sendAck(payload.requestId, 'denied');
        }
        return; // Do NOT set pendingAction — no toast for read-only
      }

      // FACT-11: Destructive actions (deleteFile, moveFile, renameFile) show confirmation toast
      // Replace any existing pending action (only one toast at a time)
      setPendingAction({
        requestId: payload.requestId,
        action: payload.action,
        path: payload.path,
        model: payload.model,
      });
    });

    return () => unsub?.();
  }, []);

  return { pendingAction, sendAck, confirmAction, denyAction, executeAndAck };
}
