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
    url: 'https://cas-bridge.xethub.hf.co/xet-bridge-us/641ab5d15d107c5c5f346372/518970a29bedb265f23ac48d486ddbc63bedffd90967b10140ae5ac61243acf3?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=cas%2F20260426%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260426T150256Z&X-Amz-Expires=3600&X-Amz-Signature=7bdfe11805041a93ea8f9ef29da8d93c51c1c6986047355611074eeed4b2a9c4&X-Amz-SignedHeaders=host&X-Xet-Cas-Uid=public&response-content-disposition=inline%3B+filename*%3DUTF-8%27%27ggml-tiny.bin%3B+filename%3D%22ggml-tiny.bin%22%3B&response-content-type=application%2Foctet-stream&x-amz-checksum-mode=ENABLED&x-id=GetObject&Expires=1777219376&Policy=eyJTdGF0ZW1lbnQiOlt7IkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc3NzIxOTM3Nn19LCJSZXNvdXJjZSI6Imh0dHBzOi8vY2FzLWJyaWRnZS54ZXRodWIuaGYuY28veGV0LWJyaWRnZS11cy82NDFhYjVkMTVkMTA3YzVjNWYzNDYzNzIvNTE4OTcwYTI5YmVkYjI2NWYyM2FjNDhkNDg2ZGRiYzYzYmVkZmZkOTA5NjdiMTAxNDBhZTVhYzYxMjQzYWNmMyoifV19&Signature=FWG4-KR7wNnzyoiXn0BEuzpNQQM9qrchX5wX4SzLtq0tDJtnSulQps35YQyv7iQ79C7V7osb6prus6qXGVVVL7Z-6DUqLRGUXEzf5KGrSi2K9v7tyMeiSptNkHBfeDodWyEFADiM8iuDLhKfFudOTV7HR3fkk6hp0GLRF1J4q8UCnxs7Q-2M9TViexf1RU1j01gLgaVVnKtqfuqjyymZudJ-PwA5Yg3ik0nGOrZXwdM-Ww2zDZDeSxlGe%7E9ySXRMD8MPy6lWsb3rGgakvolAFDFj78F4DJHKjKmAhByzxzme2GlzJ9Bh1XEmXBq9lsd8qnZZ%7EQQ2nEr2pTvARjR8%7EA__&Key-Pair-Id=K2L8F4GPSG1IFC',
    sizeMb: 75,
  },
  base: {
    filename: 'ggml-base.bin',
    url: 'https://cas-bridge.xethub.hf.co/xet-bridge-us/641ab5d15d107c5c5f346372/2f62d18b50c3f3feafbf990eec23a93d319660b1efbdd3fff55e52b7cde2e374?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=cas%2F20260426%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260426T144803Z&X-Amz-Expires=3600&X-Amz-Signature=3424c52cf6c971384df9896f8761ae587217c66cc6692e63af59095a8f5607ae&X-Amz-SignedHeaders=host&X-Xet-Cas-Uid=public&response-content-disposition=inline%3B+filename*%3DUTF-8%27%27ggml-base.bin%3B+filename%3D%22ggml-base.bin%22%3B&response-content-type=application%2Foctet-stream&x-amz-checksum-mode=ENABLED&x-id=GetObject&Expires=1777218483&Policy=eyJTdGF0ZW1lbnQiOlt7IkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc3NzIxODQ4M319LCJSZXNvdXJjZSI6Imh0dHBzOi8vY2FzLWJyaWRnZS54ZXRodWIuaGYuY28veGV0LWJyaWRnZS11cy82NDFhYjVkMTVkMTA3YzVjNWYzNDYzNzIvMmY2MmQxOGI1MGMzZjNmZWFmYmY5OTBlZWMyM2E5M2QzMTk2NjBiMWVmYmRkM2ZmZjU1ZTUyYjdjZGUyZTM3NCoifV19&Signature=HdNpjlSl9xU0pq1g5ZUOdoQgAWFcWbdPZtL7mofRC51X7JNlRaKYHMgojcYBw97e5mZHyU-BbaNpHTiQsmx-z0Q7q-vhp8jZcp6jiZKy-KdxvTYgocp2PioCLJWL69hAZIrlX4--cHABag7JKm7tcfIXqDgUJ1MN1vZ7xW9uHLAcFWqthvx97luopR5s%7EUEpMEq40NX%7EMEdyiBVZKr2dguwGpPvhNMRtvbkr4M7eFzyvbIJYjK5NBhR07qJxM4x16SCdpLkT5yBsJqgFIgta1LNpyERBjMyG8FYVTftQRE8hDMBEhcGwhyBCF2tFnB9PgW8MQEFm19CP%7EDGWTfOibQ__&Key-Pair-Id=K2L8F4GPSG1IFC',
    sizeMb: 142,
  },
  medium: {
    filename: 'ggml-medium.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
    sizeMb: 1500,
  },
  large: {
    filename: 'ggml-large-v3.bin',
    url: 'https://cas-bridge.xethub.hf.co/xet-bridge-us/641ab5d15d107c5c5f346372/766d11cebbdf5a67c179c5774e2642b609e35e1a30240e7b559d5647c655b0a4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=cas%2F20260426%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260426T150213Z&X-Amz-Expires=3600&X-Amz-Signature=88bf32ec34661c05c996b40a58c134e6c5a1f76dbe092635f567328351b6c294&X-Amz-SignedHeaders=host&X-Xet-Cas-Uid=public&response-content-disposition=inline%3B+filename*%3DUTF-8%27%27ggml-large-v3.bin%3B+filename%3D%22ggml-large-v3.bin%22%3B&response-content-type=application%2Foctet-stream&x-amz-checksum-mode=ENABLED&x-id=GetObject&Expires=1777219333&Policy=eyJTdGF0ZW1lbnQiOlt7IkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc3NzIxOTMzM319LCJSZXNvdXJjZSI6Imh0dHBzOi8vY2FzLWJyaWRnZS54ZXRodWIuaGYuY28veGV0LWJyaWRnZS11cy82NDFhYjVkMTVkMTA3YzVjNWYzNDYzNzIvNzY2ZDExY2ViYmRmNWE2N2MxNzljNTc3NGUyNjQyYjYwOWUzNWUxYTMwMjQwZTdiNTU5ZDU2NDdjNjU1YjBhNCoifV19&Signature=rYYmn7vaMpw%7EVGV%7EhcaEKk3f41YBjekEEC2wHV-WbqjwsneScPnVvqQm30ijkcNw9QVqV8PD69FRY7KtWTSVy1hcENUTOHBa1oiM%7ErY%7EubvhLch0Zw2P1CPsaFctBRcYIhdZzdGavbaa4el59Xx8r6cWjxopWrv6lqO9LPp5JHm7iTgBhIERGMDT6bfRFp4JlcouFVxoK9EjpEOubAA0q3YhjBuxLT1KGSkZEknzf5oVOa3bP5lFRZ%7E8nn3J8h4XQlep6U-KwkEvuBLuSlXLZfDmYPX3sO5laFSZTYYAekxjXEEvs12Wrncq2bzckF%7E8qvoLnUFevNPgF9X6Wg%7EbUA__&Key-Pair-Id=K2L8F4GPSG1IFC',
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
    const existingBytes = fs.statSync(dest).size;
    const expectedBytes = model.sizeMb * 1024 * 1024;
    const minAcceptable = Math.floor(expectedBytes * 0.95);
    if (existingBytes >= minAcceptable) {
      log(`${model.filename}: SKIP (already exists — use --force to redownload)`);
      return;
    }
    const existingMb = Math.floor(existingBytes / 1048576);
    log(`${model.filename}: PARTIAL (${existingMb} MB < expected ~${model.sizeMb} MB) — redownloading`);
    fs.unlinkSync(dest);
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
