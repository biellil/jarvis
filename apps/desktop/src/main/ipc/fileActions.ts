/**
 * File actions IPC handler — Phase 55 (LACT-01..05)
 *
 * ACTION_EXECUTE (renderer → main): renderer sends {requestId, action, path}
 * after user confirms the toast. Main executes the OS action and returns
 * ActionExecuteResult — which the renderer then uses to determine ACK status.
 *
 * Execution order (D-12):
 *   1. User confirms toast in renderer
 *   2. Renderer invokes actions:execute with {requestId, action, path}
 *   3. Main dispatches to dispatchFileAction
 *   4. Main returns ActionExecuteResult
 *   5. Renderer sends ACK to main based on result (confirmed/denied)
 *   6. Main forwards ACK to gateway via sendActionAck
 */
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-types.js';
import type { ActionExecutePayload, ActionExecuteResult } from '../../shared/ipc-types.js';
import { dispatchFileAction } from '../actions/file-action-dispatcher.js';

export function setupFileActionHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.ACTION_EXECUTE,
    async (_event, payload: ActionExecutePayload): Promise<ActionExecuteResult> => {
      if (!payload || typeof payload.action !== 'string' || typeof payload.path !== 'string') {
        return { success: false, error: 'Invalid payload: action and path are required strings' };
      }

      try {
        return await dispatchFileAction(payload.action, payload.path);
      } catch (err) {
        // Belt-and-suspenders: handlers already catch internally, but guard here too
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[fileActions-ipc] Unexpected error in dispatchFileAction', err);
        return { success: false, error: `Unexpected error: ${msg}` };
      }
    },
  );
}
