/**
 * IntentClassifier — Filtra falsos positivos via cosine similarity local (VLISTEN-02).
 *
 * Pipeline:
 *   1. load() carrega Xenova/multilingual-e5-small via Transformers.js + pré-computa
 *      embeddings dos few-shot examples pt-BR (INTENT_EXAMPLES_PT_BR).
 *   2. classify(transcript, sttConfidence) decide via cosine similarity:
 *      - sttConfidence < threshold → 'stt-confidence-filtered' (D-08, send-anyway)
 *      - timeout > timeoutMs → 'timeout-send-anyway' (D-10)
 *      - max(positive_sim) > threshold && > max(negative_sim) → 'classified-intent'
 *      - otherwise → 'classified-no-intent'
 *
 * Threat coverage:
 *   - T-40-INTENT: cosine sim em embeddings normalizados (pooling mean + L2),
 *     guard 1e-8 no denominador.
 *   - T-40-TIMEOUT: Promise.race com fallback send-anyway.
 *   - T-40-AUDIT: audit log opt-in via env var ALWAYS_LISTENING_AUDIT=true (D-12).
 *
 * @see .planning/phases/40-always-listening-intent-classifier/40-RESEARCH.md §Pattern 2
 * @see .planning/phases/40-always-listening-intent-classifier/40-CONTEXT.md D-05..D-12
 */
import { pipeline } from '@xenova/transformers';

import { INTENT_EXAMPLES_PT_BR } from '../../../../main/voiceMode/intentExamples.pt-BR';

/**
 * INTENT_THRESHOLD — limiar de cosine similarity (D-07).
 * Default 0.6, override via env var INTENT_THRESHOLD para tuning sem rebuild.
 * Validado contra NaN, Infinity e valores fora do intervalo (0, 1) — valores
 * inválidos geram warning e fazem fallback para 0.6.
 */
function parseThreshold(): number {
  const raw = process.env['INTENT_THRESHOLD'];
  if (!raw) return 0.6;
  const parsed = parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1) {
    console.warn(`[intentClassifier] Invalid INTENT_THRESHOLD="${raw}", falling back to 0.6`);
    return 0.6;
  }
  return parsed;
}
export const INTENT_THRESHOLD = parseThreshold();

export interface IntentClassifierOptions {
  /** Modelo Hugging Face (e.g., 'Xenova/multilingual-e5-small'). */
  modelId: string;
  /** Limiar cosine similarity para classificar como intent (default 0.6, D-07). */
  threshold: number;
  /** Limiar de STT confidence pre-filter (default 0.5, D-08). */
  sttConfidenceThreshold: number;
  /** Timeout para send-anyway fallback (default 300ms, D-10). */
  timeoutMs: number;
  /** Audit log opt-in callback (D-12). Só dispara se env ALWAYS_LISTENING_AUDIT=true. */
  auditLog?: (entry: AuditLogEntry) => void;
}

export interface IntentClassificationResult {
  hasIntent: boolean;
  score: number;
  verdict:
    | 'classified-intent'
    | 'classified-no-intent'
    | 'timeout-send-anyway'
    | 'stt-confidence-filtered';
  latencyMs: number;
}

export interface AuditLogEntry {
  timestamp: string;
  transcript: string;
  sttConfidence: number;
  classifierScore: number;
  verdict: IntentClassificationResult['verdict'];
}

/**
 * IntentClassifier — wrapper Transformers.js para multilingual-e5-small.
 *
 * Lifecycle:
 *   - load() — chamado quando user troca pra always-listening (D-13 lazy in-memory).
 *   - classify(transcript, sttConfidence) — chamado per-utterance pelo
 *     AlwaysListeningEngine após VAD speech-end + STT.
 *   - unload() — chamado em dispose() do strategy (mode switch saindo).
 */
export class IntentClassifier {
  private extractor: ((text: string, opts?: unknown) => Promise<{ data: Float32Array }>) | null =
    null;
  // Few-shot embeddings em Map<label:text, Float32Array> (não array dinâmico).
  // Estrutura fixa (size=25) populada em load(), limpa em unload(). Iteração
  // via Map.entries() — chave é "positive:abre o terminal" para preservar label
  // separável via split(':') no classify() hot path.
  private readonly fewShotEmbeddings: Map<string, Float32Array> = new Map();

  constructor(private readonly opts: IntentClassifierOptions) {}

  /**
   * load — carrega o modelo ONNX e pré-computa embeddings dos few-shot examples.
   *
   * Storage do modelo: cache padrão do Transformers.js (~/.cache/huggingface)
   * via env.cacheDir. D-14 path customizado em userData/ é best-effort no
   * renderer (sem app.getPath disponível); main process pre-download (D-15)
   * usa o path correto.
   */
  async load(): Promise<void> {
    try {
      // pipeline() retorna função tipada: (text) => { data: Float32Array }
      this.extractor = (await pipeline('feature-extraction', this.opts.modelId, {
        quantized: false,
      } as unknown as Record<string, unknown>)) as unknown as (
        text: string,
        opts?: unknown,
      ) => Promise<{ data: Float32Array }>;

      await this.precomputeExamples();
    } catch (err) {
      throw new Error(
        `Failed to load intent classifier: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * classify — classifica a transcript como intent ou no-intent.
   *
   * - Pre-filter: sttConfidence < threshold → 'stt-confidence-filtered' (D-08)
   * - Race com timeout: > timeoutMs → 'timeout-send-anyway' (D-10)
   * - Cosine similarity vs few-shot: max(pos) > threshold && > max(neg) → intent
   */
  async classify(
    transcript: string,
    sttConfidence: number = 1.0,
  ): Promise<IntentClassificationResult> {
    const t0 = performance.now();

    // Pre-filter D-08: skip classifier se STT confidence muito baixa
    if (sttConfidence < this.opts.sttConfidenceThreshold || transcript.trim() === '') {
      const result: IntentClassificationResult = {
        hasIntent: true, // send-anyway
        score: 0,
        verdict: 'stt-confidence-filtered',
        latencyMs: performance.now() - t0,
      };
      this.maybeAudit(transcript, sttConfidence, result);
      return result;
    }

    try {
      // Race com timeout D-10
      const result = await Promise.race([
        this.classifyInternal(transcript, t0),
        new Promise<IntentClassificationResult>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), this.opts.timeoutMs),
        ),
      ]);
      this.maybeAudit(transcript, sttConfidence, result);
      return result;
    } catch (err) {
      // Timeout ou erro → send-anyway (T-40-TIMEOUT)
      const latencyMs = performance.now() - t0;
      console.warn(
        `[intentClassifier] Timeout/error after ${latencyMs.toFixed(0)}ms, sending anyway`,
        { err: err instanceof Error ? err.message : String(err) },
      );
      const result: IntentClassificationResult = {
        hasIntent: true,
        score: 0,
        verdict: 'timeout-send-anyway',
        latencyMs,
      };
      this.maybeAudit(transcript, sttConfidence, result);
      return result;
    }
  }

  /**
   * unload — libera o extractor e limpa few-shot embeddings (memory cleanup
   * em dispose() do AlwaysListeningStrategy).
   */
  unload(): void {
    this.extractor = null;
    // Map.clear() libera todas as entradas (Float32Array embeddings GC'd).
    this.fewShotEmbeddings.clear();
  }

  // ─── private ────────────────────────────────────────────────────────────

  private async precomputeExamples(): Promise<void> {
    for (const text of INTENT_EXAMPLES_PT_BR.positive) {
      const embedding = await this.extractEmbedding(text);
      this.fewShotEmbeddings.set(`positive:${text}`, embedding);
    }
    for (const text of INTENT_EXAMPLES_PT_BR.negative) {
      const embedding = await this.extractEmbedding(text);
      this.fewShotEmbeddings.set(`negative:${text}`, embedding);
    }
  }

  private async extractEmbedding(text: string): Promise<Float32Array> {
    if (!this.extractor) {
      throw new Error('Classifier not loaded');
    }
    const result = await this.extractor(text, {
      pooling: 'mean',
      normalize: true,
    });
    return new Float32Array(result.data);
  }

  private async classifyInternal(
    transcript: string,
    t0: number,
  ): Promise<IntentClassificationResult> {
    if (!this.extractor) {
      throw new Error('Classifier not loaded');
    }

    const inputEmbedding = await this.extractEmbedding(transcript);

    // Calcula max similarity por label via iteração no Map
    let maxPositive = -1;
    let maxNegative = -1;

    for (const [key, embedding] of this.fewShotEmbeddings.entries()) {
      const sim = this.cosineSimilarity(inputEmbedding, embedding);
      const label = key.startsWith('positive:') ? 'positive' : 'negative';
      if (label === 'positive') {
        if (sim > maxPositive) maxPositive = sim;
      } else {
        if (sim > maxNegative) maxNegative = sim;
      }
    }

    const hasIntent = maxPositive > this.opts.threshold && maxPositive > maxNegative;
    const latencyMs = performance.now() - t0;

    return {
      hasIntent,
      score: maxPositive,
      verdict: hasIntent ? 'classified-intent' : 'classified-no-intent',
      latencyMs,
    };
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      console.warn(
        `[intentClassifier] cosineSimilarity length mismatch: ${a.length} vs ${b.length}`,
      );
      return 0;
    }
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      const ai = a[i]!;
      const bi = b[i]!;
      dotProduct += ai * bi;
      normA += ai * ai;
      normB += bi * bi;
    }
    // Guard 1e-8 evita divisão por zero (T-40-INTENT)
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
  }

  private maybeAudit(
    transcript: string,
    sttConfidence: number,
    result: IntentClassificationResult,
  ): void {
    // T-40-AUDIT: opt-in via env var ALWAYS_LISTENING_AUDIT=true (D-12)
    if (process.env['ALWAYS_LISTENING_AUDIT'] !== 'true') return;
    if (!this.opts.auditLog) return;
    this.opts.auditLog({
      timestamp: new Date().toISOString(),
      transcript,
      sttConfidence,
      classifierScore: result.score,
      verdict: result.verdict,
    });
  }
}
