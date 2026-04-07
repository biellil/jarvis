/**
 * Chat IPC Handlers
 * D-01: Centralized in ipc/ organized by feature
 * D-03: Returns Result type, never throws
 * D-04: sendText calls gateway HTTP endpoint
 * D-13: sendAudio with retry logic (3 attempts, jitter)
 */
import { ipcMain } from 'electron';
import { IPC_CHANNELS, type SendTextResponse, type SendAudioResponse } from '../../shared/ipc-types';

// Gateway URLs - not hardcoded, could be made configurable
const GATEWAY_URL = 'http://localhost:3000/api/chat';
const GATEWAY_AUDIO_URL = 'http://localhost:3000/api/chat/audio';
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds
const AUDIO_REQUEST_TIMEOUT_MS = 30000; // 30 seconds for audio uploads

/**
 * Helper: Retry logic with exponential backoff and jitter
 * D-13: 3 attempts, delays [0, 1000, 3000] with jitter
 * Pitfall 4: Don't retry 4xx errors (client errors)
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  maxAttempts = 3,
  delays = [0, 1000, 3000]
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;

      // Check if we should retry
      if (!shouldRetry(err) || attempt === maxAttempts - 1) {
        throw err;
      }

      // Add jitter (±10%) to delay
      const baseDelay = delays[attempt] || delays[delays.length - 1];
      const jitter = baseDelay * 0.1 * (Math.random() * 2 - 1);
      const delay = baseDelay + jitter;

      console.log(`[IPC:chat] Retry attempt ${attempt + 1} after ${delay.toFixed(0)}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export function setupChatHandlers(): void {
  // Text message handler
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

  // Audio message handler with retry
  ipcMain.handle(
    IPC_CHANNELS.CHAT_SEND_AUDIO,
    async (_event, audioBuffer: Buffer): Promise<SendAudioResponse> => {
      try {
        console.log('[IPC:chat:send-audio] Sending audio to gateway:', audioBuffer.length, 'bytes');

        // D-13: Retry logic with 3 attempts
        const result = await retryWithBackoff(
          async () => {
            // Create AbortController for timeout (30 seconds for audio)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), AUDIO_REQUEST_TIMEOUT_MS);

            try {
              // Create FormData with audio file
              const formData = new FormData();
              const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
              formData.append('audio', audioBlob, 'recording.wav');

              // POST to gateway
              const response = await fetch(GATEWAY_AUDIO_URL, {
                method: 'POST',
                body: formData,
                signal: controller.signal,
              });

              clearTimeout(timeoutId);

              // Handle non-200 responses
              if (!response.ok) {
                const errorText = await response.text();
                console.error('[IPC:chat:send-audio] Gateway error:', response.status, errorText);

                // Create error object with status for retry logic
                const error: any = new Error(`HTTP ${response.status}`);
                error.status = response.status;
                throw error;
              }

              // Parse JSON response
              const data = await response.json();
              console.log('[IPC:chat:send-audio] Gateway response received');

              return data;
            } finally {
              clearTimeout(timeoutId);
            }
          },
          // Pitfall 4: Don't retry 4xx errors (client errors)
          (err: any) => {
            // Only retry network errors and 5xx server errors
            if (err.status && err.status >= 400 && err.status < 500) {
              console.log('[IPC:chat:send-audio] Not retrying 4xx error:', err.status);
              return false;
            }
            return true;
          }
        );

        return {
          success: true,
          data: { reply: result.response },
        };
      } catch (err) {
        // D-03: Never throw across IPC boundary - return Result type
        console.error('[IPC:chat:send-audio] Error:', err);

        // Special handling for AbortError (timeout)
        if (err instanceof Error && err.name === 'AbortError') {
          return {
            success: false,
            error: 'Request timeout after 30 seconds',
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
