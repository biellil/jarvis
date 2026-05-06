/**
 * Actions IPC handlers — Phase 54 (LACT-06, LACT-09) + Phase 55 (LACT-01..05)
 *
 * ACTION_ACK (renderer → main): user responded to confirmation toast.
 * Forwards status to gateway via sendActionAck.
 *
 * ACTION_EXECUTE (renderer → main): execute confirmed OS action.
 * Dispatches to file action handlers and returns ActionExecuteResult.
 * See fileActions.ts for the dispatch implementation (setupFileActionHandlers).
 * Both handlers are registered here in setupActionsIpcHandlers.
 */
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-types.js';
import type { ActionAckPayload, ActionExecutePayload, ActionExecuteResult } from '../../shared/ipc-types.js';
import { sendActionAck } from '../actions/actionsClient.js';
import { dispatchFileAction } from '../actions/file-action-dispatcher.js';

export function setupActionsIpcHandlers(): void {
  // Phase 54 — ACTION_ACK: user confirmed/denied/timeout, forward to gateway
  ipcMain.handle(IPC_CHANNELS.ACTION_ACK, (_event, payload: ActionAckPayload) => {
    try {
      // Phase 55 (D-01): forward optional content for viewContent ACKs
      sendActionAck(payload.requestId, payload.status, payload.content);
      return { success: true };
    } catch (err) {
      console.error('[actions-ipc] sendActionAck failed', err);
      return { success: false, error: (err as Error).message };
    }
  });

  // Phase 55 — ACTION_EXECUTE: execute OS action after user confirms toast (D-12)
  ipcMain.handle(
    IPC_CHANNELS.ACTION_EXECUTE,
    async (_event, payload: ActionExecutePayload): Promise<ActionExecuteResult> => {
      console.log('[actions-ipc] ACTION_EXECUTE recebido:', payload);
      if (!payload || typeof payload.action !== 'string' || typeof payload.path !== 'string') {
        console.error('[actions-ipc] Payload inválido:', payload);
        return { success: false, error: 'Invalid payload: action and path are required strings' };
      }
      try {
        const result = await dispatchFileAction(payload.action, payload.path);
        console.log('[actions-ipc] dispatchFileAction resultado:', result);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[actions-ipc] Erro inesperado em dispatchFileAction:', err);
        return { success: false, error: `Unexpected error: ${msg}` };
      }
    },
  );
}
