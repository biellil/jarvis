/**
 * selectWhisperModel.ts — Pure model selection helper (PATCH-02).
 *
 * Applies user Whisper model override (from Settings) on top of the VRAM-detected
 * model. Extracted as a pure function for testability (no Electron deps).
 *
 * Supported models (faster-whisper 1.2.1): 'tiny' | 'base' | 'medium' | 'large'
 * Override values 'small' and 'large-v3-turbo' are NOT supported in this version
 * and fall back to the VRAM selection with a console.warn.
 */
import type { WhisperModel } from './vramDetection.js';
import type { WhisperModelOption } from '../../shared/ipc-types.js';

const SUPPORTED_MODELS: WhisperModel[] = ['tiny', 'base', 'medium', 'large'];

/**
 * selectWhisperModel — applies user override on top of VRAM-detected model.
 *
 * @param vramModel - Model selected by VRAM detection
 * @param override  - User preference from Settings ('auto' means no override)
 * @returns         - Final model to use for STT inference
 */
export function selectWhisperModel(
  vramModel: WhisperModel,
  override: WhisperModelOption,
): WhisperModel {
  if (override === 'auto') {
    return vramModel;
  }

  if (SUPPORTED_MODELS.includes(override as WhisperModel)) {
    return override as WhisperModel;
  }

  // override value ('small', 'large-v3-turbo') not supported by faster-whisper 1.2.1
  console.warn(
    `[voice] Model override '${override}' is not supported in this version — using VRAM selection: ${vramModel}`,
  );
  return vramModel;
}
