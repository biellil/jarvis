/**
 * WakeWordEngine — orquestrador stateful do pipeline wake word.
 *
 * Pipeline (por chunk de 1280 samples @ 16kHz, 80ms):
 *   1. RmsZeroGuard.observe     → detecta mic silenciado (WAKE-08)
 *   2. mel spectrogram           → front-end features
 *   3. embedding model           → shared backbone (push no ring buffer)
 *   4. VAD gate (Silero)         → skip classifier em silêncio (PITFALL #4)
 *   5. keyword classifier         → score escalar para "Hey JARVIS"
 *   6. debounce + threshold       → onDetected(score) 1x por janela
 *
 * Invariants:
 * - `ort.env.wasm.numThreads === 1` (crossOriginIsolated + CPU budget)
 * - zero fetch() para URL http(s) durante processChunk (WAKE-09)
 * - zero uso de MediaRecorder (ownership fica no VoiceInputManager)
 * - ring buffer de EMBEDDING_RING_SIZE embeddings (openwakeword A3)
 *
 * Este engine NÃO faz mic acquisition nem lifecycle. Plan 04 conecta
 * `useWakeWord` hook → VoiceInputManager → start(sessions, stream).
 */
import * as ort from 'onnxruntime-web';
import type { WakeWordSessions } from './modelLoader';
import { RmsZeroGuard } from './rmsZeroGuard';

// Critical: single-thread for Electron renderer w/o crossOriginIsolated.
ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;

/** openwakeword context window (A3 — 76 embeddings fed to classifier) */
const EMBEDDING_RING_SIZE = 76;

/** VAD hangover frames — segura classifier aberto por N frames após fala cessar */
const VAD_HANGOVER_FRAMES = 12;

export interface WakeWordEngineOptions {
  /** Score threshold for classifier output (0..1). Default: 0.5 */
  threshold: number;
  /** Cooldown window between consecutive detections (ms). Default: 2000 */
  debounceMs: number;
  /** Silero VAD threshold; classifier só roda se vadScore >= vadThreshold OU hangover ativo. Default: 0.3 */
  vadThreshold: number;
  /** RmsZeroGuard window (frames); default 63 */
  rmsGuardWindowFrames?: number;
  /** Called with classifier score when detection fires */
  onDetected: (score: number) => void;
  /** WAKE-08: called when stream stays silent (rms<eps) by rmsGuardWindowFrames chunks */
  onSilentStream?: () => void;
}

export class WakeWordEngine {
  private sessions: WakeWordSessions | null = null;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private embeddingRing: Float32Array[] = [];
  private lastDetectionAt = 0;
  private vadHangover = 0;
  private processing = false;
  private readonly rmsGuard: RmsZeroGuard;

  constructor(private readonly opts: WakeWordEngineOptions) {
    this.rmsGuard = new RmsZeroGuard({
      windowFrames: opts.rmsGuardWindowFrames ?? 63,
      epsilon: 1e-8,
      onSilentStream: () => opts.onSilentStream?.(),
    });
  }

  async start(sessions: WakeWordSessions, stream: MediaStream): Promise<void> {
    this.sessions = sessions;
    this.stream = stream;

    // 22-GAP-03: log input/output names de cada sessão — cada modelo ONNX
    // do openwakeword usa um nome de input diferente (ex: 'input' vs 'input_1').
    // Usamos session.inputNames dinamicamente em processChunk pra não hardcodar.
    console.log('[wakeWord] model IO signatures:', {
      mel: { in: sessions.mel.inputNames, out: sessions.mel.outputNames },
      embed: { in: sessions.embed.inputNames, out: sessions.embed.outputNames },
      vad: { in: sessions.vad.inputNames, out: sessions.vad.outputNames },
      kw: { in: sessions.kw.inputNames, out: sessions.kw.outputNames },
    });

    this.audioContext = new AudioContext({ sampleRate: 16000 });
    await this.audioContext.audioWorklet.addModule('/wakeWordWorklet.js');
    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.workletNode = new AudioWorkletNode(this.audioContext, 'wake-word-chunker');
    this.workletNode.port.onmessage = (e: MessageEvent) => {
      const chunk = new Float32Array(e.data as ArrayBuffer);
      void this.processChunk(chunk);
    };
    this.sourceNode.connect(this.workletNode);
    // Intencional: NÃO conectar o workletNode ao destination — isso geraria
    // echo do próprio mic nos alto-falantes.
  }

  private async processChunk(chunk: Float32Array): Promise<void> {
    if (!this.sessions) return;
    // Reentrância: se uma inferência ainda está rodando, dropamos este chunk.
    // Isso é aceitável — worklet vai emitir o próximo em 80ms.
    if (this.processing) return;
    this.processing = true;
    try {
      this.rmsGuard.observe(chunk);

      // 22-GAP-03: cada modelo ONNX do openwakeword tem um nome de input
      // distinto (ex: melspectrogram usa 'input', embedding usa 'input_1').
      // Lookup dinâmico via session.inputNames[0].

      // 1. Mel spectrogram
      const melInput = new ort.Tensor('float32', chunk, [1, chunk.length]);
      const melInputName = this.sessions.mel.inputNames[0];
      const melOut = await this.sessions.mel.run({ [melInputName]: melInput });
      const melTensor = melOut[this.sessions.mel.outputNames[0]];

      // 2. Embedding backbone
      const embedInputName = this.sessions.embed.inputNames[0];
      const embedOut = await this.sessions.embed.run({ [embedInputName]: melTensor });
      const embedTensor = embedOut[this.sessions.embed.outputNames[0]];
      const embedding = embedTensor.data as Float32Array;
      this.embeddingRing.push(embedding);
      if (this.embeddingRing.length > EMBEDDING_RING_SIZE) {
        this.embeddingRing.shift();
      }
      // Ring ainda não encheu — cold start, segura classifier.
      if (this.embeddingRing.length < EMBEDDING_RING_SIZE) return;

      // 3. VAD gate — critical CPU optimization (PITFALL #4).
      // Silero VAD consome o embedding; retorna probabilidade de fala.
      const vadInputName = this.sessions.vad.inputNames[0];
      const vadOut = await this.sessions.vad.run({ [vadInputName]: embedTensor });
      const vadTensor = vadOut[this.sessions.vad.outputNames[0]];
      const vadScore = (vadTensor.data as Float32Array)[0];

      if (vadScore >= this.opts.vadThreshold) {
        this.vadHangover = VAD_HANGOVER_FRAMES;
      } else {
        if (this.vadHangover > 0) {
          this.vadHangover--;
        }
        if (this.vadHangover <= 0) {
          // Silêncio — pula classifier inteiro.
          return;
        }
      }

      // 4. Keyword classifier
      const embedDim = embedding.length;
      const flattened = new Float32Array(EMBEDDING_RING_SIZE * embedDim);
      for (let i = 0; i < EMBEDDING_RING_SIZE; i++) {
        flattened.set(this.embeddingRing[i], i * embedDim);
      }
      const kwInput = new ort.Tensor('float32', flattened, [
        1,
        EMBEDDING_RING_SIZE,
        embedDim,
      ]);
      const kwInputName = this.sessions.kw.inputNames[0];
      const kwOut = await this.sessions.kw.run({ [kwInputName]: kwInput });
      const kwTensor = kwOut[this.sessions.kw.outputNames[0]];
      const score = (kwTensor.data as Float32Array)[0];

      // 5. Debounce + threshold
      const now = Date.now();
      if (score >= this.opts.threshold && now - this.lastDetectionAt > this.opts.debounceMs) {
        this.lastDetectionAt = now;
        this.opts.onDetected(score);
      }
    } finally {
      this.processing = false;
    }
  }

  async suspend(): Promise<void> {
    await this.audioContext?.suspend();
  }

  async resume(): Promise<void> {
    await this.audioContext?.resume();
  }

  async stop(): Promise<void> {
    try {
      this.sourceNode?.disconnect();
    } catch {
      /* best-effort */
    }
    try {
      this.workletNode?.disconnect();
    } catch {
      /* best-effort */
    }
    try {
      this.stream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* best-effort */
    }
    try {
      await this.audioContext?.close();
    } catch {
      /* best-effort */
    }
    this.sessions = null;
    this.audioContext = null;
    this.stream = null;
    this.workletNode = null;
    this.sourceNode = null;
    this.embeddingRing = [];
    this.vadHangover = 0;
    this.lastDetectionAt = 0;
    this.rmsGuard.reset();
  }
}
