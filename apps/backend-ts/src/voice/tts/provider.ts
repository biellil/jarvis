/**
 * TTS Provider abstraction.
 *
 * Any TTS backend (ElevenLabs cloud, Transformers.js local, etc.) implements this
 * interface so the voice-handler can swap providers via env config sem refatorar
 * o resto do pipeline.
 */

export type TTSAudioFormat = "mp3" | "wav" | "opus";

export interface TTSResult {
  audio: Buffer;
  format: TTSAudioFormat;
}

export interface TTSProvider {
  readonly name: string;
  synthesize(text: string): Promise<TTSResult>;
}
