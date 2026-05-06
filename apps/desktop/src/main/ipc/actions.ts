/**
 * Actions IPC handlers — Phase 54 (LACT-06, LACT-09)
 *
 * ACTION_ACK (renderer → main): user responded to confirmation toast.
 * Forwards status to gateway via sendActionAck.
 */
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-types.js';
import type { ActionAckPayload } from '../../shared/ipc-types.js';
import { sendActionAck } from '../actions/actionsClient.js';

export function setupActionsIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ACTION_ACK, (_event, payload: ActionAckPayload) => {
    try {
      sendActionAck(payload.requestId, payload.status);
      return { success: true };
    } catch (err) {
      console.error('[actions-ipc] sendActionAck failed', err);
      return { success: false, error: (err as Error).message };
    }
  });
}
