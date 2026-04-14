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

export type WhisperModel = 'tiny' | 'base' | 'large';

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

  // D-03: vramMb=0 means GPU integrated or driver incomplete → safe fallback to base
  if (vramMb === 0) {
    console.log('[whisper] Selecting model: base');
    selectedModel = 'base';
    return 'base';
  }

  if (vramMb > 8192) {
    console.log('[whisper] Selecting model: large');
    selectedModel = 'large';
  } else if (vramMb >= 4096) {
    console.log('[whisper] Selecting model: base');
    selectedModel = 'base';
  } else {
    console.log('[whisper] Selecting model: tiny (CPU fallback)');
    selectedModel = 'tiny';
  }

  return selectedModel;
}

/** Returns cached model selection. Returns 'base' if detectVramAndSelectModel has not run. */
export function getSelectedModel(): WhisperModel {
  return selectedModel ?? 'base';
}
