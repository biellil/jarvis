/**
 * kokoroResources.ts — Kokoro model path resolver + downloader
 *
 * Phase 62 (TTS-OFF-01, TTS-OFF-04): offline neural TTS model management.
 * Pattern mirrors whisperResources.ts (Phase 50) exactly.
 *
 * Model: onnx-community/Kokoro-82M-v1.0-ONNX (~350MB quantized q8)
 * Stored in: app.getPath('userData')/kokoro/model.onnx
 */
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';

/** Approximate model size for UI display before content-length header arrives. */
export const KOKORO_MODEL_SIZE_MB = 350;

/** HuggingFace model URL for Kokoro-82M ONNX (q8 quantized). */
const KOKORO_MODEL_URL =
  'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/model.onnx';

/** Directory where the Kokoro model is stored. */
export function getKokoroModelDir(): string {
  return path.join(app.getPath('userData'), 'kokoro');
}

/** Full path to the Kokoro model file. */
export function getKokoroModelPath(): string {
  return path.join(getKokoroModelDir(), 'model.onnx');
}

/** Returns true if the model file exists on disk. */
export function isKokoroModelCached(): boolean {
  return fs.existsSync(getKokoroModelPath());
}

export interface KokoroDownloadOptions {
  onProgress?: (percent: number, downloadedMb: number, totalMb: number) => void;
  signal?: AbortSignal;
}

export interface KokoroDownloadResult {
  path: string;
  sizeBytes: number;
}

/**
 * downloadKokoroModel — downloads the Kokoro ONNX model from HuggingFace.
 *
 * D-04: No Range header resume — downloads from scratch on every call.
 * Partial files are deleted on error/abort before rethrowing.
 * D-02: Respects AbortSignal for cancellation (user clicks Cancel button).
 */
export async function downloadKokoroModel(
  options: KokoroDownloadOptions = {},
): Promise<KokoroDownloadResult> {
  const { onProgress, signal } = options;
  const modelDir = getKokoroModelDir();
  const modelPath = getKokoroModelPath();

  await fsPromises.mkdir(modelDir, { recursive: true });

  // D-04: Delete any pre-existing partial file before starting
  if (fs.existsSync(modelPath)) {
    await fsPromises.unlink(modelPath);
  }

  let res: Response;
  try {
    res = await fetch(KOKORO_MODEL_URL, { signal });
  } catch (err) {
    await fsPromises.unlink(modelPath).catch(() => {});
    throw err;
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} downloading Kokoro model from ${KOKORO_MODEL_URL}`);
  }

  const total =
    parseInt(res.headers.get('content-length') ?? '0') || KOKORO_MODEL_SIZE_MB * 1024 * 1024;
  let received = 0;
  const chunks: Buffer[] = [];

  const body = res.body as unknown as AsyncIterable<Uint8Array>;
  if (!body) {
    throw new Error('Response body is null');
  }

  try {
    for await (const chunk of body) {
      if (signal?.aborted) {
        await fsPromises.unlink(modelPath).catch(() => {});
        throw new DOMException('Download cancelled', 'AbortError');
      }
      const buf = chunk instanceof Buffer ? chunk : Buffer.from(chunk);
      received += buf.length;
      chunks.push(buf);

      const percent = Math.min(100, Math.floor((received / total) * 100));
      const downloadedMb = received / (1024 * 1024);
      const totalMb = total / (1024 * 1024);
      onProgress?.(percent, downloadedMb, totalMb);
    }
  } catch (err) {
    await fsPromises.unlink(modelPath).catch(() => {});
    throw err;
  }

  const buffer = Buffer.concat(chunks);
  await fsPromises.writeFile(modelPath, buffer);

  return { path: modelPath, sizeBytes: buffer.length };
}
