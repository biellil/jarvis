/**
 * whisperModelResolver.ts — Pure WhisperModelOption → WhisperModel resolver
 *
 * Phase 50 D-12: Centralises the UI option → backend model mapping.
 * Pure function: no Electron deps, no I/O — fully testable.
 *
 * Mappings:
 *   auto          → resolved via VRAM detection (vramMb arg)
 *   tiny          → tiny
 *   base          → base
 *   small         → base   (no separate model file; documented fallback per D-12)
 *   medium        → medium
 *   large-v3-turbo→ large  (ggml-large-v3.bin is the same file per MODEL_FILENAMES)
 *
 * VRAM thresholds for 'auto' (mirrors detectVramAndSelectModel in vramDetection.ts):
 *   >8192 MB → large
 *   >0 MB (GPU present) → medium
 *   0 MB (CPU only)    → tiny
 */
import type { WhisperModel } from './whisperResources.js';
import type { WhisperModelOption } from '../../shared/ipc-types.js';

export const OPTION_TO_MODEL: Partial<Record<WhisperModelOption, WhisperModel>> = {
  tiny: 'tiny',
  base: 'base',
  small: 'base',        // D-12: no URL for small; documented fallback
  medium: 'medium',
  'large-v3-turbo': 'large',  // D-12: same ggml-large-v3.bin
};

/**
 * selectModelByVram — pure VRAM MB → WhisperModel mapping.
 * Mirrors the thresholds in detectVramAndSelectModel (vramDetection.ts).
 *
 * @param vramMb - Detected VRAM in MB (0 = CPU-only / unknown)
 */
function selectModelByVram(vramMb: number): WhisperModel {
  if (vramMb <= 0) return 'tiny';      // CPU fallback
  if (vramMb > 8192) return 'large';
  return 'medium';                      // GPU with <8192 MB
}

/**
 * resolveWhisperModel — maps a UI WhisperModelOption to a backend WhisperModel.
 *
 * @param option  - UI option value (from Settings Select)
 * @param vramMb  - Detected VRAM in MB (required for 'auto'; pass 0 for CPU/unknown)
 */
export function resolveWhisperModel(option: WhisperModelOption, vramMb: number): WhisperModel {
  // Phase 68 D-03: 'auto' removed from WhisperModelOption; branch removed.
  return OPTION_TO_MODEL[option] ?? selectModelByVram(vramMb);
}
