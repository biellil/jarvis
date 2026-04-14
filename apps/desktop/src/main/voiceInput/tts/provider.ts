/**
 * TTS Provider abstraction.
 *
 * Any TTS backend (ElevenLabs cloud, Murf cloud, etc.) implements this
 * interface so the voice-handler can swap providers via env config sem refatorar
 * o resto do pipeline.
 *
 * Migrated to Electron main process in Phase 30 (TTS-01, TTS-03).
 * Source: apps/backend-ts/src/voice/tts/provider.ts
 */

export type TTSAudioFormat = "mp3" | "wav" | "opus";

export interface TTSResult {
  audio: Buffer;
  format: TTSAudioFormat;
  providerUsed?: string;
}

export interface TTSProvider {
  readonly name: string;
  synthesize(text: string): Promise<TTSResult>;
}
