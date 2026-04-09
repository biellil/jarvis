import { pipeline } from "@xenova/transformers";
import { float32ToWav } from "./wav-encoder.js";
import type { TTSProvider, TTSResult } from "./provider.js";

/**
 * LocalTTSProvider — fallback TTS backend usando Transformers.js + Speecht5.
 *
 * Speecht5 é English-only na prática; qualidade pt-BR é ruim. Usado como
 * fallback quando ElevenLabs (cloud) não está disponível. Modelo é baixado
 * no primeiro `synthesize` (lazy load) e reutilizado em chamadas subsequentes.
 */

const DEFAULT_SPEAKER_EMBEDDINGS =
  "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Synthesizer = (text: string, options: { speaker_embeddings: string }) => Promise<{
  audio: Float32Array;
  sampling_rate: number;
}>;

export class LocalTTSProvider implements TTSProvider {
  readonly name = "local";
  private _pipeline: Synthesizer | null = null;

  private async getPipeline(): Promise<Synthesizer> {
    if (!this._pipeline) {
      this._pipeline = (await pipeline("text-to-speech", "Xenova/speecht5_tts", {
        quantized: false,
      })) as unknown as Synthesizer;
    }
    return this._pipeline;
  }

  async synthesize(text: string): Promise<TTSResult> {
    if (!text || text.trim().length === 0) {
      throw new Error("LocalTTSProvider: empty text");
    }

    if (/[^\x00-\x7F]/.test(text)) {
      console.warn(
        "[voice] LocalTTSProvider: Speecht5 is English-only; non-ASCII text (pt-BR) quality will be poor",
      );
    }

    const synth = await this.getPipeline();
    const speakerEmbeddings =
      process.env.TTS_LOCAL_SPEAKER_EMBEDDINGS ?? DEFAULT_SPEAKER_EMBEDDINGS;
    const out = await synth(text, { speaker_embeddings: speakerEmbeddings });
    const samples = out.audio;
    const sampleRate = out.sampling_rate ?? 16000;

    return { audio: float32ToWav(samples, sampleRate), format: "wav" };
  }
}
