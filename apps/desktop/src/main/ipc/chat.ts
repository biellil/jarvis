/**
 * Chat IPC Handlers
 * D-01: Centralized in ipc/ organized by feature
 * D-03: Returns Result type, never throws
 * D-04: sendText logs in main, proving IPC works
 */
import { ipcMain } from 'electron';
import { IPC_CHANNELS, type SendTextResponse } from '../../shared/ipc-types';

export function setupChatHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.CHAT_SEND_TEXT,
    async (_event, message: string): Promise<SendTextResponse> => {
      try {
        // D-04: Functional handler that logs to prove IPC works
        console.log('[IPC:chat:send-text] Received message:', message);

        return {
          success: true,
          data: { received: message },
        };
      } catch (err) {
        // D-03: Never throw across IPC boundary - return Result type
        console.error('[IPC:chat:send-text] Error:', err);
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );
}
