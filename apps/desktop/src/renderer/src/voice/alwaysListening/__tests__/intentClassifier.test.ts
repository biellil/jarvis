/**
 * intentClassifier.test.ts — Phase 40 Plan 03 (Wave 1, TDD)
 *
 * Phase 40 — Always-Listening + Intent Classifier
 * Requisito: VLISTEN-02 — classifier local filtra falsos positivos
 *
 * Threat coverage:
 *  - T-40-INTENT (Tampering): cosine similarity em embeddings normalizados
 *  - T-40-TIMEOUT (Business Logic): timeout 300ms → send-anyway
 *  - T-40-AUDIT (Information Disclosure): audit log opt-in only via env var
 *
 * Mock: @xenova/transformers é mockado para evitar download real do modelo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @xenova/transformers ANTES de importar o módulo
const mockExtractor = vi.fn();
vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn(async () => mockExtractor),
  env: {
    cacheDir: '',
    localModelPath: '',
    allowRemoteModels: true,
  },
}));

import { IntentClassifier } from '../intentClassifier';
import fixtures from './fixtures/intent-pt-br.json';

/**
 * Build a deterministic mock embedding based on the input text.
 * Positive examples and inputs containing positive keywords get the SAME high-similarity vector.
 * Negative examples and short filler words get the negative vector.
 */
function makeMockEmbedding(text: string): { data: Float32Array } {
  const positiveKeywords = [
    'abre', 'abrir', 'fecha', 'fechar', 'liga', 'ligar', 'pausa', 'pausar',
    'próxima', 'reproduz', 'reproduzir', 'aumenta', 'diminui', 'qual', 'como',
    'me faz', 'preciso', 'oi jarvis', 'ei jarvis', 'olá jarvis', 'hora',
    'tempo', 'volume', 'música', 'playlist', 'previsão', 'resumo', 'data',
  ];

  const lower = text.toLowerCase().trim();
  const isPositive = positiveKeywords.some((kw) => lower.includes(kw));

  // 384-dim vector (multilingual-e5-small dimension)
  const vec = new Float32Array(384);
  if (isPositive) {
    // Positive cluster: vector near [1,0,0...] normalized
    vec[0] = 0.95;
    vec[1] = 0.1;
    vec[2] = 0.1;
    // L2 normalize
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i]! * vec[i]!;
    norm = Math.sqrt(norm);
    for (let i = 0; i < vec.length; i++) vec[i] = vec[i]! / norm;
  } else {
    // Negative cluster: vector near [0,1,0...] normalized
    vec[0] = 0.1;
    vec[1] = 0.95;
    vec[2] = 0.1;
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i]! * vec[i]!;
    norm = Math.sqrt(norm);
    for (let i = 0; i < vec.length; i++) vec[i] = vec[i]! / norm;
  }
  return { data: vec };
}

describe('IntentClassifier (VLISTEN-02, T-40-INTENT)', () => {
  beforeEach(() => {
    mockExtractor.mockReset();
    mockExtractor.mockImplementation(async (text: string) => makeMockEmbedding(text));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('load()', () => {
    it('load() resolves without throwing when model available', async () => {
      const classifier = new IntentClassifier({
        modelId: 'Xenova/multilingual-e5-small',
        threshold: 0.6,
        sttConfidenceThreshold: 0.5,
        timeoutMs: 300,
      });
      await expect(classifier.load()).resolves.toBeUndefined();
    });

    it('load() pre-computes embeddings for all few-shot examples', async () => {
      const classifier = new IntentClassifier({
        modelId: 'Xenova/multilingual-e5-small',
        threshold: 0.6,
        sttConfidenceThreshold: 0.5,
        timeoutMs: 300,
      });
      await classifier.load();
      // 15 positive + 10 negative = 25 examples
      expect(mockExtractor).toHaveBeenCalledTimes(25);
    });
  });

  describe('classify() — binary output', () => {
    it('returns shape { hasIntent, score, verdict, latencyMs }', async () => {
      const classifier = new IntentClassifier({
        modelId: 'Xenova/multilingual-e5-small',
        threshold: 0.6,
        sttConfidenceThreshold: 0.5,
        timeoutMs: 300,
      });
      await classifier.load();
      const result = await classifier.classify('abre o terminal', 1.0);
      expect(result).toHaveProperty('hasIntent');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('verdict');
      expect(result).toHaveProperty('latencyMs');
      expect(typeof result.hasIntent).toBe('boolean');
      expect(typeof result.score).toBe('number');
    });

    it('classify("abre o terminal", 1.0) → hasIntent = true (score > 0.6)', async () => {
      const classifier = new IntentClassifier({
        modelId: 'Xenova/multilingual-e5-small',
        threshold: 0.6,
        sttConfidenceThreshold: 0.5,
        timeoutMs: 300,
      });
      await classifier.load();
      const result = await classifier.classify('abre o terminal', 1.0);
      expect(result.hasIntent).toBe(true);
      expect(result.score).toBeGreaterThan(0.6);
      expect(result.verdict).toBe('classified-intent');
    });

    it('classify("uh", 1.0) → hasIntent = false (no intent in filler word)', async () => {
      const classifier = new IntentClassifier({
        modelId: 'Xenova/multilingual-e5-small',
        threshold: 0.6,
        sttConfidenceThreshold: 0.5,
        timeoutMs: 300,
      });
      await classifier.load();
      const result = await classifier.classify('uh', 1.0);
      expect(result.hasIntent).toBe(false);
      expect(result.verdict).toBe('classified-no-intent');
    });
  });

  describe('classify() — pt-BR fixtures (VLISTEN-02 accuracy)', () => {
    it('all positive fixtures classify as intent', async () => {
      const classifier = new IntentClassifier({
        modelId: 'Xenova/multilingual-e5-small',
        threshold: 0.6,
        sttConfidenceThreshold: 0.5,
        timeoutMs: 300,
      });
      await classifier.load();
      for (const text of fixtures.positive) {
        const result = await classifier.classify(text, 1.0);
        expect(result.hasIntent, `expected intent for "${text}"`).toBe(true);
      }
    });

    it('all negative fixtures classify as no-intent', async () => {
      const classifier = new IntentClassifier({
        modelId: 'Xenova/multilingual-e5-small',
        threshold: 0.6,
        sttConfidenceThreshold: 0.5,
        timeoutMs: 300,
      });
      await classifier.load();
      for (const text of fixtures.negative) {
        const result = await classifier.classify(text, 1.0);
        expect(result.hasIntent, `expected NO intent for "${text}"`).toBe(false);
      }
    });
  });

  describe('STT confidence pre-filter (D-08)', () => {
    it('sttConfidence < 0.5 → verdict = stt-confidence-filtered, hasIntent = true (send-anyway)', async () => {
      const classifier = new IntentClassifier({
        modelId: 'Xenova/multilingual-e5-small',
        threshold: 0.6,
        sttConfidenceThreshold: 0.5,
        timeoutMs: 300,
      });
      await classifier.load();
      const result = await classifier.classify('qualquer coisa', 0.3);
      expect(result.hasIntent).toBe(true);
      expect(result.verdict).toBe('stt-confidence-filtered');
    });

    it('sttConfidence >= 0.5 → runs full classification', async () => {
      const classifier = new IntentClassifier({
        modelId: 'Xenova/multilingual-e5-small',
        threshold: 0.6,
        sttConfidenceThreshold: 0.5,
        timeoutMs: 300,
      });
      await classifier.load();
      const result = await classifier.classify('abre o navegador', 0.6);
      expect(result.verdict).not.toBe('stt-confidence-filtered');
    });
  });

  describe('timeout path (D-10, T-40-TIMEOUT)', () => {
    it('classification exceeding timeoutMs → hasIntent = true, verdict = timeout-send-anyway', async () => {
      // Make extractor very slow on classify (but fast for examples loading)
      let loadCalls = 0;
      mockExtractor.mockImplementation(async (text: string) => {
        loadCalls++;
        if (loadCalls > 25) {
          // After load (25 example embeddings), classify call sleeps 500ms
          await new Promise((r) => setTimeout(r, 500));
        }
        return makeMockEmbedding(text);
      });

      const classifier = new IntentClassifier({
        modelId: 'Xenova/multilingual-e5-small',
        threshold: 0.6,
        sttConfidenceThreshold: 0.5,
        timeoutMs: 100,
      });
      await classifier.load();
      const result = await classifier.classify('abre o terminal', 1.0);
      expect(result.hasIntent).toBe(true);
      expect(result.verdict).toBe('timeout-send-anyway');
    });
  });

  describe('audit log (D-12, T-40-AUDIT)', () => {
    it('audit log opt-in: when ALWAYS_LISTENING_AUDIT=true and auditLog provided, entry is written', async () => {
      const auditEntries: Array<unknown> = [];
      const originalEnv = process.env.ALWAYS_LISTENING_AUDIT;
      process.env.ALWAYS_LISTENING_AUDIT = 'true';

      try {
        const classifier = new IntentClassifier({
          modelId: 'Xenova/multilingual-e5-small',
          threshold: 0.6,
          sttConfidenceThreshold: 0.5,
          timeoutMs: 300,
          auditLog: (entry) => auditEntries.push(entry),
        });
        await classifier.load();
        await classifier.classify('abre o terminal', 1.0);
        expect(auditEntries.length).toBeGreaterThan(0);
      } finally {
        if (originalEnv === undefined) {
          delete process.env.ALWAYS_LISTENING_AUDIT;
        } else {
          process.env.ALWAYS_LISTENING_AUDIT = originalEnv;
        }
      }
    });

    it('audit log default OFF: without env var, no entry even if auditLog provided', async () => {
      const auditEntries: Array<unknown> = [];
      const originalEnv = process.env.ALWAYS_LISTENING_AUDIT;
      delete process.env.ALWAYS_LISTENING_AUDIT;

      try {
        const classifier = new IntentClassifier({
          modelId: 'Xenova/multilingual-e5-small',
          threshold: 0.6,
          sttConfidenceThreshold: 0.5,
          timeoutMs: 300,
          auditLog: (entry) => auditEntries.push(entry),
        });
        await classifier.load();
        await classifier.classify('abre o terminal', 1.0);
        expect(auditEntries.length).toBe(0);
      } finally {
        if (originalEnv !== undefined) {
          process.env.ALWAYS_LISTENING_AUDIT = originalEnv;
        }
      }
    });
  });

  describe('unload()', () => {
    it('unload() releases extractor — internal state cleared', async () => {
      const classifier = new IntentClassifier({
        modelId: 'Xenova/multilingual-e5-small',
        threshold: 0.6,
        sttConfidenceThreshold: 0.5,
        timeoutMs: 300,
      });
      await classifier.load();
      classifier.unload();
      // After unload, classify should still work via send-anyway (no crash)
      const result = await classifier.classify('abre o terminal', 1.0);
      // hasIntent true via timeout/error path (extractor null)
      expect(result.hasIntent).toBe(true);
    });
  });
});
