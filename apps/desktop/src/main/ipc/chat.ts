/**
 * Chat IPC Handlers — Fase 18.5 refactor.
 *
 * `chat:send-text` agora consome GET /api/chat/stream via sse-client:
 *   - tokens são acumulados num buffer e devolvidos como reply final no fim do stream
 *   - eventos `action` são despachados imediatamente pro actionExecutor
 *   - erros e timeout viram Result.error (nunca throw através do IPC)
 *
 * `chat:send-audio` mantém o comportamento anterior (POST /api/chat/audio
 * com retry) — a migração de audio pra SSE é deferida.
 *
 * Dependências são injetadas via `setupChatHandlers(deps)` pra permitir
 * testes chamando a função pura `handleSendText` sem precisar mockar ipcMain.
 */
import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  type SendTextResponse,
  type SendAudioResponse,
} from '../../shared/ipc-types';
import type { openChatStream as OpenChatStream } from '../sse-client';
import type { BackendConfig } from '../backend-client';
import type { ActionExecutor } from '../action-executor';

const GATEWAY_AUDIO_URL = 'http://localhost:3000/api/chat/audio';
const AUDIO_REQUEST_TIMEOUT_MS = 30000;
const SEND_TEXT_TIMEOUT_MS = 60000;

export interface ChatHandlerDeps {
  openStream: typeof OpenChatStream;
  config: BackendConfig;
  actionExecutor: ActionExecutor;
}

/**
 * Pure handler — testável sem ipcMain.
 * Abre o stream SSE, acumula tokens, despacha actions, devolve reply final.
 */
export async function handleSendText(
  message: string,
  deps: ChatHandlerDeps,
): Promise<SendTextResponse> {
  const tokens: string[] = [];
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    SEND_TEXT_TIMEOUT_MS,
  );

  let streamError: Error | null = null;

  try {
    await deps.openStream({
      url: `${deps.config.backendUrl}/api/chat/stream`,
      apiKey: deps.config.apiKey,
      message,
      onToken: (token) => {
        tokens.push(token);
      },
      onAction: (payload) => {
        try {
          deps.actionExecutor.enqueue(payload);
        } catch (err) {
          console.error('[IPC:chat:send-text] enqueue failed:', err);
        }
      },
      onEnd: () => {
        /* noop — resolve da promise encerra o fluxo */
      },
      onError: (err) => {
        // Guarda o primeiro erro; sse-client tenta reconectar em erros
        // transitivos e só resolve a promise quando o stream fecha.
        if (!streamError) streamError = err;
      },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        success: false,
        error: `Request timeout after ${SEND_TEXT_TIMEOUT_MS / 1000} seconds`,
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }

  clearTimeout(timeoutId);

  if (controller.signal.aborted && tokens.length === 0) {
    return {
      success: false,
      error: `Request timeout after ${SEND_TEXT_TIMEOUT_MS / 1000} seconds`,
    };
  }

  if (streamError && tokens.length === 0) {
    return {
      success: false,
      error: (streamError as Error).message,
    };
  }

  return {
    success: true,
    data: { reply: tokens.join('') },
  };
}

async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  maxAttempts = 3,
  delays = [0, 1000, 3000],
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (!shouldRetry(err) || attempt === maxAttempts - 1) throw err;
      const baseDelay = delays[attempt] || delays[delays.length - 1];
      const jitter = baseDelay * 0.1 * (Math.random() * 2 - 1);
      const delay = baseDelay + jitter;
      console.log(
        `[IPC:chat] Retry attempt ${attempt + 1} after ${delay.toFixed(0)}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export function setupChatHandlers(deps: ChatHandlerDeps): void {
  ipcMain.handle(
    IPC_CHANNELS.CHAT_SEND_TEXT,
    async (_event, message: string): Promise<SendTextResponse> => {
      console.log('[IPC:chat:send-text] Streaming message to backend:', message);
      return handleSendText(message, deps);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.CHAT_SEND_AUDIO,
    async (_event, audioBuffer: Buffer): Promise<SendAudioResponse> => {
      try {
        console.log(
          '[IPC:chat:send-audio] Sending audio to gateway:',
          audioBuffer.length,
          'bytes',
        );
        const result = await retryWithBackoff(
          async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(
              () => controller.abort(),
              AUDIO_REQUEST_TIMEOUT_MS,
            );
            try {
              const formData = new FormData();
              const audioBlob = new Blob([audioBuffer as unknown as BlobPart], {
                type: 'audio/wav',
              });
              formData.append('audio', audioBlob, 'recording.wav');
              const response = await fetch(GATEWAY_AUDIO_URL, {
                method: 'POST',
                body: formData,
                signal: controller.signal,
              });
              clearTimeout(timeoutId);
              if (!response.ok) {
                const errorText = await response.text();
                console.error(
                  '[IPC:chat:send-audio] Gateway error:',
                  response.status,
                  errorText,
                );
                const error: Error & { status?: number } = new Error(
                  `HTTP ${response.status}`,
                );
                error.status = response.status;
                throw error;
              }
              return await response.json();
            } finally {
              clearTimeout(timeoutId);
            }
          },
          (err: unknown) => {
            const status = (err as { status?: number })?.status;
            if (status && status >= 400 && status < 500) {
              console.log(
                '[IPC:chat:send-audio] Not retrying 4xx error:',
                status,
              );
              return false;
            }
            return true;
          },
        );
        return { success: true, data: { reply: result.response } };
      } catch (err) {
        console.error('[IPC:chat:send-audio] Error:', err);
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
    },
  );
}
