/**
 * gpuDetection.ts — GPU backend auto-detection for whisper.cpp
 *
 * Detects the best available GPU backend at app startup (D-09).
 * Order: CUDA (NVIDIA) → Vulkan (AMD/Intel) → Metal (Apple) → CPU (fallback).
 * Result is cached in module scope — zero overhead per transcription (D-09).
 *
 * Log strings are EXACT per success criteria 1 and D-12:
 *   success: "Using GPU backend: [cuda|vulkan|metal]"
 *   fallback: "Falling back to CPU"
 */
import { initWhisper } from '@fugood/whisper.node';

type GpuBackend = 'cuda' | 'vulkan' | 'metal' | 'cpu';

// undefined = not yet initialized; string = cached result
let detectedBackend: GpuBackend | undefined;

const GPU_BACKENDS: GpuBackend[] = ['cuda', 'vulkan', 'metal'];

export async function initializeGpuDetection(): Promise<void> {
  // Cache guard — do not re-detect if already ran (D-09)
  if (detectedBackend !== undefined) {
    return;
  }

  for (const backend of GPU_BACKENDS) {
    try {
      console.debug(`[whisper] attempting GPU backend: ${backend}`);
      // initWhisper with empty model path just tests driver availability
      await initWhisper({ model: '', useGpu: true }, backend as Parameters<typeof initWhisper>[1]);
      detectedBackend = backend;
      // D-12: exact log string required by success criteria 1
      console.log(`Using GPU backend: ${backend}`);
      return;
    } catch (err) {
      console.debug(`[whisper] ${backend} not available: ${String(err)}`);
    }
  }

  // All GPU backends failed — fall back to CPU
  detectedBackend = 'cpu';
  // D-12: exact log string required by success criteria 1
  console.log('Falling back to CPU');
}

export function getDetectedBackend(): GpuBackend {
  // Returns 'cpu' as safe default if called before initializeGpuDetection
  return detectedBackend ?? 'cpu';
}
