/**
 * useWakeWord — Phase 22 Plan 04 (Wave 3 integration)
 *
 * React hook que monta o `WakeWordEngine` (Plan 02) no runtime do renderer,
 * gated pelo `OrbContext` (state === 'idle'), wireado ao `voiceInputManager`
 * (Plan 01), com pause/resume durante TTS playback via `registerTTSHooks`,
 * e VAD timeout de 3000ms pós-detecção (WAKE-06).
 *
 * Requirements cobertos:
 * - WAKE-01: latência ≤500ms (checkpoint manual, infra ready via
 *   backgroundThrottling:false + single-thread wasm)
 * - WAKE-05: ciclo completo idle→listening→processing→responding→idle,
 *   engine retoma automaticamente quando state volta para 'idle'
 * - WAKE-06: VAD timeout 3000ms — se usuário fica mudo pós-wake, aborta
 * - WAKE-07: PTT preemption — acquire('wakeword') rejeitado se PTT ativo
 * - WAKE-08: degrade path — getUserMedia fail NÃO crasha, PTT continua
 * - WAKE-09: zero network no engine (garantido por Plan 02 invariant)
 *
 * Gate anti TTS self-trigger (duas camadas):
 *  1. `stateRef.current === 'idle'` no onDetected — quando orb está em
 *     responding (TTS tocando), a detecção é ignorada.
 *  2. `registerTTSHooks({ beforePlay, afterPlay })` — suspende o engine
 *     antes do source.start() e resume 300ms após onended (tail).
 *
 * NÃO monte esse hook fora do OrbProvider — useOrbContext() dá throw.
 */
import { useEffect, useRef, useState } from 'react';
import { useOrbContext } from '../components/Orb/OrbContext';
import { useAudioRecorder } from './useAudioRecorder';
import { WakeWordEngine } from '../src/voice/wakeWord/WakeWordEngine';
import { loadWakeWordSessions } from '../src/voice/wakeWord/modelLoader';
import { voiceInputManager } from '../src/voice/voiceInputManager';
import { registerTTSHooks } from '../src/audio/ttsPlayer';

export interface UseWakeWordState {
  status: 'loading' | 'active' | 'unavailable' | 'error';
  error?: string;
}

/**
 * Lê um import.meta.env var com fallback seguro. Defensive access —
 * import.meta.env pode ser undefined em happy-dom test environments.
 */
function readEnv(key: string, fallback: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (import.meta as any)?.env;
    if (env && typeof env[key] === 'string') return env[key];
  } catch {
    /* noop */
  }
  return fallback;
}

export function useWakeWord(): UseWakeWordState {
  const { state, setState } = useOrbContext();
  const audioRecorder = useAudioRecorder();
  const engineRef = useRef<WakeWordEngine | null>(null);
  const stateRef = useRef(state);
  const vadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hookState, setHookState] = useState<UseWakeWordState>({ status: 'loading' });

  // Keep stateRef in sync for the onDetected closure — precisa ser uma
  // assignment imediato e não um effect, porque o onDetected pode disparar
  // antes do effect rodar após re-render.
  stateRef.current = state;

  // Boot engine (uma vez no mount)
  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        if (readEnv('VITE_WAKE_WORD_ENABLED', 'true') === 'false') {
          setHookState({ status: 'unavailable', error: 'Disabled via env (VITE_WAKE_WORD_ENABLED=false)' });
          return;
        }

        const bytes = await window.jarvis.wakeWord.loadModels();
        if (cancelled) return;

        const sessions = await loadWakeWordSessions(bytes);
        if (cancelled) return;

        const threshold = parseFloat(readEnv('VITE_WAKE_WORD_THRESHOLD', '0.5'));
        const vadTimeoutMs = parseInt(readEnv('VITE_WAKE_WORD_VAD_TIMEOUT_MS', '3000'), 10);

        const engine = new WakeWordEngine({
          threshold,
          debounceMs: 2000,
          vadThreshold: 0.3,
          onDetected: (score: number) => {
            // GATE 1: orb precisa estar em idle (anti TTS self-trigger)
            if (stateRef.current !== 'idle') {
              console.log('[wakeWord] ignored — orb state:', stateRef.current);
              return;
            }
            // GATE 2: voiceInputManager precisa conceder
            const grant = voiceInputManager.acquire('wakeword');
            if ('error' in grant) {
              console.log('[wakeWord] ignored — voiceInputManager:', grant.error);
              return;
            }
            console.log('[wakeWord] detected score=', score);
            setState('listening');
            void audioRecorder.startRecording();

            // Arma VAD timeout — WAKE-06. Se o usuário não disser nada em
            // vadTimeoutMs, abortamos e retornamos para idle.
            if (vadTimeoutRef.current) clearTimeout(vadTimeoutRef.current);
            vadTimeoutRef.current = setTimeout(() => {
              console.log('[wakeWord] VAD timeout — returning to idle');
              void audioRecorder.stopRecording();
              voiceInputManager.release('wakeword');
              setState('idle');
              vadTimeoutRef.current = null;
            }, vadTimeoutMs);
          },
          onSilentStream: () => {
            console.warn('[wakeWord] silent stream detected — mic may be muted');
            setHookState({
              status: 'unavailable',
              error: 'Mic captando silêncio — verifique permissões',
            });
          },
        });

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: false,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        await engine.start(sessions, stream);
        if (cancelled) {
          await engine.stop();
          return;
        }

        engineRef.current = engine;
        setHookState({ status: 'active' });
        console.log('[wakeWord] engine started — threshold:', threshold, 'vadTimeoutMs:', vadTimeoutMs);
      } catch (err) {
        console.error('[useWakeWord] boot failed — degrading to PTT-only', err);
        const msg = err instanceof Error ? err.message : String(err);
        setHookState({ status: 'unavailable', error: msg });
        // TODO Phase 23: broadcast para tray indicator (WAKE-03/WAKE-08 visual)
      }
    };

    void boot();

    return () => {
      cancelled = true;
      if (vadTimeoutRef.current) {
        clearTimeout(vadTimeoutRef.current);
        vadTimeoutRef.current = null;
      }
      void engineRef.current?.stop();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Orb state gate (suspend/resume) — WAKE-05 full cycle.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (state === 'idle') {
      void engine.resume();
    } else {
      void engine.suspend();
      // Se saiu de idle por outro motivo (PTT, etc), limpa VAD timeout.
      if (vadTimeoutRef.current) {
        clearTimeout(vadTimeoutRef.current);
        vadTimeoutRef.current = null;
      }
    }
  }, [state]);

  // TTS hooks — belt-and-braces anti self-trigger.
  useEffect(() => {
    registerTTSHooks({
      beforePlay: async () => {
        await engineRef.current?.suspend();
      },
      afterPlay: async () => {
        // O 300ms tail já é aplicado dentro do ttsPlayer — aqui apenas
        // resumimos o engine. Se estiver null (boot ainda rolando ou
        // já desmontado), é no-op seguro.
        await engineRef.current?.resume();
      },
    });
    return () => {
      registerTTSHooks({});
    };
  }, []);

  return hookState;
}
