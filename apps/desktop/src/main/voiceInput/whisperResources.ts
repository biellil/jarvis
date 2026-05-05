/**
 * whisperResources.ts — whisper model path resolver + auto-downloader
 *
 * Phase 29: hardcoded ggml-base.bin in userData (single-model PoC).
 * Phase 30 (D-06): 3 models, paths from process.resourcesPath in packaged builds
 * (extraResources), userData fallback in dev for manual model downloads.
 * Phase 50 (D-11): optional onProgress callback + AbortController cancellation +
 * isWhisperModelCached + MODEL_SIZES_MB for UI fallback display.
 *
 * Model filenames (D-05):
 *   'tiny'  → ggml-tiny.bin   (~75 MB)
 *   'base'  → ggml-base.bin   (~142 MB)
 *   'medium'→ ggml-medium.bin (~1500 MB)
 *   'large' → ggml-large-v3.bin (~476 MB)
 */
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import https from 'node:https';
import { getDetectedBackend } from './gpuDetection.js';

export type WhisperModel = 'tiny' | 'base' | 'medium' | 'large';

// ============================================
// Phase 50 — Download progress types (D-11)
// ============================================

export interface WhisperDownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
  percent: number;  // 0-100
}

export interface EnsureWhisperModelOptions {
  onProgress?: (p: WhisperDownloadProgress) => void;
  signal?: AbortSignal;
}

// ============================================
// Model metadata
// ============================================

const MODEL_FILENAMES: Record<WhisperModel, string> = {
  tiny: 'ggml-tiny.bin',
  base: 'ggml-base.bin',
  medium: 'ggml-medium.bin',
  large: 'ggml-large-v3.bin',
};

/**
 * Approximate model sizes in MB — used for UI fallback display before
 * content-length header arrives (Phase 50 D-11).
 */
export const MODEL_SIZES_MB: Record<WhisperModel, number> = {
  tiny: 75,
  base: 142,
  medium: 1500,
  large: 476,
};

const MODEL_URLS: Record<WhisperModel, string> = {
  tiny:   'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
  base:   'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  medium: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
  large:  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
};

/**
 * Returns the directory containing whisper models.
 * In packaged app: reads from process.resourcesPath/models/whisper/ (bundled via extraResources).
 * In dev: falls back to apps/desktop/resources/models/whisper/ for manual downloads.
 */
export function getWhisperModelsDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath!, 'models', 'whisper');
  }
  return path.resolve(__dirname, '../../resources/models/whisper');
}

export function getWhisperModelPath(modelName: WhisperModel = 'base'): string {
  return path.join(getWhisperModelsDir(), MODEL_FILENAMES[modelName]);
}

/**
 * isWhisperModelCached — checks whether a model file exists on disk.
 *
 * Phase 50 D-11: Used by IPC handler (Plan 50-02) to skip download on cache hit.
 * In packaged builds, extraResources bundles the selected model — always returns true.
 */
export function isWhisperModelCached(modelName: WhisperModel): boolean {
  if (app.isPackaged) return true; // extraResources always present
  return fs.existsSync(getWhisperModelPath(modelName));
}

/**
 * TranscribeResult — resultado do transcribeData() do @fugood/whisper.node.
 *
 * Phase 40 (D-08): se whisper.cpp expuser confidence por segmento, usar 'confidence'.
 * Caso contrário, AlwaysListeningStrategy usa heurística de fallback documentada
 * em alwaysListening.ts extractSttConfidence():
 *   - transcript vazio ou só pontuação → confidence = 0 (skip classifier)
 *   - transcript válido sem campo confidence → confidence = 1.0 (assume confident)
 *
 * NOTE (Phase 40 D-08): @fugood/whisper.node não expõe per-segment confidence
 * na API atual (verificado durante Phase 40-02 — ver RESEARCH.md A3/Q1).
 * O campo é declarado opcional para permitir upgrade transparente no futuro
 * sem quebrar callers; por ora, AlwaysListeningStrategy depende exclusivamente
 * da heurística fallback. Documentação centralizada aqui evita descoberta
 * silenciosa em waves seguintes (Plan 40-04 e 40-05).
 */
export interface TranscribeResult {
  /** Texto transcrito — campo nativo já existente */
  result?: string;
  /** 0-1 per-segment confidence (Phase 40 D-08 — opcional, fallback heurístico documentado) */
  confidence?: number;
}

export interface WhisperInstance {
  transcribeData(audioBuffer: ArrayBuffer, options?: { language?: string }): {
    stop: () => Promise<void>;
    promise: Promise<TranscribeResult>;
  };
  release(): Promise<void>;
}

// In-flight download promise map — deduplicates concurrent calls.
const _downloadPromises = new Map<WhisperModel, Promise<void>>();

// AbortControllers for in-flight downloads — enables cancellation from IPC handler (Plan 50-02).
const _downloadControllers = new Map<WhisperModel, AbortController>();

/**
 * ensureWhisperModel — downloads the whisper model if not already present.
 *
 * Phase 50 D-11 extensions:
 *   - Optional second parameter `options` with `onProgress?` and `signal?`
 *   - `onProgress` is called throttled at 1%/250ms (whichever comes first)
 *   - `signal` allows AbortController-based cancellation + tmp file cleanup
 *
 * Existing callers (getWhisperInstance) pass no options → fully backwards-compatible.
 * Concurrent calls for the same model share one in-flight promise (dedup preserved).
 */
export function ensureWhisperModel(
  modelName: WhisperModel = 'base',
  options: EnsureWhisperModelOptions = {},
): Promise<void> {
  // Abort immediately if signal is pre-aborted
  if (options.signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }

  if (app.isPackaged) return Promise.resolve(); // packaged builds use extraResources

  if (isWhisperModelCached(modelName)) return Promise.resolve();

  const existing = _downloadPromises.get(modelName);
  if (existing) return existing;

  const modelsDir = getWhisperModelsDir();
  fs.mkdirSync(modelsDir, { recursive: true });

  const url = MODEL_URLS[modelName];
  const sizeMb = MODEL_SIZES_MB[modelName];
  console.log(`[whisper] Model not found — downloading ${MODEL_FILENAMES[modelName]} (~${sizeMb} MB)...`);

  // Create AbortController for this download (allows Plan 50-02 IPC handler to cancel)
  const controller = new AbortController();
  _downloadControllers.set(modelName, controller);

  const modelPath = getWhisperModelPath(modelName);
  // Merge caller's signal with our internal controller signal
  const mergedOptions: EnsureWhisperModelOptions = {
    ...options,
    signal: controller.signal,
  };

  const promise = downloadFile(url, modelPath, mergedOptions)
    .then(() => {
      console.log(`[whisper] Model downloaded: ${modelPath}`);
      _downloadPromises.delete(modelName);
      _downloadControllers.delete(modelName);
    })
    .catch((err: unknown) => {
      _downloadPromises.delete(modelName); // allow retry on next call
      _downloadControllers.delete(modelName);
      throw err;
    });

  _downloadPromises.set(modelName, promise);
  return promise;
}

function downloadFile(url: string, dest: string, options: EnsureWhisperModelOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const { onProgress, signal } = options;
    const tmpPath = `${dest}.tmp`;
    const file = fs.createWriteStream(tmpPath);

    let rejected = false;
    const rejectOnce = (err: Error | DOMException) => {
      if (rejected) return;
      rejected = true;
      reject(err);
    };

    const safeUnlink = () => {
      try { fs.unlinkSync(tmpPath); } catch { /* already gone */ }
    };

    const request = (urlStr: string) => {
      // Check abort before issuing request
      if (signal?.aborted) {
        file.close();
        safeUnlink();
        rejectOnce(new DOMException('Aborted', 'AbortError'));
        return;
      }

      const req = https.get(urlStr, (res) => {
        // Follow redirects — do NOT close file; drain response and reuse the same WriteStream
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          res.resume();
          request(res.headers.location!);
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          safeUnlink();
          rejectOnce(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }

        const total = parseInt(res.headers['content-length'] ?? '0', 10);
        let downloaded = 0;
        let lastPct = -1;
        let lastEmitMs = 0;

        res.on('data', (chunk: Buffer) => {
          if (signal?.aborted) {
            req.destroy();
            file.close();
            safeUnlink();
            rejectOnce(new DOMException('Aborted', 'AbortError'));
            return;
          }

          downloaded += chunk.length;
          if (total > 0 && onProgress) {
            const pct = Math.floor((downloaded / total) * 100);
            const now = Date.now();
            // Throttle: emit when pct changed by >=1% OR 250ms elapsed
            if (pct !== lastPct || now - lastEmitMs >= 250) {
              lastPct = pct;
              lastEmitMs = now;
              onProgress({ downloadedBytes: downloaded, totalBytes: total, percent: pct });
            }
          }
        });

        res.pipe(file);
        file.on('finish', () => {
          // Emit final 100% unconditionally before resolving
          if (onProgress && total > 0) {
            onProgress({ downloadedBytes: total, totalBytes: total, percent: 100 });
          }
          file.close(() => {
            fs.renameSync(tmpPath, dest);
            resolve();
          });
        });
      });

      req.on('error', (err) => {
        if (signal?.aborted) return; // suppress double-reject noise on abort
        safeUnlink();
        rejectOnce(err);
      });
    };

    request(url);
  });
}

/**
 * getWhisperInstance — loads @fugood/whisper.node and returns an initialized instance.
 *
 * Awaits any in-progress background download before loading — callers never
 * see "Model path is required" when the file is still being fetched.
 *
 * Extracted here so voiceHandler can use it via getWhisperInstance (testable mock point).
 * Dynamic import handles ASAR compatibility in packaged Electron apps.
 */
export async function getWhisperInstance(modelName: WhisperModel = 'base'): Promise<WhisperInstance> {
  await ensureWhisperModel(modelName);
  const { initWhisper } = await import('@fugood/whisper.node');
  const modelPath = getWhisperModelPath(modelName);
  const backend = getDetectedBackend();
  const useGpu = backend !== 'cpu';
  const variant = useGpu ? backend : undefined;
  return initWhisper(
    { filePath: modelPath, useGpu } as Parameters<typeof initWhisper>[0],
    variant as Parameters<typeof initWhisper>[1],
  ) as Promise<WhisperInstance>;
}
