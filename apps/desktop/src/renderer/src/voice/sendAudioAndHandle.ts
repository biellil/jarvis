/**
 * sendAudioAndHandle — Phase 24 Plan 02 (D-07)
 *
 * Função pura async que encapsula o pipeline renderer-side audio → LLM → TTS.
 * Consumida por:
 *   - `ChatInput.tsx` (fluxo PTT) — substitui o bloco inline das linhas 75-124
 *   - `useWakeWord.ts` (fluxo wake word) — substitui o `void stopRecording()`
 *     que descartava os bytes na Phase 22
 *
 * Contrato (D-07 + D-08 + D-06):
 *   1. `setState('processing')` imediatamente
 *   2. Chama `window.jarvis.sendAudio(audioBuffer)`
 *   3. On success → `setState('responding')`, delega pra `handleAudioResponse`
 *      (que chama addHumanMessage + addAgentMessage ANTES do playTTS, então
 *      o texto sobrevive a falhas de TTS — D-06 graceful degrade)
 *   4. On error response →
 *      4a. Se o `error.code` é um dos 5 cenários D-08 (BACKEND_DOWN, LLM_TIMEOUT,
 *          MIC_MUTED, SILENT_STREAM, VAD_ERROR) → emite a string pt-BR EXATA
 *          do CONTEXT.md §D-08 linhas 103-109. As strings estão hardcoded aqui
 *          (não delegadas pra `lib/errorMessages.mapErrorCode`) porque elas são
 *          contrato Phase 24 locked — a suite Phase 24 é o regression guard.
 *      4b. Caso contrário, delega pra `handleAudioResponse` (mantém compat com
 *          códigos legados Phase 19.5: HTTP_500, NO_SPEECH, TTS_FAILED etc.)
 *   5. On thrown exception → toast genérico pt-BR + state cleanup
 *   6. INVARIANTE: `setState('idle')` é SEMPRE a última transição
 *      (garantido via `finally` block — testado nos 3 caminhos)
 *
 * Design: zero state interno, zero hooks. Deps injetadas para testabilidade
 * 100% pura. O hook `useVoiceRequest` foi explicitamente rejeitado em D-07
 * em favor dessa função (simplicidade + testabilidade).
 *
 * D-09 NOTE: AbortController com budgets per-stage (STT 15s / LLM 30s / TTS 10s)
 * foi deferido para WAKE-DEF-01. Esta função NÃO implementa timeout próprio;
 * o `window.jarvis.sendAudio` já aplica timeouts no main process (Phase 19.5).
 * Ver `.planning/REQUIREMENTS.md` WAKE-DEF-01 para detalhes da deferral.
 */
import type {
  SendAudioResponse,
  SendAudioError,
} from '../../../shared/ipc-types';
import type { OrbState } from '../../components/Orb/OrbContext';
import { handleAudioResponse, type ToastState } from './handleAudioResponse';
import { playTTSResponse } from '../audio/ttsPlayer';

export interface SendAudioAndHandleDeps {
  /** Orb state setter — transitions processing → responding → idle */
  setState: (state: OrbState) => void;
  /** Toast setter — pt-BR error messages on failure (D-08 contract) */
  setToast: (toast: ToastState | null) => void;
  /** Chat history: appends user transcription after STT (via handleAudioResponse) */
  addHumanMessage: (text: string) => void;
  /** Chat history: appends agent response BEFORE playTTS (D-06 degrade) */
  addAgentMessage: (text: string) => void;
  /** Phase 28 Plan 02 (D-02): Optional source tracking for telemetry/debug */
  source?: 'ptt' | 'wakeword' | 'followup';
}

/**
 * Mapa das 5 strings pt-BR EXATAS do CONTEXT.md §D-08 linhas 103-109.
 * Estas strings são contrato Phase 24 locked — qualquer mudança aqui DEVE
 * ser acompanhada de mudança no CONTEXT.md E aprovação do usuário.
 *
 * Os testes `sendAudioAndHandle.test.ts > D-08 exact pt-BR toast strings`
 * travam estas strings literalmente — drift quebra a suite imediatamente.
 */
const D08_STRINGS: Record<string, string> = {
  BACKEND_DOWN: 'JARVIS offline. Verifique o backend.',
  LLM_TIMEOUT: 'JARVIS demorou demais. Tente de novo.',
  MIC_MUTED: 'Microfone mudo — verifique permissões.',
  SILENT_STREAM: 'Não ouvi nada. Diga Hey JARVIS de novo.',
  VAD_ERROR: 'Erro na captura de áudio.',
};

/**
 * Reconhece códigos D-08 e emite o toast exato SEM delegar pra handleAudioResponse.
 * Retorna `true` se o código foi tratado (caller pula delegation).
 */
function tryHandleD08Error(
  error: SendAudioError,
  setToast: SendAudioAndHandleDeps['setToast'],
): boolean {
  const exact = D08_STRINGS[error.code];
  if (!exact) return false;

  console.error(`[sendAudioAndHandle] D-08 error: ${error.code}`, error.message);
  setToast({ message: exact, variant: 'error' });
  return true;
}

export async function sendAudioAndHandle(
  audioBuffer: Uint8Array,
  deps: SendAudioAndHandleDeps,
): Promise<void> {
  // Phase 28 Plan 02 (D-02): Log source for tracking/debug
  const source = deps.source ?? 'unknown';
  console.log(`[sendAudioAndHandle] processing audio from source: ${source}`);

  deps.setState('processing');
  try {
    const result: SendAudioResponse = await window.jarvis.sendAudio(audioBuffer);

    if (result.success) {
      deps.setState('responding');
      // handleAudioResponse chama addHumanMessage → addAgentMessage → playTTS.
      // Se playTTS falhar, o texto já está no histórico (D-06 degrade) e
      // handleAudioResponse emite warning toast.
      await handleAudioResponse(result, {
        addHumanMessage: deps.addHumanMessage,
        addAgentMessage: deps.addAgentMessage,
        setToast: deps.setToast,
        playTTS: playTTSResponse,
      });
      return;
    }

    // Error response path: tenta D-08 primeiro, delega pro legado se não casar.
    if (tryHandleD08Error(result.error, deps.setToast)) {
      return;
    }

    // Códigos legados (HTTP_500, NO_SPEECH, TTS_FAILED...) continuam indo
    // pelo `lib/errorMessages.mapErrorCode` via handleAudioResponse.
    await handleAudioResponse(result, {
      addHumanMessage: deps.addHumanMessage,
      addAgentMessage: deps.addAgentMessage,
      setToast: deps.setToast,
      playTTS: playTTSResponse,
    });
  } catch (err) {
    console.error('[sendAudioAndHandle] unexpected error:', err);
    deps.setToast({
      message: 'Erro inesperado ao enviar áudio.',
      variant: 'error',
    });
  } finally {
    // INVARIANTE: sempre retorna a idle. Previne orb travado em processing/
    // responding se qualquer chamada downstream jogar mid-flight.
    deps.setState('idle');
  }
}
