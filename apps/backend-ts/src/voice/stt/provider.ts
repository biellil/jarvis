/**
 * STTProvider — abstração de Speech-to-Text.
 *
 * Paridade com Python WhisperTranscriber (src/jarvis/core/voice.py):
 * lazy load, transcrição async-safe, default modelo 'base', language 'pt'.
 *
 * Diferença: aceita Buffer direto (nodejs-whisper exige path — tempfile interno).
 */

export interface STTTranscribeOptions {
  /** Código ISO (ex: 'pt', 'en'). Default 'pt'. */
  language?: string;
}

export interface STTProvider {
  readonly name: string;
  transcribe(audio: Buffer, opts?: STTTranscribeOptions): Promise<string>;
}
