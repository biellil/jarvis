/**
 * handleAudioResponse — Plano 19_5-04
 *
 * Função pura que transforma uma `SendAudioResponse` no efeito observável:
 *  - success → insere HumanMessage + AIMessage, toca TTS (toast warning se o player falhar)
 *  - error   → exibe Toast pt-BR (variant `warning` se for TTS_FAILED, `error` caso contrário)
 *
 * Deps são injetadas para permitir testes 100% puros.
 */
import type { SendAudioResponse } from '../../../shared/ipc-types';
import { mapErrorCode, isRecoverableWithMessage } from '../lib/errorMessages';

export type ToastVariant = 'error' | 'warning' | 'info';

export interface ToastState {
  message: string;
  variant: ToastVariant;
}

export interface HandleAudioResponseDeps {
  addHumanMessage: (text: string) => void;
  addAgentMessage: (text: string) => void;
  setToast: (toast: ToastState | null) => void;
  playTTS: (base64: string, format: 'mp3' | 'wav') => Promise<void>;
}

export async function handleAudioResponse(
  response: SendAudioResponse,
  deps: HandleAudioResponseDeps,
): Promise<void> {
  if (response.success) {
    deps.addHumanMessage(response.data.transcription);
    deps.addAgentMessage(response.data.message);
    // Skip legacy playback when streaming TTS delivered audio via tts:chunk IPC.
    const isStreamingTurn = response.data.ttsProvider === 'streaming' || !response.data.audioBase64;
    if (!isStreamingTurn) {
      try {
        await deps.playTTS(response.data.audioBase64, response.data.audioFormat);
      } catch (err) {
        console.error('[handleAudioResponse] playTTS failed:', err);
        deps.setToast({
          message: 'Resposta pronta, mas não consegui tocar o áudio.',
          variant: 'warning',
        });
      }
    }
    return;
  }

  const { code, message } = response.error;
  deps.setToast({
    message: mapErrorCode(code, message),
    variant: isRecoverableWithMessage(code) ? 'warning' : 'error',
  });
}
