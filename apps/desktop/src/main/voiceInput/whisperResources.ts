/**
 * whisperResources.ts — whisper model path resolver (Phase 29 → Phase 30 update)
 *
 * Phase 29: hardcoded ggml-base.bin in userData (single-model PoC).
 * Phase 30 (D-06): 3 models, paths from process.resourcesPath in packaged builds
 * (extraResources), userData fallback in dev for manual model downloads.
 *
 * Model filenames (D-05):
 *   'tiny'  → ggml-tiny.bin   (~75 MB)
 *   'base'  → ggml-base.bin   (~142 MB)
 *   'large' → ggml-large-v3.bin (~1.5 GB)
 */
import { app } from 'electron';
import path from 'node:path';

export type WhisperModel = 'tiny' | 'base' | 'large';

const MODEL_FILENAMES: Record<WhisperModel, string> = {
  tiny: 'ggml-tiny.bin',
  base: 'ggml-base.bin',
  large: 'ggml-large-v3.bin',
};

/**
 * Returns absolute path to the specified whisper model binary.
 * In packaged app: reads from process.resourcesPath/models/whisper/ (bundled via extraResources).
 * In dev: falls back to app.getPath('userData')/models/whisper/ for manual downloads.
 */
export function getWhisperModelPath(modelName: WhisperModel = 'base'): string {
  const filename = MODEL_FILENAMES[modelName];
  if (app.isPackaged) {
    return path.join(process.resourcesPath!, 'models', 'whisper', filename);
  }
  return path.join(app.getPath('userData'), 'models', 'whisper', filename);
}

/** Returns the directory containing whisper models. */
export function getWhisperModelsDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath!, 'models', 'whisper');
  }
  return path.join(app.getPath('userData'), 'models', 'whisper');
}
