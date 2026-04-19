/**
 * whisperResources.ts — whisper model path resolver + auto-downloader
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
import fs from 'node:fs';
import https from 'node:https';

export type WhisperModel = 'tiny' | 'base' | 'large';

const MODEL_FILENAMES: Record<WhisperModel, string> = {
  tiny: 'ggml-tiny.bin',
  base: 'ggml-base.bin',
  large: 'ggml-large-v3.bin',
};

const MODEL_URLS: Record<WhisperModel, string> = {
  tiny: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
  base: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  large: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
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

export interface WhisperInstance {
  transcribe(wavBuffer: Buffer): Promise<{ result?: string }>;
}

/**
 * Downloads the whisper model if not already present.
 * Shows progress in console. Follows redirects (HuggingFace uses 302).
 */
export async function ensureWhisperModel(modelName: WhisperModel = 'base'): Promise<void> {
  if (app.isPackaged) return; // packaged builds use extraResources — no download needed

  const modelPath = getWhisperModelPath(modelName);
  if (fs.existsSync(modelPath)) return;

  const modelsDir = getWhisperModelsDir();
  fs.mkdirSync(modelsDir, { recursive: true });

  const url = MODEL_URLS[modelName];
  console.log(`[whisper] Model not found — downloading ${MODEL_FILENAMES[modelName]} (~${modelName === 'tiny' ? '75' : modelName === 'base' ? '142' : '1500'} MB)...`);

  await downloadFile(url, modelPath);
  console.log(`[whisper] Model downloaded: ${modelPath}`);
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmpPath = `${dest}.tmp`;
    const file = fs.createWriteStream(tmpPath);

    const request = (urlStr: string) => {
      https.get(urlStr, (res) => {
        // Follow redirects
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          return request(res.headers.location!);
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(tmpPath);
          return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        }

        const total = parseInt(res.headers['content-length'] ?? '0', 10);
        let downloaded = 0;
        let lastPct = 0;

        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          if (total > 0) {
            const pct = Math.floor((downloaded / total) * 100);
            if (pct >= lastPct + 10) {
              lastPct = pct;
              console.log(`[whisper] Downloading... ${pct}%`);
            }
          }
        });

        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            fs.renameSync(tmpPath, dest);
            resolve();
          });
        });
      }).on('error', (err) => {
        fs.unlinkSync(tmpPath);
        reject(err);
      });
    };

    request(url);
  });
}

/**
 * getWhisperInstance — loads @fugood/whisper.node and returns an initialized instance.
 *
 * Extracted here so voiceHandler can use it via getWhisperInstance (testable mock point).
 * Dynamic import handles ASAR compatibility in packaged Electron apps.
 */
export async function getWhisperInstance(modelName: WhisperModel = 'base'): Promise<WhisperInstance> {
  const { initWhisper } = await import('@fugood/whisper.node');
  const modelPath = getWhisperModelPath(modelName);
  return initWhisper({ model: modelPath }) as Promise<WhisperInstance>;
}
