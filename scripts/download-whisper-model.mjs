#!/usr/bin/env node
/**
 * Download whisper model idempotente.
 *
 * Usage:
 *   node scripts/download-whisper-model.mjs              # base model (default)
 *   node scripts/download-whisper-model.mjs --model tiny
 *   node scripts/download-whisper-model.mjs --force      # force redownload
 *   node scripts/download-whisper-model.mjs --check      # check-only (CI)
 *
 * Downloads to apps/desktop/resources/models/whisper/ — mirrors extraResources
 * layout so dev and packaged builds use the same files.
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_DIR = path.resolve(__dirname, '../apps/desktop/resources/models/whisper');

const MODELS = {
  tiny: {
    filename: 'ggml-tiny.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
    sizeMb: 75,
  },
  base: {
    filename: 'ggml-base.bin',
    url: 'https://cas-bridge.xethub.hf.co/xet-bridge-us/641ab5d15d107c5c5f346372/2f62d18b50c3f3feafbf990eec23a93d319660b1efbdd3fff55e52b7cde2e374?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=cas%2F20260426%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260426T004700Z&X-Amz-Expires=3600&X-Amz-Signature=33adf0af67cde6c755dc68154f8a231a36bbe908a5b7366f223d3190c30a24a7&X-Amz-SignedHeaders=host&X-Xet-Cas-Uid=public&response-content-disposition=inline%3B+filename*%3DUTF-8%27%27ggml-base.bin%3B+filename%3D%22ggml-base.bin%22%3B&response-content-type=application%2Foctet-stream&x-amz-checksum-mode=ENABLED&x-id=GetObject&Expires=1777168020&Policy=eyJTdGF0ZW1lbnQiOlt7IkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc3NzE2ODAyMH19LCJSZXNvdXJjZSI6Imh0dHBzOi8vY2FzLWJyaWRnZS54ZXRodWIuaGYuY28veGV0LWJyaWRnZS11cy82NDFhYjVkMTVkMTA3YzVjNWYzNDYzNzIvMmY2MmQxOGI1MGMzZjNmZWFmYmY5OTBlZWMyM2E5M2QzMTk2NjBiMWVmYmRkM2ZmZjU1ZTUyYjdjZGUyZTM3NCoifV19&Signature=KmAugM6X9VBEDzqU%7E%7EoK9i3lfb9K7CUezyjLg1UXIufVkgmDuO%7EP4z0P2G%7Ec8erBIcxkTVAMosbcti5Xd5iuukrrdkyX67MeTRFm8EOd8KtLLSizLclkwTOEGzBJOhz2ydyn%7E34SdIfy46gfmmOQlwqLFvMGYFdRpH37dU29kbmPB29QKKH26sFkvY6owBkA51cmEuj4dYrvvkeeFi2aoOX1VTkQXYmHvsPV6QFr4hR40qcvPc6AcSkjeHDZcdNPFSKdT7oZOB7fQfkcibc2RJpIGwiDYvRWUWe5JM8EIDBhaC9W-NoAI1JPEiu7B7OkEIjATu9d9RYPFRvGYuUBcw__&Key-Pair-Id=K2L8F4GPSG1IFC',
    sizeMb: 142,
  },
  large: {
    filename: 'ggml-large-v3.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
    sizeMb: 1500,
  },
};

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const CHECK_ONLY = args.includes('--check');
const SOFT = !CHECK_ONLY;

const modelArg = args.find((a) => a.startsWith('--model'));
const modelName = modelArg ? modelArg.split('=')[1] ?? args[args.indexOf(modelArg) + 1] : 'base';

function log(msg) {
  console.log(`[whisper-model] ${msg}`);
}

function downloadFile(url, dest, sizeMb, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const tmpPath = `${dest}.tmp`;
    const file = fs.createWriteStream(tmpPath);

    const request = (urlStr) => {
      https.get(urlStr, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
          file.close();
          return request(res.headers.location);
        }
        if (res.statusCode !== 200) {
          file.close();
          try { fs.unlinkSync(tmpPath); } catch {}
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        const total = parseInt(res.headers['content-length'] ?? '0', 10);
        let downloaded = 0;
        let lastPct = 0;

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total > 0) {
            const pct = Math.floor((downloaded / total) * 100);
            if (pct >= lastPct + 10) {
              lastPct = pct;
              process.stdout.write(`\r[whisper-model] Downloading... ${pct}%`);
            }
          }
        });

        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            process.stdout.write('\n');
            fs.renameSync(tmpPath, dest);
            resolve();
          });
        });
      }).on('error', (err) => {
        try { fs.unlinkSync(tmpPath); } catch {}
        reject(err);
      });
    };

    request(url);
  });
}

async function main() {
  const model = MODELS[modelName];
  if (!model) {
    log(`Unknown model "${modelName}". Available: ${Object.keys(MODELS).join(', ')}`);
    process.exit(1);
  }

  const dest = path.join(TARGET_DIR, model.filename);

  if (CHECK_ONLY) {
    if (fs.existsSync(dest)) {
      log(`${model.filename}: OK`);
    } else {
      log(`${model.filename}: MISSING`);
      process.exit(1);
    }
    return;
  }

  if (fs.existsSync(dest) && !FORCE) {
    log(`${model.filename}: SKIP (already exists — use --force to redownload)`);
    return;
  }

  fs.mkdirSync(TARGET_DIR, { recursive: true });
  log(`Downloading ${model.filename} (~${model.sizeMb} MB)...`);

  try {
    await downloadFile(model.url, dest, model.sizeMb);
    log(`${model.filename}: DOWNLOADED to ${dest}`);
  } catch (err) {
    log(`FAIL: ${err.message}`);
    if (SOFT) {
      log('soft mode: exiting 0 — app will download at runtime if needed');
      process.exit(0);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  log(`fatal: ${err.message}`);
  process.exit(SOFT ? 0 : 1);
});
