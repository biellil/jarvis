/**
 * AlwaysListeningEngine — loop renderer-side de captura contínua + Silero VAD
 * + AudioRingBuffer (pre-roll 500ms) + IntentClassifier (lazy load).
 *
 * Phase 40 — Always-Listening Mode (D-01..D-04, D-13).
 *
 * Pipeline:
 *   MediaStream → @ricky0123/vad-web (Silero VAD legacy) →
 *   onFrameProcessed (alimenta ring buffer com frames pré-fala) →
 *   onSpeechEnd(audio) → handleSpeechEnd():
 *     1. Discard se durationMs < MIN_UTTERANCE_MS (anti-spam, T-40-TIMEOUT).
 *     2. Concatena ringBuffer.toArray() + audio (VLISTEN-03 pre-roll).
 *     3. Encode → WAV (encodeFloat32ToWav, 16kHz mono Int16LE).
 *     4. Chama opts.onUtteranceReady(wavBuffer) — Strategy (Plan 40-05) envia via IPC.
 *
 * Decisões arquiteturais (alinhadas ao plan 40-04 NOTE em <action>):
 *   - Classifier roda no MAIN process após STT (não no renderer) — D-03 "WAV único → IPC".
 *   - Aqui só fazemos lazy load via classifier.load() pra cumprir D-13: se o load
 *     falha, propagamos o erro para que VoiceModeManager emita 'voiceMode:degraded'
 *     (D-09). O classify() per-utterance vive no AlwaysListeningStrategy main-side.
 *
 * VAD threshold reconfigurável (VLISTEN-04):
 *   - setOptions({ redemptionMs }) na sessão @ricky0123/vad-web — Open Question A5
 *     do RESEARCH.md confirmada: setOptions existe em MicVAD 0.0.30.
 *
 * Threat coverage:
 *   - T-40-VAD: setOptions chama API estável da lib; valor já clamped pelo caller (Plan 05).
 *   - T-40-RING: dispose() chama ringBuffer.clear() — samples de áudio não persistem.
 *   - T-40-MIC: stop() chama getTracks().stop() em todo track + AudioContext.close().
 *   - T-40-TIMEOUT: utterances < MIN_UTTERANCE_MS descartadas sem sender.
 *
 * @see .planning/phases/40-always-listening-intent-classifier/40-RESEARCH.md §Pattern 1
 * @see .planning/phases/40-always-listening-intent-classifier/40-CONTEXT.md D-01..D-13
 */
import { MicVAD } from '@ricky0123/vad-web';

import { encodeFloat32ToWav } from '../encodeFloat32ToWav';

import { AudioRingBuffer } from './audioRingBuffer';
import { IntentClassifier, INTENT_THRESHOLD } from './intentClassifier';

const SAMPLE_RATE = 16_000;
/** Default frame size do Silero VAD legacy: 1536 samples @ 16kHz = 96ms. */
const FRAME_SAMPLES = 1_536;
/** 500ms @ 16kHz = 8000 samples. Capacity 2x (16000) dá margem para frames batched. */
const PRE_ROLL_SAMPLES = 8_000;
const RING_BUFFER_CAPACITY = PRE_ROLL_SAMPLES * 2;
/** Descarta utterances curtas demais (clicks, ruído transitório) — D-08 guard. */
const MIN_UTTERANCE_MS = 200;
/** Default frame size do Silero VAD legacy é 1536 samples @ 16kHz = 96ms. */
const FRAME_MS_DEFAULT = 96;

/**
 * Phase 40 Plan 06 (VLISTEN-04) — Channel main → renderer com novo VAD threshold (ms).
 * Originado em ipc/settings.ts handler de 'always-listening:vad-threshold' após
 * clamp [300, 800] e persist no store. Engine listener registrado em start().
 */
const VAD_THRESHOLD_CHANGED_CHANNEL = 'vad:threshold-changed';

export interface AlwaysListeningEngineOptions {
  /**
   * Total de frames de silêncio antes de fechar o speech. Calculado pelo caller
   * (AlwaysListeningStrategy main-side) a partir de vadSilenceThresholdMs do
   * store (range 300-800ms já clamped via setVadSilenceThresholdMs).
   *
   * Convertido internamente em redemptionMs para a API do @ricky0123/vad-web 0.0.30.
   */
  vadNegativeFramesToClose: number;

  /**
   * Callback chamado uma vez por utterance aprovada. Recebe WAV buffer (Uint8Array)
   * pronto para envio via IPC `always-listening:utterance` (Plan 40-05).
   */
  onUtteranceReady: (wavBuffer: Uint8Array) => void;

  /**
   * Callback de erro durante runtime (e.g., VAD inference fail). Erros de start()
   * são propagados via Promise rejection — onError é para erros pós-start.
   */
  onError: (reason: string, err?: Error) => void;
}

/**
 * Converte negativeFramesToClose (frames @ ~96ms) para redemptionMs (API atual
 * do @ricky0123/vad-web 0.0.30). Mantém retrocompatibilidade da interface
 * pública AlwaysListeningEngineOptions definida no plan original.
 */
function framesToRedemptionMs(frames: number): number {
  return Math.max(50, Math.round(frames * FRAME_MS_DEFAULT));
}

/**
 * Converte ms em negativeFramesToClose (frames @ ~96ms — Silero legacy).
 * Usado pelo listener de 'vad:threshold-changed' que recebe ms do main.
 */
function msToNegativeFrames(ms: number): number {
  return Math.max(1, Math.floor((ms / 1000) * SAMPLE_RATE / FRAME_SAMPLES));
}

export class AlwaysListeningEngine {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private vadSession: MicVAD | null = null;
  private readonly ringBuffer: AudioRingBuffer;
  private readonly classifier: IntentClassifier;
  private speechStartedAt = 0;
  private inSpeech = false;
  private isDisposed = false;
  private isStarted = false;
  private currentNegativeFramesToClose: number;
  /**
   * Phase 40 Plan 06 (VLISTEN-04) — listener registrado em start() e removido
   * em stop() para o canal 'vad:threshold-changed' broadcast pelo main após
   * o slider de Settings aplicar nova preferência. Manter referência para
   * window.jarvis.ipcRenderer.off() — caso contrário ficaria fantasma após
   * stop() (T-40-RING).
   */
  private thresholdChangeListener:
    | ((event: unknown, ms: number) => void)
    | null = null;

  constructor(private readonly opts: AlwaysListeningEngineOptions) {
    this.ringBuffer = new AudioRingBuffer(RING_BUFFER_CAPACITY);
    this.classifier = new IntentClassifier({
      modelId: 'Xenova/multilingual-e5-small',
      threshold: INTENT_THRESHOLD,
      sttConfidenceThreshold: 0.5, // D-08
      timeoutMs: 300, // D-10
    });
    this.currentNegativeFramesToClose = opts.vadNegativeFramesToClose;
  }

  /**
   * start — inicializa AudioContext, faz lazy load do classifier (D-13) e
   * monta a sessão MicVAD reutilizando o stream fornecido (sem re-prompt de
   * mic). Erros de classifier load são propagados para o caller emitir
   * voiceMode:degraded (D-09).
   */
  async start(stream: MediaStream): Promise<void> {
    if (this.isDisposed) {
      throw new Error('AlwaysListeningEngine: cannot restart after dispose()');
    }
    if (this.isStarted) {
      // Idempotência defensiva — start() duplo não vaza recursos.
      return;
    }

    this.stream = stream;

    // AudioContext @ 16kHz para alinhar com Silero VAD (sample rate fixa).
    // Em ambientes de teste (happy-dom), AudioContext pode estar em window —
    // probamos primeiro window.AudioContext, fallback para global AudioContext.
    const Ctor =
      (typeof window !== 'undefined' &&
        ((window as unknown as { AudioContext?: typeof AudioContext })
          .AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext)) ||
      (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
    if (typeof Ctor !== 'function') {
      throw new Error('AlwaysListeningEngine: AudioContext unavailable in this environment');
    }
    this.audioContext = new Ctor({ sampleRate: SAMPLE_RATE });

    // D-13 lazy load — classifier fica residente em RAM até dispose().
    // Se falhar, propaga (Strategy traduz em voiceMode:degraded D-09).
    await this.classifier.load();

    const redemptionMs = framesToRedemptionMs(this.currentNegativeFramesToClose);

    this.vadSession = await MicVAD.new({
      // Reutiliza o stream existente — sem re-prompt de mic (mesmo padrão de
      // useWakeWord.ts Phase 24).
      getStream: async () => stream,
      // pauseStream/resumeStream no-op: stream lifecycle é nosso (stop()
      // mata as tracks). Sem isso, a lib pararia o stream em pause().
      pauseStream: async () => {
        /* no-op — stream ownership é da engine */
      },
      resumeStream: async () => stream,
      model: 'legacy',
      positiveSpeechThreshold: 0.8,
      negativeSpeechThreshold: 0.3,
      redemptionMs,
      preSpeechPadMs: 0, // Nosso ring buffer cobre pre-roll (VLISTEN-03)
      minSpeechMs: MIN_UTTERANCE_MS,
      submitUserSpeechOnPause: false,

      onSpeechStart: () => {
        this.inSpeech = true;
        this.speechStartedAt = Date.now();
      },

      onFrameProcessed: (_probs, frame: Float32Array) => {
        // Alimenta ring buffer apenas com frames PRÉ-fala (pre-roll).
        // Durante a fala, o vad-web já acumula a utterance internamente
        // e a entrega completa em onSpeechEnd — não precisamos duplicar.
        if (!this.inSpeech) {
          this.ringBuffer.write(frame);
        }
      },

      onVADMisfire: () => {
        // Speech start detectado mas frame count abaixo de minSpeechMs → descarte.
        // Reset do ring buffer pra próxima detecção começar fresh.
        this.inSpeech = false;
        this.ringBuffer.clear();
      },

      onSpeechEnd: (audio: Float32Array) => {
        void this.handleSpeechEnd(audio);
      },
    });

    await this.vadSession.start();
    this.isStarted = true;

    // Phase 40 Plan 06 (VLISTEN-04) — listener para reapply do VAD threshold
    // em runtime quando o slider de Settings disparar o broadcast.
    // Registrado APÓS vadSession.start() para garantir que reconfigureVadThreshold
    // tenha sessão ativa para chamar setOptions.
    if (typeof window !== 'undefined' && window.jarvis?.ipcRenderer?.on) {
      const listener = (_event: unknown, ms: number): void => {
        if (typeof ms !== 'number' || Number.isNaN(ms)) {
          return;
        }
        const negFrames = msToNegativeFrames(ms);
        void this.reconfigureVadThreshold(negFrames);
      };
      window.jarvis.ipcRenderer.on(VAD_THRESHOLD_CHANGED_CHANNEL, listener);
      this.thresholdChangeListener = listener;
    }
  }

  /**
   * handleSpeechEnd — concatena pre-roll + utterance audio, encoda WAV e
   * dispara onUtteranceReady. Descarta utterances < MIN_UTTERANCE_MS.
   */
  private async handleSpeechEnd(utteranceAudio: Float32Array): Promise<void> {
    const durationMs = Date.now() - this.speechStartedAt;
    this.inSpeech = false;

    // T-40-TIMEOUT: descarta micro-utterances (clicks, ruído transitório).
    if (durationMs < MIN_UTTERANCE_MS) {
      this.ringBuffer.clear();
      return;
    }

    try {
      // VLISTEN-03 pre-roll: snapshot do ring buffer (drain implícito) + utterance.
      const ringSnapshot = this.ringBuffer.toArray();
      const fullAudio = concatenateAudio(ringSnapshot, utteranceAudio);

      // WAV encode (16kHz mono Int16LE) — formato consumido por whisper.cpp no main.
      const wavBuffer = encodeFloat32ToWav(fullAudio, SAMPLE_RATE);

      this.opts.onUtteranceReady(wavBuffer);
    } catch (err) {
      this.opts.onError(
        'utterance-encode-fail',
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }

  /**
   * reconfigureVadThreshold — aplica novo VAD silence threshold em runtime
   * sem reiniciar a sessão (VLISTEN-04, T-40-VAD).
   *
   * Usa setOptions do @ricky0123/vad-web 0.0.30 (confirmado em
   * dist/real-time-vad.d.ts). Se chamado antes de start(), apenas atualiza
   * o valor interno — não lança.
   */
  async reconfigureVadThreshold(negativeFramesToClose: number): Promise<void> {
    this.currentNegativeFramesToClose = negativeFramesToClose;

    if (!this.vadSession) {
      // Pré-start: valor é aplicado no próximo start().
      return;
    }

    const redemptionMs = framesToRedemptionMs(negativeFramesToClose);
    this.vadSession.setOptions({ redemptionMs });
  }

  /**
   * stop — encerra VAD session, fecha AudioContext, para todas as mic tracks.
   * Não descarrega o classifier (D-13: fica em RAM até dispose).
   *
   * Best-effort em todos os passos: erros isolados não impedem cleanup das outras
   * partes (T-40-MIC: microfone deve ser liberado mesmo se VAD destroy falhar).
   */
  async stop(): Promise<void> {
    // Phase 40 Plan 06 (VLISTEN-04, T-40-RING) — remover listener de
    // 'vad:threshold-changed' antes de qualquer outro cleanup. Sem isso, um
    // broadcast tardio do main poderia chamar reconfigureVadThreshold() em
    // engine descartado (acessando vadSession já null em best-effort).
    if (this.thresholdChangeListener) {
      try {
        if (typeof window !== 'undefined' && window.jarvis?.ipcRenderer?.off) {
          window.jarvis.ipcRenderer.off(
            VAD_THRESHOLD_CHANGED_CHANNEL,
            this.thresholdChangeListener,
          );
        }
      } catch {
        /* best-effort */
      }
      this.thresholdChangeListener = null;
    }

    if (this.vadSession) {
      try {
        await this.vadSession.destroy();
      } catch {
        /* best-effort — não bloqueia cleanup do mic */
      }
      this.vadSession = null;
    }

    if (this.stream) {
      try {
        this.stream.getTracks().forEach((t) => t.stop());
      } catch {
        /* best-effort */
      }
      this.stream = null;
    }

    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch {
        /* best-effort */
      }
      this.audioContext = null;
    }

    this.isStarted = false;
    this.inSpeech = false;
  }

  /**
   * dispose — cleanup completo. Idempotente: segunda chamada é no-op.
   * Libera classifier da RAM (D-13) e limpa ring buffer (T-40-RING).
   */
  async dispose(): Promise<void> {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;

    await this.stop();
    this.classifier.unload();
    this.ringBuffer.clear();
  }
}

/** Concatenação simples — evita Array.from + spread (overhead em buffers grandes). */
function concatenateAudio(a: Float32Array, b: Float32Array): Float32Array {
  const result = new Float32Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}
