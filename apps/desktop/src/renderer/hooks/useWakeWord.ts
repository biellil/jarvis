/**
 * useWakeWord — Phase 22 Plan 04 + Phase 23 Plan 02 + Phase 24 Plan 04
 *
 * React hook que monta o `WakeWordEngine` (Phase 22 Plan 02) no runtime do
 * renderer, gated pelo `OrbContext` (state === 'idle'), wireado ao
 * `voiceInputManager` (Phase 22 Plan 01), com pause/resume durante TTS
 * playback via `registerTTSHooks`.
 *
 * **Phase 24 Plan 04 — FECHA O GAP EXISTENCIAL DA PHASE 22.**
 * Antes: após detecção, o hook rodava um MediaRecorder via o hook de
 * recording e esperava um setTimeout(vadTimeoutMs=3000) fixo. No timeout,
 * chamava stop() fire-and-forget — DESCARTANDO OS BYTES CAPTURADOS. O
 * áudio do usuário nunca chegava ao backend. Era um loop fechado.
 *
 * Agora: após detecção, o hook inicia `MicVAD` (@ricky0123/vad-web) que
 * reusa o mesmo MediaStream do engine (A6 — sem re-prompt de mic). Quando
 * o VAD detecta `onSpeechEnd`, o Float32Array é encodado via
 * `encodeFloat32ToWav` e passado para `sendAudioAndHandle` — a mesma
 * função que o fluxo PTT usa (D-07, WAKE-13). Um timer fallback de 6s
 * (D-03, `VITE_WAKE_WORD_MAX_RECORDING_MS`) aborta se o VAD nunca
 * detectar fala alguma (mic mudo, usuário silencioso).
 *
 * Requirements cobertos:
 * - WAKE-01: latência ≤500ms (checkpoint manual, infra ready)
 * - WAKE-05: ciclo completo idle→listening→processing→responding→idle
 *   (AGORA com áudio realmente chegando ao backend)
 * - WAKE-06: VAD REAL substitui o timeout fixo (Phase 22 usou 3s fixo)
 * - WAKE-07: PTT preemption — acquire('wakeword') rejeitado se PTT ativo
 * - WAKE-08: degrade path — getUserMedia fail NÃO crasha, PTT continua
 * - WAKE-09: zero network no engine (garantido por Phase 22 Plan 02)
 * - WAKE-10: backend error recovery — sendAudioAndHandle trata D-08 codes
 * - WAKE-11: orb state consistency — sendAudioAndHandle invariante idle
 * - WAKE-13: shared pipeline — sendAudioAndHandle compartilhado com PTT
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
import { MicVAD } from '@ricky0123/vad-web';
import { useOrbContext } from '../components/Orb/OrbContext';
import { WakeWordEngine } from '../src/voice/wakeWord/WakeWordEngine';
import { loadWakeWordSessions } from '../src/voice/wakeWord/modelLoader';
import { voiceInputManager } from '../src/voice/voiceInputManager';
import { registerTTSHooks } from '../src/audio/ttsPlayer';
import { sendAudioAndHandle } from '../src/voice/sendAudioAndHandle';
import { encodeFloat32ToWav } from '../src/voice/encodeFloat32ToWav';
import { useChat } from '../src/chat/ChatContext';

export interface UseWakeWordState {
  status: 'loading' | 'active' | 'unavailable' | 'error';
  error?: string;
  /** Phase 28 Plan 02: VAD instance exposed for useMultiTurnWindow (D-01) */
  vadInstance: MicVAD | null;
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

/**
 * Delay entre burst animation e transição para listening (D-02 + ORB-POL-02).
 * 350ms matches o BURST_DURATION_MS do OrbContext.tsx — animação completa
 * antes do orb virar laranja.
 */
const WAKE_BURST_TO_LISTENING_DELAY_MS = 350;

/**
 * Detecta prefers-reduced-motion do usuário. Quando true, pulamos o delay
 * do burst porque o usuário não verá a animação mesmo — manter o setTimeout
 * seria apenas latência percebida sem payoff visual (D-05 bypass).
 */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches === true
  );
}

export function useWakeWord(): UseWakeWordState {
  const {
    state,
    setState,
    wakeWordPaused,
    setWakeWordPaused,
    triggerWakeBurst,
  } = useOrbContext();
  // Phase 24 Plan 04: ChatContext wire para alimentar sendAudioAndHandle
  // com addHumanMessage / addAgentMessage / setToast no onSpeechEnd do VAD.
  const { addHumanMessage, addAgentMessage, setToast } = useChat();
  const engineRef = useRef<WakeWordEngine | null>(null);
  const stateRef = useRef(state);
  // Phase 24 Plan 04: VAD instance + fallback timer. `vadMaxTimeoutRef`
  // substitui o `vadTimeoutRef` da Phase 22 (que era o timeout fixo de 3s).
  const vadRef = useRef<MicVAD | null>(null);
  const vadMaxTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Phase 23 Plan 02 — ref espelho do paused state (usado nos closures do
  // onDetected e nos hooks TTS, que precisam ler o valor live em vez do
  // closure congelado no mount).
  const wakeWordPausedRef = useRef(wakeWordPaused);
  wakeWordPausedRef.current = wakeWordPaused;
  // 22-GAP-10: flag pra distinguir state transitions triggered por wake word
  // detection (queremos MANTER o VAD timeout) de transitions por outros meios
  // (PTT, etc — aí sim queremos cancelar o VAD timeout).
  const wakeTriggeredListeningRef = useRef(false);
  const [hookState, setHookState] = useState<UseWakeWordState>({ status: 'loading' });

  // Keep stateRef in sync for the onDetected closure — precisa ser uma
  // assignment imediato e não um effect, porque o onDetected pode disparar
  // antes do effect rodar após re-render.
  stateRef.current = state;

  // Refs espelhados das deps do ChatContext — o onSpeechEnd do VAD é um
  // closure congelado no boot, mas precisa ler os handlers LIVE do contexto.
  const addHumanMessageRef = useRef(addHumanMessage);
  addHumanMessageRef.current = addHumanMessage;
  const addAgentMessageRef = useRef(addAgentMessage);
  addAgentMessageRef.current = addAgentMessage;
  const setToastRef = useRef(setToast);
  setToastRef.current = setToast;
  const setStateRef = useRef(setState);
  setStateRef.current = setState;

  // Boot engine (uma vez no mount)
  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        if (readEnv('VITE_WAKE_WORD_ENABLED', 'true') === 'false') {
          setHookState({ status: 'unavailable', error: 'Disabled via env (VITE_WAKE_WORD_ENABLED=false)' });
          // Env flag vira paused=true no OrbContext — unifica semântica
          setWakeWordPaused(true);
          return;
        }

        // Phase 23 Plan 02 (D-06): Read initial paused state from store
        const initialPaused = await window.jarvis.wakeWord.getPaused();
        if (cancelled) return;
        setWakeWordPaused(initialPaused);

        const bytes = await window.jarvis.wakeWord.loadModels();
        if (cancelled) return;

        const sessions = await loadWakeWordSessions(bytes);
        if (cancelled) return;

        const threshold = parseFloat(readEnv('VITE_WAKE_WORD_THRESHOLD', '0.5'));
        // Phase 24 Plan 04 (D-03): absolute fallback recording timeout
        // substitui o antigo `vadTimeoutMs` fixo de 3s da Phase 22.
        const maxRecordingMs = parseInt(
          readEnv('VITE_WAKE_WORD_MAX_RECORDING_MS', '6000'),
          10,
        );

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
            // GATE 2 (Phase 23 Plan 02): kill switch do tray
            if (wakeWordPausedRef.current) {
              console.log('[wakeWord] ignored — paused via tray');
              return;
            }
            // GATE 3: voiceInputManager precisa conceder
            const grant = voiceInputManager.acquire('wakeword');
            if ('error' in grant) {
              console.log('[wakeWord] ignored — voiceInputManager:', grant.error);
              return;
            }
            console.log('[wakeWord] detected score=', score);

            // D-02: dispara a burst animation ANTES da transição pra listening
            triggerWakeBurst();

            const proceed = () => {
              // 22-GAP-10: seta flag ANTES de setState pra que o useEffect
              // do state gate não limpe o VAD timeout quando re-renderizar.
              wakeTriggeredListeningRef.current = true;
              setState('listening');

              // Phase 24 Plan 04: inicia VAD real (substitui o MediaRecorder
              // start + setTimeout(vadTimeoutMs) fixo da Phase 22 que
              // descartava os bytes fire-and-forget no fim do timer).
              const vad = vadRef.current;
              if (!vad) {
                console.warn('[wakeWord] VAD not initialized — aborting capture');
                voiceInputManager.release('wakeword');
                wakeTriggeredListeningRef.current = false;
                setState('idle');
                return;
              }
              void vad.start();

              // D-03: fallback absoluto. Se o Silero VAD nunca detectar
              // fala nenhuma (mic mudo, usuário silencioso), aborta após
              // maxRecordingMs com toast pt-BR e volta pra idle.
              if (vadMaxTimeoutRef.current) clearTimeout(vadMaxTimeoutRef.current);
              vadMaxTimeoutRef.current = setTimeout(() => {
                // 22-GAP-10 safety check: se PTT preemptou durante nossa espera,
                // NÃO mexer no state (PTT tá no controle).
                if (voiceInputManager.getCurrentSource() !== 'wakeword') {
                  console.log('[wakeWord] VAD max timeout ignored — source is now:', voiceInputManager.getCurrentSource());
                  vadMaxTimeoutRef.current = null;
                  wakeTriggeredListeningRef.current = false;
                  return;
                }
                console.log('[wakeWord] VAD max timeout — no speech detected in', maxRecordingMs, 'ms');
                void vadRef.current?.pause();
                setToastRef.current({
                  message: 'Não ouvi nada. Diga Hey JARVIS de novo.',
                  variant: 'warning',
                });
                voiceInputManager.release('wakeword');
                wakeTriggeredListeningRef.current = false;
                setState('idle');
                vadMaxTimeoutRef.current = null;
              }, maxRecordingMs);
            };

            // D-05 bypass: reduced-motion pula o delay, evita latência
            // percebida sem payoff visual
            if (prefersReducedMotion()) {
              proceed();
            } else {
              setTimeout(proceed, WAKE_BURST_TO_LISTENING_DELAY_MS);
            }
          },
          onSilentStream: () => {
            console.warn('[wakeWord] silent stream detected — mic may be muted');
            setHookState({
              status: 'unavailable',
              error: 'Mic captando silêncio — verifique permissões',
            });
          },
        });

        console.log('[useWakeWord] requesting mic via getUserMedia...');
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

        // 22-GAP-07: log do estado do stream pra confirmar que o mic tá vivo.
        // Se track.readyState !== 'live' OU track.muted === true, a permissão
        // foi concedida mas o mic não tá capturando áudio real.
        const tracks = stream.getAudioTracks();
        console.log('[useWakeWord] mic stream OK —', {
          tracks: tracks.length,
          live: tracks[0]?.readyState,
          muted: tracks[0]?.muted,
          label: tracks[0]?.label,
          settings: tracks[0]?.getSettings?.(),
        });

        await engine.start(sessions, stream);
        if (cancelled) {
          await engine.stop();
          return;
        }

        // Phase 24 Plan 04: MicVAD para detecção de boundary de fala pós
        // wake-word. A6 resolution: reusa o mesmo MediaStream do engine
        // (sem segundo prompt de mic). Começa PAUSADO — só roda após
        // wake word detectar. D-02 + A1: confia nos defaults da lib
        // (positiveSpeechThreshold 0.3, negativeSpeechThreshold 0.25,
        // redemptionMs 1400, preSpeechPadMs 800, minSpeechMs 400).
        const vad = await MicVAD.new({
          baseAssetPath: '/vad/',
          onnxWASMBasePath: '/ort/', // reusa Phase 22 ortWasmPlugin — sem duplicar wasm
          model: 'legacy',
          // A6: reutiliza o MediaStream existente sem re-prompt de mic.
          getStream: async () => stream,
          // Override CRÍTICO: o default `pauseStream` da lib chama
          // `track.stop()` em TODAS as tracks, matando o stream
          // compartilhado com o WakeWordEngine. No-op aqui — o engine
          // segue dono do lifecycle do stream.
          pauseStream: async () => {
            /* no-op — stream é compartilhado com WakeWordEngine */
          },
          resumeStream: async () => stream,
          onSpeechStart: () => {
            console.log('[wakeWord] VAD speech start');
          },
          onSpeechEnd: async (audio: Float32Array) => {
            console.log('[wakeWord] VAD speech end, samples:', audio.length);

            // Limpa o fallback de 6s — boundary real detectado.
            if (vadMaxTimeoutRef.current) {
              clearTimeout(vadMaxTimeoutRef.current);
              vadMaxTimeoutRef.current = null;
            }

            // Pausa o VAD antes do await da rede (libera CPU do worklet).
            void vadRef.current?.pause();

            // A4 / Opção A: Float32 16kHz PCM → WAV pro window.jarvis.sendAudio.
            const wavBytes = encodeFloat32ToWav(audio, 16000);

            // Shared pipeline — mesma função que PTT usa via ChatInput
            // (WAKE-13). sendAudioAndHandle é garantido non-throw e
            // sempre termina em setState('idle') (Phase 24 Plan 02).
            await sendAudioAndHandle(wavBytes, {
              setState: setStateRef.current,
              setToast: setToastRef.current,
              addHumanMessage: addHumanMessageRef.current,
              addAgentMessage: addAgentMessageRef.current,
              source: 'wakeword', // Phase 28 Plan 02 (D-02): source tracking
            });

            // Limpa ownership do wake word — voiceInputManager + flag interna.
            voiceInputManager.release('wakeword');
            wakeTriggeredListeningRef.current = false;
          },
          onVADMisfire: () => {
            console.log('[wakeWord] VAD misfire (speech too short)');
          },
        });
        if (cancelled) {
          void vad.pause();
          return;
        }
        // Começa PAUSADO — só ativa após wake word detectar.
        void vad.pause();
        vadRef.current = vad;

        engineRef.current = engine;
        setHookState({ status: 'active' });
        console.log(
          '[wakeWord] engine started — threshold:',
          threshold,
          'maxRecordingMs:',
          maxRecordingMs,
        );

        // Phase 23 Plan 02: Apply initial suspension if paused in store
        if (initialPaused) {
          console.log('[wakeWord] initially suspended (paused in store)');
          void engine.suspend();
        }
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
      if (vadMaxTimeoutRef.current) {
        clearTimeout(vadMaxTimeoutRef.current);
        vadMaxTimeoutRef.current = null;
      }
      void vadRef.current?.pause();
      vadRef.current = null;
      void engineRef.current?.stop();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase 23 Plan 02 (D-06): escuta o broadcast do tray kill switch
  useEffect(() => {
    const unsubscribe = window.jarvis.wakeWord.onPauseToggle((paused: boolean) => {
      console.log('[useWakeWord] pause toggle from tray:', paused);
      setWakeWordPaused(paused);

      const engine = engineRef.current;
      if (!engine) return;
      if (paused) {
        void engine.suspend();
      } else if (stateRef.current === 'idle') {
        // Só resume automaticamente se o orb está em idle. Se estiver em
        // listening/processing/responding, o useEffect de state gate
        // cuida do resume quando voltar para idle.
        void engine.resume();
      }
    });
    return () => {
      unsubscribe();
    };
  }, [setWakeWordPaused]);

  // Orb state gate (suspend/resume) — WAKE-05 full cycle.
  // Phase 28 Plan 02 (D-04): 'awaiting-followup' handled by existing `state !== 'idle'` check.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    // Phase 23 Plan 02: kill switch takes precedence. If paused, always suspend.
    if (wakeWordPaused) {
      void engine.suspend();
      return;
    }

    if (state === 'idle') {
      void engine.resume();
      // Reseta flag quando volta pra idle.
      wakeTriggeredListeningRef.current = false;
    } else {
      // NOTA: 22-GAP-04 bypass do VAD faz o engine rodar o classifier em
      // todos os chunks mesmo em listening. Suspendendo o audioContext
      // pra evitar TTS self-trigger (gate 1 já previne, mas belt-and-braces).
      // Phase 28 (D-04): this also suspends wake word during 'awaiting-followup'.
      void engine.suspend();
      // 22-GAP-10: só limpa o VAD max timeout se a transição de state foi POR
      // OUTRO MEIO (ex: PTT preemption). Se foi o próprio wake word que
      // transicionou, MANTÉM o timeout — senão a detecção vira no-op e o orb
      // trava em listening.
      if (!wakeTriggeredListeningRef.current && vadMaxTimeoutRef.current) {
        clearTimeout(vadMaxTimeoutRef.current);
        vadMaxTimeoutRef.current = null;
      }
    }
  }, [state, wakeWordPaused]);

  // TTS hooks — belt-and-braces anti self-trigger.
  // Registrado uma única vez no mount — os closures usam refs para ler
  // valores live (wakeWordPausedRef + stateRef), então nunca precisa
  // re-registrar no ciclo de vida do hook.
  useEffect(() => {
    registerTTSHooks({
      beforePlay: async () => {
        await engineRef.current?.suspend();
      },
      afterPlay: async () => {
        // Phase 23 Plan 02: só resume se NÃO paused E state é idle
        if (!wakeWordPausedRef.current && stateRef.current === 'idle') {
          await engineRef.current?.resume();
        }
      },
    });
    return () => {
      registerTTSHooks({});
    };
  }, []);

  return {
    ...hookState,
    vadInstance: vadRef.current, // Phase 28 Plan 02: expose for multi-turn window
  };
}
