/**
 * Chat IPC Handlers
 * D-01: Centralized in ipc/ organized by feature
 * D-03: Returns Result type, never throws
 * D-04: sendText calls gateway HTTP endpoint
 */
import { ipcMain } from 'electron';
import { IPC_CHANNELS, type SendTextResponse } from '../../shared/ipc-types';

// Gateway URL - not hardcoded, could be made configurable
const GATEWAY_URL = 'http://localhost:3000/api/chat';
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds

export function setupChatHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.CHAT_SEND_TEXT,
    async (_event, message: string): Promise<SendTextResponse> => {
      try {
        console.log('[IPC:chat:send-text] Sending message to gateway:', message);

        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        // POST to gateway
        const response = await fetch(GATEWAY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Handle non-200 responses
        if (!response.ok) {
          console.error('[IPC:chat:send-text] Gateway error:', response.status);
          return {
            success: false,
            error: `HTTP ${response.status}`,
          };
        }

        // Parse JSON response
        const data = await response.json();
        console.log('[IPC:chat:send-text] Gateway response received');

        return {
          success: true,
          data: { reply: data.response },
        };
      } catch (err) {
        // D-03: Never throw across IPC boundary - return Result type
        console.error('[IPC:chat:send-text] Error:', err);

        // Special handling for AbortError (timeout)
        if (err instanceof Error && err.name === 'AbortError') {
          return {
            success: false,
            error: 'Request timeout after 10 seconds',
          };
        }

        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );
}
