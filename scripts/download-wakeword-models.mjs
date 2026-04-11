#!/usr/bin/env node
/**
 * Download wake word models idempotente + checksum verification.
 *
 * Usage:
 *   node scripts/download-wakeword-models.mjs              # soft mode (postinstall)
 *   node scripts/download-wakeword-models.mjs --force      # force redownload
 *   node scripts/download-wakeword-models.mjs --check      # check-only (CI)
 *   node scripts/download-wakeword-models.mjs --verbose
 *
 * Source: Phase 22 Plan 03 — modelos NÃO commitados (CC BY-NC-SA 4.0 + privacy).
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_DIR = path.resolve(__dirname, '../apps/desktop/resources/wakeword-models');

// Checksums LEFT EMPTY na primeira execução — o script vai registrar no
// stdout e o maintainer deve colar os valores aqui no primeiro PR. Após
// isso, todo download futuro é verificado.
const EXPECTED_MODELS = [
  {
    name: 'melspectrogram.onnx',
    url: 'https://huggingface.co/davidscripka/openwakeword/resolve/main/melspectrogram.onnx',
    fallbackUrl: 'https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/melspectrogram.onnx',
    sha256: 'ba2b0e0f8b7b875369a2c89cb13360ff53bac436f2895cced9f479fa65eb176f',
  },
  {
    name: 'embedding_model.onnx',
    url: 'https://huggingface.co/davidscripka/openwakeword/resolve/main/embedding_model.onnx',
    fallbackUrl: 'https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/embedding_model.onnx',
    sha256: '70d164290c1d095d1d4ee149bc5e00543250a7316b59f31d056cff7bd3075c1f',
  },
  {
    name: 'silero_vad.onnx',
    url: 'https://huggingface.co/davidscripka/openwakeword/resolve/main/silero_vad.onnx',
    fallbackUrl: 'https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/silero_vad.onnx',
    sha256: 'a35ebf52fd3ce5f1469b2a36158dba761bc47b973ea3382b3186ca15b1f5af28',
  },
  {
    name: 'hey_jarvis_v0.1.onnx',
    url: 'https://huggingface.co/davidscripka/openwakeword/resolve/main/hey_jarvis_v0.1.onnx',
    fallbackUrl: 'https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/hey_jarvis_v0.1.onnx',
    sha256: '94a13cfe60075b132f6a472e7e462e8123ee70861bc3fb58434a73712ee0d2cb',
  },
];

const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');
const CHECK_ONLY = args.has('--check');
const VERBOSE = args.has('--verbose');
const SOFT = !CHECK_ONLY; // default soft mode — postinstall-safe

function log(msg) {
  console.log(`[wakeword-models] ${msg}`);
}
function verbose(msg) {
  if (VERBOSE) log(msg);
}

function sha256OfBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function downloadToBuffer(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    verbose(`GET ${url}`);
    https
      .get(url, (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          return resolve(downloadToBuffer(res.headers.location, redirectsLeft - 1));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} on ${url}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

async function downloadModel(model) {
  try {
    return await downloadToBuffer(model.url);
  } catch (primaryErr) {
    log(`${model.name}: primary URL failed (${primaryErr.message}), trying fallback`);
    return await downloadToBuffer(model.fallbackUrl);
  }
}

async function processModel(model) {
  const target = path.join(TARGET_DIR, model.name);
  const exists = fs.existsSync(target);

  if (exists && !FORCE) {
    if (model.sha256) {
      const actual = sha256OfBuffer(fs.readFileSync(target));
      if (actual === model.sha256) {
        log(`${model.name}: SKIP (checksum OK)`);
        return { status: 'skip' };
      } else {
        log(
          `${model.name}: WARN checksum mismatch (expected ${model.sha256}, got ${actual}) — redownloading`,
        );
      }
    } else {
      log(`${model.name}: SKIP (exists, no expected checksum yet)`);
      return { status: 'skip-no-checksum' };
    }
  }

  if (CHECK_ONLY) {
    if (!exists) {
      log(`${model.name}: MISSING (check-only mode)`);
      return { status: 'missing' };
    }
    return { status: 'present' };
  }

  const buf = await downloadModel(model);
  const actual = sha256OfBuffer(buf);
  if (model.sha256 && actual !== model.sha256) {
    throw new Error(
      `${model.name}: downloaded sha256 ${actual} does not match expected ${model.sha256}`,
    );
  }
  fs.mkdirSync(TARGET_DIR, { recursive: true });
  fs.writeFileSync(target, buf);
  log(`${model.name}: DOWNLOADED (${buf.length} bytes, sha256=${actual})`);
  if (!model.sha256) {
    log(`${model.name}: (register this checksum in EXPECTED_MODELS: '${actual}')`);
  }
  return { status: 'downloaded', sha256: actual };
}

async function main() {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
  const results = [];
  let anyFailed = false;
  for (const model of EXPECTED_MODELS) {
    try {
      const r = await processModel(model);
      results.push({ name: model.name, ...r });
    } catch (err) {
      anyFailed = true;
      log(`${model.name}: FAIL ${err.message}`);
      results.push({ name: model.name, status: 'fail', error: err.message });
    }
  }
  if (anyFailed) {
    if (SOFT) {
      log('⚠ soft mode: exiting 0 despite failures — app may fall back to PTT-only');
      process.exit(0);
    } else {
      process.exit(1);
    }
  }
  log('all models OK');
}

main().catch((err) => {
  log(`fatal: ${err.message}`);
  process.exit(SOFT ? 0 : 1);
});
