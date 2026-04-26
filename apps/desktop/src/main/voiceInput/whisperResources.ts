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
import { getDetectedBackend } from './gpuDetection.js';

export type WhisperModel = 'tiny' | 'base' | 'medium' | 'large';

const MODEL_FILENAMES: Record<WhisperModel, string> = {
  tiny: 'ggml-tiny.bin',
  base: 'ggml-base.bin',
  medium: 'ggml-medium.bin',
  large: 'ggml-large-v3.bin',
};

const MODEL_URLS: Record<WhisperModel, string> = {
  tiny: 'https://cas-bridge.xethub.hf.co/xet-bridge-us/641ab5d15d107c5c5f346372/518970a29bedb265f23ac48d486ddbc63bedffd90967b10140ae5ac61243acf3?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=cas%2F20260426%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260426T162503Z&X-Amz-Expires=3600&X-Amz-Signature=62e02473acd968a0d0f6bdcf6caf336b29d68b7e7469a17c54d1355637e02135&X-Amz-SignedHeaders=host&X-Xet-Cas-Uid=public&response-content-disposition=inline%3B+filename*%3DUTF-8%27%27ggml-tiny.bin%3B+filename%3D%22ggml-tiny.bin%22%3B&response-content-type=application%2Foctet-stream&x-amz-checksum-mode=ENABLED&x-id=GetObject&Expires=1777224303&Policy=eyJTdGF0ZW1lbnQiOlt7IkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc3NzIyNDMwM319LCJSZXNvdXJjZSI6Imh0dHBzOi8vY2FzLWJyaWRnZS54ZXRodWIuaGYuY28veGV0LWJyaWRnZS11cy82NDFhYjVkMTVkMTA3YzVjNWYzNDYzNzIvNTE4OTcwYTI5YmVkYjI2NWYyM2FjNDhkNDg2ZGRiYzYzYmVkZmZkOTA5NjdiMTAxNDBhZTVhYzYxMjQzYWNmMyoifV19&Signature=VaT0fDCy8tlEeAqbZ8etz90a-jBFWy-3oWlXordbE9RN7EmoCOcZKz5D6dn%7EJIHbn7AhbBWIGZMpjRZQR9db8gTgybANR8i6irbhOR%7EY%7ESebMzeKehdMelClIee%7EZyJ9A7u-djK8ZHrCy2I349RycfN4xUjEDTsWbDNuRJ%7EGUSHJXT2vh254YmxoHdC9L8gcQK10vDGMIvBpF2xhiNycrvD5mP98H8a3mmeEucuM%7E94rG7u70v%7Elu80xlYqLE%7EzwxipVLL%7Em1MkvhE9y5nmg3iqMQ5GcE5c6wUfGjASJB%7E01Ln6jvrHJ2DrxTIwFtwhpEgYJBMWOQyF-8A3VcQxnNg__&Key-Pair-Id=K2L8F4GPSG1IFC',
  base: 'https://cas-bridge.xethub.hf.co/xet-bridge-us/641ab5d15d107c5c5f346372/2f62d18b50c3f3feafbf990eec23a93d319660b1efbdd3fff55e52b7cde2e374?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=cas%2F20260426%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260426T155720Z&X-Amz-Expires=3600&X-Amz-Signature=55a8fceb5544d1beacb08855999fce58aa5f8d7549425523d118953f7c3fe13f&X-Amz-SignedHeaders=host&X-Xet-Cas-Uid=public&response-content-disposition=inline%3B+filename*%3DUTF-8%27%27ggml-base.bin%3B+filename%3D%22ggml-base.bin%22%3B&response-content-type=application%2Foctet-stream&x-amz-checksum-mode=ENABLED&x-id=GetObject&Expires=1777222640&Policy=eyJTdGF0ZW1lbnQiOlt7IkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc3NzIyMjY0MH19LCJSZXNvdXJjZSI6Imh0dHBzOi8vY2FzLWJyaWRnZS54ZXRodWIuaGYuY28veGV0LWJyaWRnZS11cy82NDFhYjVkMTVkMTA3YzVjNWYzNDYzNzIvMmY2MmQxOGI1MGMzZjNmZWFmYmY5OTBlZWMyM2E5M2QzMTk2NjBiMWVmYmRkM2ZmZjU1ZTUyYjdjZGUyZTM3NCoifV19&Signature=Ow50Ln9rE1%7EVZwGJdrsJbyyPvNarF7GI7cdn0xGjB%7E9PGSN01b-GCLJq8ji7cGl4QfN5lGF89m49qLJP6MyHa4y0iAjoe76c-Gyse1mbMvBwx-CpjGUEJi2qT1-7UPwvtaLAvt9qcJVy-umhEC5xIa6KM6Ez35waoqEqvd-Ia9ToGisOp2SA5bD%7Eu1HG-2IrE2JixF3JDlpVPhQVF2AxZ7rNn%7EGYZiEP6sGM74MYBlLvuvHtSS%7EOA-7GrWdNOIC9tl-ZesfqhOxXZXUIVjVD11CDeM6nNOYREmf3ecqZMhnO66KLzl7KYkSYWD%7EwhhGgpJm6YSYN9fN3MRzFaAM14g__&Key-Pair-Id=K2L8F4GPSG1IFC',
  medium: 'https://cas-bridge.xethub.hf.co/xet-bridge-us/641ab5d15d107c5c5f346372/d3d5696e6a3e0ca2aa08eb31cad208ffa1e87b3cc341f59e628fbdcf8122de9b?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=cas%2F20260426%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260426T162556Z&X-Amz-Expires=3600&X-Amz-Signature=ea9bd9944f7bcf8edcbea06f9e36027c6cd6453c700cadf7c0064a5a92b6218f&X-Amz-SignedHeaders=host&X-Xet-Cas-Uid=public&response-content-disposition=inline%3B+filename*%3DUTF-8%27%27ggml-medium.bin%3B+filename%3D%22ggml-medium.bin%22%3B&response-content-type=application%2Foctet-stream&x-amz-checksum-mode=ENABLED&x-id=GetObject&Expires=1777224356&Policy=eyJTdGF0ZW1lbnQiOlt7IkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc3NzIyNDM1Nn19LCJSZXNvdXJjZSI6Imh0dHBzOi8vY2FzLWJyaWRnZS54ZXRodWIuaGYuY28veGV0LWJyaWRnZS11cy82NDFhYjVkMTVkMTA3YzVjNWYzNDYzNzIvZDNkNTY5NmU2YTNlMGNhMmFhMDhlYjMxY2FkMjA4ZmZhMWU4N2IzY2MzNDFmNTllNjI4ZmJkY2Y4MTIyZGU5YioifV19&Signature=ADDjIJ1Hz2kYTlzAMNOqNibjx-j2vPCxOGVYfU%7EJOCF%7EFeff7Nx31aSxZuhEv0VtMAQ4YV5sco1SpIJG2x6nsbEzjyUM3OYMN05MXkRzJZsPF6lVjf4VfHm%7E11m3TGKG9WOfAkNr%7E5Bb%7EGOaJEgqb2CrdY4jiKNIWq0ZhfvcZHOyMkGGZYQ6eCbJsSCDvvnDztEtHxDkRun6SVfF3Ciozgp0A671i2igVWZEnrco4mWRMbhusIgljblJhKVqXo80Ub0wxg0mrbkHlqIWkEppcheQmKw-x-8N9w-ksWDGeqoZNVpiesrAwc0kS77NDDtrp2k1XFBWZcZVHes9iqsaNg__&Key-Pair-Id=K2L8F4GPSG1IFC',
  large: 'https://cas-bridge.xethub.hf.co/xet-bridge-us/641ab5d15d107c5c5f346372/766d11cebbdf5a67c179c5774e2642b609e35e1a30240e7b559d5647c655b0a4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=cas%2F20260426%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260426T162612Z&X-Amz-Expires=3600&X-Amz-Signature=8cc8a1b1af95cdc2d38cfa46835aba5afa86732e78145dde0aa8c8e0aac1e602&X-Amz-SignedHeaders=host&X-Xet-Cas-Uid=public&response-content-disposition=inline%3B+filename*%3DUTF-8%27%27ggml-large-v3.bin%3B+filename%3D%22ggml-large-v3.bin%22%3B&response-content-type=application%2Foctet-stream&x-amz-checksum-mode=ENABLED&x-id=GetObject&Expires=1777224372&Policy=eyJTdGF0ZW1lbnQiOlt7IkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc3NzIyNDM3Mn19LCJSZXNvdXJjZSI6Imh0dHBzOi8vY2FzLWJyaWRnZS54ZXRodWIuaGYuY28veGV0LWJyaWRnZS11cy82NDFhYjVkMTVkMTA3YzVjNWYzNDYzNzIvNzY2ZDExY2ViYmRmNWE2N2MxNzljNTc3NGUyNjQyYjYwOWUzNWUxYTMwMjQwZTdiNTU5ZDU2NDdjNjU1YjBhNCoifV19&Signature=c2wcrqvwYoJtR1PVPPii7QobDYFTknBAnahROVuBlr7NaFe7TdWWZuCm9QFZSNygkM9LD3EJcV8Hoz-hoga2mUegRWbS3TDJ2d1N3DWWLL506QBXMFXdb-3g4PmKYdz3ueGUF5Na56Mx8kAe6ycbDjhURnTEyg1YdDaeZgU3idP7nP5i2FIRM0K%7EOMjqL1HSTEqiZN-hrprDy7aWdsvyaaykqubNuac0KyXgU5FKMraw7Eu-WVvKk7076JmJdo%7E2dprg%7EYxHUXkL0oEHAQZ%7E3SZHKIJlFMQ8g5g%7EeO9a%7EnbZdJNSl2YgMHUfmdYoomWoySEPmPn3aXj0--rF3MSvDA__&Key-Pair-Id=K2L8F4GPSG1IFC',
};

/**
 * Returns absolute path to the specified whisper model binary.
 * In packaged app: reads from process.resourcesPath/models/whisper/ (bundled via extraResources).
 * In dev: falls back to app.getPath('userData')/models/whisper/ for manual downloads.
 */
/** Returns the directory containing whisper models. */
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

// In-flight download promise — shared so getWhisperInstance can await it.
const _downloadPromises = new Map<WhisperModel, Promise<void>>();

/**
 * Downloads the whisper model if not already present.
 * Idempotent: concurrent calls share the same promise so the file is fetched once.
 * Shows progress in console. Follows redirects (HuggingFace uses 302).
 */
export function ensureWhisperModel(modelName: WhisperModel = 'base'): Promise<void> {
  if (app.isPackaged) return Promise.resolve(); // packaged builds use extraResources

  const modelPath = getWhisperModelPath(modelName);
  if (fs.existsSync(modelPath)) return Promise.resolve();

  const existing = _downloadPromises.get(modelName);
  if (existing) return existing;

  const modelsDir = getWhisperModelsDir();
  fs.mkdirSync(modelsDir, { recursive: true });

  const url = MODEL_URLS[modelName];
  const sizeMb = modelName === 'tiny' ? '75' : modelName === 'base' ? '142' : '1500';
  console.log(`[whisper] Model not found — downloading ${MODEL_FILENAMES[modelName]} (~${sizeMb} MB)...`);

  const promise = downloadFile(url, modelPath)
    .then(() => {
      console.log(`[whisper] Model downloaded: ${modelPath}`);
      _downloadPromises.delete(modelName);
    })
    .catch((err: unknown) => {
      _downloadPromises.delete(modelName); // allow retry on next call
      throw err;
    });

  _downloadPromises.set(modelName, promise);
  return promise;
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
