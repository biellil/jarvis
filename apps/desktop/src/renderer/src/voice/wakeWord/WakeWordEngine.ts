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

/**
 * openwakeword pipeline constants:
 * - Mel spectrogram consome 80ms de áudio (1280 samples @ 16kHz) e produz
 *   NEW_MEL_FRAMES_PER_CHUNK frames × 32 bins.
 * - Embedding model consome MEL_BUFFER_FRAMES × 32 bins e produz 1 embedding.
 * - Classifier consome EMBEDDING_RING_SIZE embeddings e produz 1 score.
 *
 * 22-GAP-04: Plan 22-02 falhou em implementar o mel buffer deslizante.
 * Reconstituído aqui — valores baseados em openwakeword v0.5.1.
 */
const MEL_BUFFER_FRAMES = 76;
const MEL_BINS = 32;
const NEW_MEL_FRAMES_PER_CHUNK = 5;
const EMBEDDING_RING_SIZE = 16; // Reduzido de 76 → 16 (openwakeword classifier input)

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
  // 22-GAP-04: mel buffer deslizante [76*32=2432] — shift por 5*32=160 cada chunk
  private melBuffer = new Float32Array(MEL_BUFFER_FRAMES * MEL_BINS);
  private melFramesFilled = 0; // warmup counter — não roda embed até encher
  private embeddingRing: Float32Array[] = [];
  private lastDetectionAt = 0;
  private vadHangover = 0;
  private processing = false;
  private loggedMelShape = false; // debug one-shot
  private loggedFirstEmbed = false; // debug one-shot
  private loggedFirstClassifier = false; // debug one-shot
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
    // 22-GAP-14: URL relativa ao document.baseURI. Em packaged file://,
    // '/wakeWordWorklet.js' resolveria pra file:///wakeWordWorklet.js (root
    // do drive), quebrando. document.baseURI dá a base correta em ambos
    // modes (http://localhost:5173/ em dev, file:///.../dist/renderer/ em
    // packaged).
    const workletUrl = new URL('wakeWordWorklet.js', document.baseURI).href;
    await this.audioContext.audioWorklet.addModule(workletUrl);
    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.workletNode = new AudioWorkletNode(this.audioContext, 'wake-word-chunker');
    let loggedFirstChunk = false;
    let micLogCounter = 0;
    let micRmsMax = 0;
    this.workletNode.port.onmessage = (e: MessageEvent) => {
      const chunk = new Float32Array(e.data as ArrayBuffer);
      const rms = Math.sqrt(chunk.reduce((s, v) => s + v * v, 0) / chunk.length);

      // 22-GAP-07: log do primeiro chunk — confirma que áudio chega do worklet.
      if (!loggedFirstChunk) {
        console.log('[wakeWord] first audio chunk received — length:', chunk.length, 'rms:', rms.toFixed(6));
        loggedFirstChunk = true;
      }

      // 22-GAP-08: log periódico do RMS do mic com indicador visual — mostra
      // ao usuário que o mic está capturando em tempo real. A cada ~1s
      // (12 chunks de 80ms), imprime o RMS médio e o pico do intervalo.
      micRmsMax = Math.max(micRmsMax, rms);
      micLogCounter++;
      if (micLogCounter >= 12) {
        // Barra visual: cada "■" ≈ 0.01 RMS, máx 20 barras (0.2 RMS = alto).
        const bars = Math.min(20, Math.floor(micRmsMax * 100));
        const visual = '■'.repeat(bars) + '□'.repeat(Math.max(0, 10 - bars));
        console.log(`[mic] level ${visual} rms=${micRmsMax.toFixed(4)}`);
        micLogCounter = 0;
        micRmsMax = 0;
      }

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

      // 1. Mel spectrogram — consome 1280 samples, produz 5 novos mel frames (5×32=160 floats)
      const melInput = new ort.Tensor('float32', chunk, [1, chunk.length]);
      const melInputName = this.sessions.mel.inputNames[0];
      const melOut = await this.sessions.mel.run({ [melInputName]: melInput });
      const melTensor = melOut[this.sessions.mel.outputNames[0]];
      const melData = melTensor.data as Float32Array;

      // 22-GAP-04: log shape só na primeira vez — pra confirmar layout real do modelo
      if (!this.loggedMelShape) {
        console.log('[wakeWord] mel output shape:', melTensor.dims, 'data length:', melData.length);
        this.loggedMelShape = true;
      }

      // 22-GAP-04: acumular mel frames num buffer deslizante [76, 32].
      // Cada chunk traz 5 novos frames (160 floats) no final. openwakeword
      // requer 76 frames contíguos ANTES de rodar o embedding model —
      // Plan 22-02 esquecia esse passo e feedava mel.output direto no embed.
      const SHIFT = NEW_MEL_FRAMES_PER_CHUNK * MEL_BINS; // 160
      const TAIL_OFFSET = (MEL_BUFFER_FRAMES - NEW_MEL_FRAMES_PER_CHUNK) * MEL_BINS; // 2272

      // Shift left by SHIFT
      this.melBuffer.copyWithin(0, SHIFT);
      // Append novos frames no final (copia os últimos SHIFT floats do melData)
      this.melBuffer.set(melData.subarray(melData.length - SHIFT), TAIL_OFFSET);
      this.melFramesFilled = Math.min(this.melFramesFilled + NEW_MEL_FRAMES_PER_CHUNK, MEL_BUFFER_FRAMES);

      // Warmup: ignora chunks até encher os 76 frames pela primeira vez.
      if (this.melFramesFilled < MEL_BUFFER_FRAMES) return;

      // 22-GAP-09: NORMALIZAÇÃO CRÍTICA DO openwakeword.
      // openwakeword aplica (mel / 10) + 2 no mel buffer ANTES de feeder no
      // embedding model. Plan 22-02 esqueceu esse passo — sem ele, o embed
      // model recebe valores fora da distribuição de treino e produz garbage,
      // fazendo o classifier retornar score ~0.0001 constantemente.
      // Referência: openwakeword/utils.py AudioFeatures._get_embeddings.
      const normalizedMel = new Float32Array(this.melBuffer.length);
      for (let i = 0; i < this.melBuffer.length; i++) {
        normalizedMel[i] = this.melBuffer[i] / 10 + 2;
      }

      // Log one-shot: stats do mel buffer antes e depois da normalização.
      if (!this.loggedFirstEmbed) {
        let rawMin = Infinity, rawMax = -Infinity, normMin = Infinity, normMax = -Infinity;
        for (let i = 0; i < this.melBuffer.length; i++) {
          if (this.melBuffer[i] < rawMin) rawMin = this.melBuffer[i];
          if (this.melBuffer[i] > rawMax) rawMax = this.melBuffer[i];
          if (normalizedMel[i] < normMin) normMin = normalizedMel[i];
          if (normalizedMel[i] > normMax) normMax = normalizedMel[i];
        }
        console.log('[wakeWord] mel stats — raw: [', rawMin.toFixed(3), ',', rawMax.toFixed(3),
                    '] normalized: [', normMin.toFixed(3), ',', normMax.toFixed(3), ']');
      }

      // 2. Embedding backbone — consome [1, 76, 32, 1], produz 1 embedding
      const embedInputTensor = new ort.Tensor('float32', normalizedMel, [
        1,
        MEL_BUFFER_FRAMES,
        MEL_BINS,
        1,
      ]);
      const embedInputName = this.sessions.embed.inputNames[0];
      const embedOut = await this.sessions.embed.run({ [embedInputName]: embedInputTensor });
      const embedTensor = embedOut[this.sessions.embed.outputNames[0]];
      const embedding = embedTensor.data as Float32Array;

      // 22-GAP-07: log one-shot do primeiro embedding OK — confirma que embed
      // rodou sem erro pós mel buffer warmup (prova que gap 04 funciona).
      if (!this.loggedFirstEmbed) {
        console.log('[wakeWord] first embedding OK — dims:', embedTensor.dims, 'len:', embedding.length);
        this.loggedFirstEmbed = true;
      }

      this.embeddingRing.push(embedding);
      if (this.embeddingRing.length > EMBEDDING_RING_SIZE) {
        this.embeddingRing.shift();
      }
      // Ring ainda não encheu — cold start, segura classifier.
      if (this.embeddingRing.length < EMBEDDING_RING_SIZE) return;

      // 3. VAD gate — DESATIVADO em 22-GAP-04.
      // Plan 22-02 feedava o embedding pro Silero VAD, mas Silero consome
      // ÁUDIO bruto (não embeddings) e tem multi-input (input+state+sr).
      // Arquitetura errada — desativado até ser corrigido num gap separado.
      // CPU budget (WAKE-09) pode exceder 2% sem essa otimização; a aceitação
      // do plan 22-04 Task 3 (checkpoint humano) vai medir.
      void VAD_HANGOVER_FRAMES; // silence unused const warning
      // Uses `this.vadHangover` to avoid unused field (keep for future fix)
      this.vadHangover = 0;

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

      // 22-GAP-07: log one-shot do primeiro classifier OK
      if (!this.loggedFirstClassifier) {
        console.log('[wakeWord] first classifier OK — dims:', kwTensor.dims, 'score:', score.toFixed(4));
        this.loggedFirstClassifier = true;
      }

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
