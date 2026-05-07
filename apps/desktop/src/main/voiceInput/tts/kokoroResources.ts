/**
 * kokoroResources.ts — Kokoro model cache management + download
 *
 * Phase 62 (TTS-OFF-01, TTS-OFF-04): offline neural TTS model management.
 *
 * Architecture: delegates download + caching to KokoroTTS.from_pretrained()
 * (via @huggingface/transformers). env.cacheDir is redirected to userData/hf-cache/
 * so model files survive app updates instead of landing in node_modules.
 *
 * Cache detection: checks HF snapshot directory structure rather than a single
 * fixed file path, matching how from_pretrained() validates the cache.
 */
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

const HF_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
// HF directory key convention: '/' in model ID → '--'
const HF_MODEL_CACHE_KEY = 'models--onnx-community--Kokoro-82M-v1.0-ONNX';

/** Approximate model size for UI display before download starts. */
export const KOKORO_MODEL_SIZE_MB = 350;

/** Base HF cache directory under userData, used as env.cacheDir. */
export function getHFCacheDir(): string {
  return path.join(app.getPath('userData'), 'hf-cache');
}

/**
 * Redirects @huggingface/transformers model caching to userData/hf-cache/.
 * Must be called before any from_pretrained() invocation. Idempotent.
 */
export async function configureHFEnv(): Promise<void> {
  const { env } = await import('@huggingface/transformers');
  env.cacheDir = getHFCacheDir();
  env.useFSCache = true;
}

/**
 * Returns true if the Kokoro model snapshots directory exists and is non-empty.
 * HF cache structure: hf-cache/models--{id}/snapshots/<hash>/
 */
export function isKokoroModelCached(): boolean {
  const snapshotsDir = path.join(getHFCacheDir(), HF_MODEL_CACHE_KEY, 'snapshots');
  if (!fs.existsSync(snapshotsDir)) return false;
  try {
    return fs.readdirSync(snapshotsDir).length > 0;
  } catch {
    return false;
  }
}

export interface KokoroDownloadOptions {
  onProgress?: (percent: number, downloadedMb: number, totalMb: number) => void;
  signal?: AbortSignal;
}

export interface KokoroDownloadResult {
  sizeBytes: number;
}

/**
 * downloadKokoroModel — downloads Kokoro model via KokoroTTS.from_pretrained().
 *
 * Passes AbortSignal via env.fetchOptions so cancellation propagates to the
 * underlying fetch calls inside @huggingface/transformers.
 *
 * Progress: progress_callback fires per-file chunk with {status, progress (0-100),
 * loaded, total}. We forward these as percent/MB values to the UI callback.
 */
export async function downloadKokoroModel(
  options: KokoroDownloadOptions = {},
): Promise<KokoroDownloadResult> {
  const { onProgress, signal } = options;

  await configureHFEnv();

  const { env } = await import('@huggingface/transformers');
  if (signal) {
    // Pass signal to all underlying fetch() calls inside transformers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (env as any).fetchOptions = { signal };
  }

  const { KokoroTTS } = await import('kokoro-js');
  let lastTotalBytes = KOKORO_MODEL_SIZE_MB * 1024 * 1024;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (KokoroTTS as any).from_pretrained(HF_MODEL_ID, {
      dtype: 'q8',
      device: null,
      progress_callback: (progress: {
        status: string;
        progress?: number;
        loaded?: number;
        total?: number;
      }) => {
        const loaded = progress.loaded ?? 0;
        const total = progress.total ?? lastTotalBytes;
        if (total > 0) lastTotalBytes = total;
        const pct = progress.progress ?? Math.floor((loaded / total) * 100);

        onProgress?.(
          Math.min(100, Math.floor(pct)),
          loaded / (1024 * 1024),
          total / (1024 * 1024),
        );
      },
    });
  } finally {
    if (signal) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (env as any).fetchOptions = {};
    }
  }

  if (signal?.aborted) {
    throw Object.assign(new Error('Download cancelled'), { name: 'AbortError' });
  }

  return { sizeBytes: lastTotalBytes };
}
