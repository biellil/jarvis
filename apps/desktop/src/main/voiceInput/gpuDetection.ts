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
 *
 * Module loading (Phase 29, INFRA-01):
 * - @fugood/whisper.node is lazy-loaded (dynamic import) inside initializeGpuDetection()
 * - This ensures index.ts can set up Module.globalPaths BEFORE the first import resolves
 * - In packaged app: index.ts adds process.resourcesPath/node_modules to globalPaths first
 * - In dev: pnpm workspace resolution handles the module path automatically
 * - Lazy import also enables vitest vi.mock() to intercept the call in tests
 */
import { createRequire } from 'node:module';
import { ensureWhisperModel, getWhisperModelPath } from './whisperResources.js';

const _require = createRequire(import.meta.url);

type GpuBackend = 'cuda' | 'vulkan' | 'metal' | 'cpu';

// undefined = not yet initialized; string = cached result
let detectedBackend: GpuBackend | undefined;

const GPU_BACKENDS: GpuBackend[] = ['cuda', 'vulkan', 'metal'];

export async function initializeGpuDetection(): Promise<void> {
  // Cache guard — do not re-detect if already ran (D-09)
  if (detectedBackend !== undefined) {
    return;
  }

  // Wait for model file — initWhisper rejects empty/missing paths before GPU probe.
  // ensureWhisperModel returns immediately if file already exists or is in-flight.
  await ensureWhisperModel('base');
  const modelPath = getWhisperModelPath('base');

  // Lazy dynamic import — allows vi.mock() to intercept in tests, and ensures
  // index.ts has set up Module.globalPaths before this runs in packaged app.
  const { initWhisper } = await import('@fugood/whisper.node');

  for (const backend of GPU_BACKENDS) {
    try {
      console.debug(`[whisper] attempting GPU backend: ${backend}`);
      // Pre-check: verify the platform-specific variant package actually exists.
      // initWhisper silently falls back to the default (CPU) build when the variant
      // package is missing — that would produce a false positive GPU detection.
      const platformPkg = `@fugood/node-whisper-${process.platform}-${process.arch}-${backend}`;
      _require(platformPkg);
      // Package exists — now probe with initWhisper
      const probe = await initWhisper({ filePath: modelPath, useGpu: true } as Parameters<typeof initWhisper>[0], backend as Parameters<typeof initWhisper>[1]);
      await (probe as { release(): Promise<void> }).release();
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
