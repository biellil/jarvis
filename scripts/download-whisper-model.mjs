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
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
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
