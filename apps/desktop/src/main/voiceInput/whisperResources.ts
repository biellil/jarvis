/**
 * whisperResources.ts — model path resolver for whisper.cpp
 *
 * Follows the EXACT same pattern as voiceInput/resources.ts (D-02).
 * Models are stored in app.getPath('userData')/models/whisper/ (D-03).
 * userData is always a real filesystem path, not inside ASAR — safe for
 * native addon loading in both dev and packaged builds.
 *
 * Phase 29 PoC uses model: ggml-base.bin (~142 MB, D-05).
 * Phase 30 will add model selection by VRAM (STT-02).
 */
import { app } from 'electron';
import path from 'node:path';

/** Returns the absolute path to the whisper model file.
 *  Model is downloaded to userData on first use (D-03, D-04). */
export function getWhisperModelPath(): string {
  return path.join(
    app.getPath('userData'),
    'models',
    'whisper',
    'ggml-base.bin',
  );
}

/** Returns the directory where whisper models are stored.
 *  Creates the directory if needed before model download. */
export function getWhisperModelsDir(): string {
  return path.join(app.getPath('userData'), 'models', 'whisper');
}
