/**
 * kokoro.ts — KokoroTTSProvider
 *
 * Phase 62 (TTS-OFF-01): Offline neural TTS using kokoro-js (82M ONNX model).
 * Implements TTSProvider interface — fully compatible with streaming TTS pipeline
 * from Phase 53 (synthesize() is stateless, per D-08).
 *
 * Model loading:
 * - Lazy-loaded on first synthesize() call (not in constructor)
 * - Singleton instance reused across calls (no per-call ONNX session overhead)
 * - GPU auto-detect via ONNX Runtime device='auto' (CUDA/Metal/CPU, per D-10)
 *
 * No timeout (D-09) — GPU/CPU generates at hardware speed; user accepts this.
 * Default voice: 'af_alloy' (English, well-tested); no user-configurable voice ID in v3.0 (deferred).
 */
import type { TTSProvider, TTSResult } from './provider.js';
import { configureHFEnv } from './kokoroResources.js';

export class KokoroTTSProvider implements TTSProvider {
  readonly name = 'kokoro';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tts: any | null = null;
  private readonly voiceId: string;

  constructor() {
    // Default voice: 'af_alloy' (English, well-tested per research).
    // pt-BR voices exist in the model but require exact ID from kokoro-js docs.
    // Deferred: user-configurable voice ID (CONTEXT.md Deferred Ideas).
    this.voiceId = process.env['KOKORO_VOICE_ID'] ?? 'af_alloy';
  }

  async synthesize(text: string): Promise<TTSResult> {
    if (!text || text.trim().length === 0) {
      throw new Error('KokoroTTSProvider: empty text');
    }

    // Lazy-load model on first call (D: Claude's Discretion — avoids blocking constructor)
    if (!this.tts) {
      try {
        await configureHFEnv();
        const { KokoroTTS } = await import('kokoro-js');
        this.tts = await KokoroTTS.from_pretrained(
          'onnx-community/Kokoro-82M-v1.0-ONNX',
          {
            dtype: 'q8',    // int8 quantization — balance of size/quality/speed
            // device: null = kokoro-js default (auto-selects best backend: webgpu → wasm → cpu).
            // D-10: ONNX Runtime auto-select; 'auto' is not in kokoro-js type definition.
            device: null,
          }
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`KokoroTTSProvider: failed to load model: ${msg}`);
      }
    }

    try {
      const audio = await this.tts.generate(text, { voice: this.voiceId });
      return {
        audio: Buffer.from(audio as ArrayBuffer),
        format: 'wav',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`KokoroTTSProvider: synthesis failed: ${msg}`);
    }
  }
}
