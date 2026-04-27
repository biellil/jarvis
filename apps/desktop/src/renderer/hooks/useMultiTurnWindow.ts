/**
 * useMultiTurnWindow — Phase 28 Plan 02 (MTURN-01/02/03)
 *
 * React hook que orquestra a janela de follow-up após TTS — permite usuário
 * continuar conversando sem repetir "Hey JARVIS" durante N segundos
 * (default 8s, configurável via VITE_MULTI_TURN_WINDOW_MS).
 *
 * **Arquitetura (D-01 + D-13):**
 * - Reusa VAD do useWakeWord — mesma MicVAD instance, sem re-prompt de mic
 * - Trigger via registerTTSHooks afterPlay callback
 * - Timer de N segundos com pause/resume em window blur/focus (D-06)
 * - Cancelamento imediato ao detectar início de fala (D-03)
 *
 * **Estado visual (MTURN-03):**
 * - Transição responding → (200-300ms delay) → awaiting-followup (D-16)
 * - Sky-400 pulsação lenta (Phase 28 Plan 01 implementou visual)
 * - Timeout silencioso → idle sem toast (D-05)
 *
 * **Wake word coordination (D-04):**
 * - Wake word engine fica pausado durante awaiting-followup
 * - Handled by existing state gate in useWakeWord (state !== 'idle' → suspend)
 *
 * **Error handling (D-15):**
 * - sendAudioAndHandle trata erros — non-throw, always ends in setState('idle')
 * - Sem lógica adicional needed neste hook
 *
 * NÃO monte esse hook fora do OrbProvider — useOrbContext() dá throw.
 */
import { useEffect, useRef } from 'react';
import type { MicVAD } from '@ricky0123/vad-web';
import { useOrbContext } from '../components/Orb/OrbContext';
import { useChat } from '../src/chat/ChatContext';
import { sendAudioAndHandle } from '../src/voice/sendAudioAndHandle';
import { encodeFloat32ToWav } from '../src/voice/encodeFloat32ToWav';
import { registerTTSHooks } from '../src/audio/ttsPlayer';

export interface UseMultiTurnWindowOptions {
  /** VAD instance from useWakeWord (shared MediaStream, no re-prompt) */
  vadInstance: MicVAD | null;
  /** Is multi-turn enabled (env flag check) */
  enabled: boolean;
  /** Window duration in ms (from VITE_MULTI_TURN_WINDOW_MS, default 8000) */
  windowMs: number;
}

/**
 * D-16: 200-300ms delay before opening window (natural conversation respiro).
 * Delay entre TTS terminar e janela abrir reflete pausa natural em conversas
 * humanas — não é latência, é UX intencional.
 */
const WINDOW_DELAY_MS = 250;

export function useMultiTurnWindow(options: UseMultiTurnWindowOptions): void {
  const { setState } = useOrbContext();
  const { addHumanMessage, addAgentMessage, setToast } = useChat();

  // D-01: Reusa VAD do useWakeWord (shared MediaStream, no re-prompt)
  const vadRef = useRef<MicVAD | null>(null);
  vadRef.current = options.vadInstance;

  // D-03: Timer da janela de follow-up (cancelado ao detectar speech start)
  const windowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // D-06: Pause/resume timer on window blur/focus
  const remainingTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);

  // Refs espelhados das deps do ChatContext (pattern from useWakeWord)
  const addHumanMessageRef = useRef(addHumanMessage);
  addHumanMessageRef.current = addHumanMessage;
  const addAgentMessageRef = useRef(addAgentMessage);
  addAgentMessageRef.current = addAgentMessage;
  const setToastRef = useRef(setToast);
  setToastRef.current = setToast;
  const setStateRef = useRef(setState);
  setStateRef.current = setState;

  // D-06: Pause timer on window blur
  useEffect(() => {
    const handleBlur = () => {
      if (windowTimeoutRef.current) {
        clearTimeout(windowTimeoutRef.current);
        const now = Date.now();
        pausedAtRef.current = now;
        console.log('[multiTurnWindow] paused timer on blur');
      }
    };

    const handleFocus = () => {
      if (pausedAtRef.current > 0 && remainingTimeRef.current > 0) {
        const elapsed = Date.now() - pausedAtRef.current;
        const remaining = Math.max(0, remainingTimeRef.current - elapsed);
        console.log('[multiTurnWindow] resuming timer on focus, remaining:', remaining, 'ms');

        if (remaining > 0) {
          // Resume timer with remaining duration
          windowTimeoutRef.current = setTimeout(() => {
            console.log('[multiTurnWindow] timeout expired (silent fallback)');
            // D-05: Fade suave sem toast — silent timeout transition
            setStateRef.current('idle');
            void vadRef.current?.pause();
            remainingTimeRef.current = 0;
          }, remaining);
          remainingTimeRef.current = remaining;
        } else {
          // Timer já expirou durante blur — fechar janela silenciosamente
          setStateRef.current('idle');
          void vadRef.current?.pause();
        }

        pausedAtRef.current = 0;
      }
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // D-14: Trigger mechanism — registerTTSHooks afterPlay callback
  useEffect(() => {
    registerTTSHooks({
      afterPlay: async () => {
        if (!options.enabled) {
          console.log('[multiTurnWindow] disabled via config — skipping');
          return;
        }

        if (vadRef.current === null) {
          console.log('[multiTurnWindow] VAD not available — skipping');
          return;
        }

        // D-16: 250ms delay before opening window (respiro natural)
        setTimeout(() => {
          console.log('[multiTurnWindow] opening follow-up window for', options.windowMs, 'ms');
          setStateRef.current('awaiting-followup');

          // D-01: Reuse VAD from useWakeWord
          const vad = vadRef.current;
          if (!vad) {
            console.warn('[multiTurnWindow] VAD became null during delay — aborting');
            return;
          }

          // Configure VAD callbacks for follow-up window
          // Store original callbacks to restore later
          const originalOnSpeechStart = vad.onSpeechStart;
          const originalOnSpeechEnd = vad.onSpeechEnd;

          vad.onSpeechStart = () => {
            console.log('[multiTurnWindow] speech detected — canceling timeout');
            // D-03: Cancel timer immediately when VAD detects speech start
            if (windowTimeoutRef.current) {
              clearTimeout(windowTimeoutRef.current);
              windowTimeoutRef.current = null;
              remainingTimeRef.current = 0;
            }
            // Transition to listening state
            setStateRef.current('listening');
            // Call original handler if it exists
            originalOnSpeechStart?.();
          };

          vad.onSpeechEnd = async (audio: Float32Array) => {
            console.log('[multiTurnWindow] speech end, samples:', audio.length);

            // Pause VAD before network call
            void vadRef.current?.pause();

            // Encode audio to WAV
            const wavBytes = encodeFloat32ToWav(audio, 16000);

            // D-02: Source tracking ('followup') for telemetry/debug
            await sendAudioAndHandle(wavBytes, {
              setState: setStateRef.current,
              setToast: setToastRef.current,
              addHumanMessage: addHumanMessageRef.current,
              addAgentMessage: addAgentMessageRef.current,
              source: 'followup', // D-02: track follow-up source
            });

            // Restore original callbacks
            if (vadRef.current) {
              vadRef.current.onSpeechStart = originalOnSpeechStart;
              vadRef.current.onSpeechEnd = originalOnSpeechEnd;
            }
          };

          // Start VAD
          void vad.start();

          // D-05: Silent timeout fallback
          remainingTimeRef.current = options.windowMs;
          windowTimeoutRef.current = setTimeout(() => {
            console.log('[multiTurnWindow] timeout expired (silent fallback)');
            setStateRef.current('idle');
            void vadRef.current?.pause();
            remainingTimeRef.current = 0;

            // Restore original callbacks
            if (vadRef.current) {
              vadRef.current.onSpeechStart = originalOnSpeechStart;
              vadRef.current.onSpeechEnd = originalOnSpeechEnd;
            }
          }, options.windowMs);
        }, WINDOW_DELAY_MS);
      },
    });

    // Cleanup on unmount
    return () => {
      if (windowTimeoutRef.current) {
        clearTimeout(windowTimeoutRef.current);
        windowTimeoutRef.current = null;
      }
      // Quick 260427-qzg: desregistra afterPlay no unmount. Sem isso, o
      // callback registrado em registerTTSHooks fica "fantasma" no módulo
      // singleton ttsPlayer e continua disparando — abrindo janela VAD após
      // resposta PTT mesmo com o componente desmontado, gerando transcrição
      // " e aí" ao gateway.
      registerTTSHooks({});
    };
  }, [options.enabled, options.windowMs]);
}
