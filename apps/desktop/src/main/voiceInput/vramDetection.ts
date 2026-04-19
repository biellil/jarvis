/**
 * vramDetection.ts — VRAM measurement and whisper model selection.
 *
 * Complements gpuDetection.ts (backend type) with VRAM measurement (model size).
 * Called once at startup after initializeGpuDetection(). Result cached in module scope.
 *
 * Thresholds (STT-02, D-02):
 *   >8192 MB → 'large' (ggml-large-v3.bin, ~1.5 GB)
 *   4096–8192 MB → 'base' (ggml-base.bin, ~142 MB)
 *   <4096 MB → 'tiny' (ggml-tiny.bin, ~75 MB, CPU fallback)
 *
 * Fallback (D-03): gpuMemoryMB=0 or undefined → 'base' (safe conservative)
 *
 * Log format (D-04, required by STT-02 success criteria):
 *   '[whisper] VRAM detected: {N} MB'
 *   '[whisper] Selecting model: large|base|tiny (CPU fallback)'
 */
import { app } from 'electron';
import { getDetectedBackend } from './gpuDetection.js';

export type WhisperModel = 'tiny' | 'base' | 'medium' | 'large';

// undefined = not yet initialized; string = cached result
let selectedModel: WhisperModel | undefined;

export async function detectVramAndSelectModel(): Promise<WhisperModel> {
  if (selectedModel !== undefined) {
    return selectedModel;
  }

  const gpuInfo = await app.getGPUInfo('complete') as {
    auxAttributes?: { gpuMemoryMB?: string | number };
  };

  let vramMb = 0;
  const raw = gpuInfo?.auxAttributes?.gpuMemoryMB;
  if (raw !== undefined && raw !== null) {
    vramMb = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (isNaN(vramMb)) vramMb = 0;
  }

  console.log(`[whisper] VRAM detected: ${vramMb} MB`);

  const gpuBackend = getDetectedBackend();
  const hasGpu = gpuBackend !== 'cpu';

  if (!hasGpu) {
    console.log('[whisper] Selecting model: base (CPU)');
    selectedModel = 'base';
    return 'base';
  }

  // GPU available — use medium by default; large only when VRAM clearly supports it
  if (vramMb > 8192) {
    console.log('[whisper] Selecting model: large');
    selectedModel = 'large';
  } else {
    console.log('[whisper] Selecting model: medium (GPU)');
    selectedModel = 'medium';
  }

  return selectedModel;
}

/** Returns cached model selection. Returns 'base' if detectVramAndSelectModel has not run. */
export function getSelectedModel(): WhisperModel {
  return selectedModel ?? 'base';
}
