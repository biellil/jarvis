#!/usr/bin/env node
/**
 * preflight-dist.mjs — Phase 71 (D-17) build environment validator.
 *
 * Invoked by root package.json scripts before electron-builder:
 *   node scripts/preflight-dist.mjs <target>
 *   target: 'win' | 'mac' | 'linux' | 'auto'  ('auto' = process.platform host)
 *
 * Checks:
 *   1. target is valid (whitelist)
 *   2. Platform gate: mac only builds on darwin (fast-fail)
 *   3. .env.example exists + contains only placeholder values
 *      (T-71-02 mitigation: detect real API key patterns sk-*, ant-*, AIza*)
 *   4. apps/desktop/resources/models/whisper/ggml-{base,medium}.bin present;
 *      if missing, invoke scripts/download-whisper-model.mjs --model {name}
 *   5. If target=win and process.platform !== 'win32':
 *      - wine: REQUIRED (exit 1 if missing). Actionable msg:
 *        "sudo apt install wine wine32 wine64"
 *      - mono: WARNING only (NSIS works without mono per electron-builder docs)
 *
 * Exits 0 if all checks pass, 1 on any failure with actionable message.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const TARGETS = ['win', 'mac', 'linux'];
const PLATFORM_TO_TARGET = { linux: 'linux', darwin: 'mac', win32: 'win' };

function fail(msg) {
  console.error(`[preflight-dist] ERRO: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`[preflight-dist] ✓ ${msg}`);
}

function warn(msg) {
  console.warn(`[preflight-dist] aviso: ${msg}`);
}

// ============================================
// 1. Target validation
// ============================================
let target = process.argv[2];
if (target === 'auto') {
  target = PLATFORM_TO_TARGET[process.platform];
  if (!target) fail(`unsupported host platform: ${process.platform}`);
  ok(`auto-detected target=${target} from host platform=${process.platform}`);
}
if (!TARGETS.includes(target)) {
  fail(`target must be one of [${TARGETS.join(', ')}] (or 'auto'); got: ${JSON.stringify(target)}`);
}
ok(`target=${target}`);

// ============================================
// 2. Platform gate (fast-fail before expensive checks)
// ============================================
if (target === 'mac' && process.platform !== 'darwin') {
  fail(`macOS DMG só pode ser buildado em macOS 12+. Veja README §Build & Install (host atual: ${process.platform})`);
}
if (target === 'mac' && process.platform === 'darwin') {
  ok('darwin host — mac DMG build supported');
}

// ============================================
// 3. .env.example existence + placeholder-only (T-71-02)
// ============================================
const envExamplePath = path.join(ROOT, '.env.example');
if (!fs.existsSync(envExamplePath)) {
  fail(`.env.example missing at ${envExamplePath} — required by extraResources bundle (D-09)`);
}
ok('.env.example present');

// Real-looking secret patterns we expect to NEVER be in .env.example
const SECRET_PATTERNS = [
  { pattern: /=sk-[A-Za-z0-9]{20,}/, name: 'OpenAI secret (sk-*)' },
  { pattern: /=sk-ant-[A-Za-z0-9_-]{20,}/, name: 'Anthropic secret (sk-ant-*)' },
  { pattern: /=AIza[A-Za-z0-9_-]{30,}/, name: 'Google API key (AIza*)' },
  { pattern: /=ghp_[A-Za-z0-9]{30,}/, name: 'GitHub token (ghp_*)' },
  { pattern: /=xoxb-[A-Za-z0-9-]{20,}/, name: 'Slack bot token (xoxb-*)' },
];
const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
for (const { pattern, name } of SECRET_PATTERNS) {
  if (pattern.test(envExampleContent)) {
    fail(`.env.example contains what looks like a real secret (${name}). Placeholder values only. Replace with empty assignment (e.g., KEY=) before building.`);
  }
}
ok('.env.example has placeholder values only (no real-looking secrets)');

// ============================================
// 4. Whisper bundle models (D-11, D-13)
// ============================================
const whisperDir = path.join(ROOT, 'apps/desktop/resources/models/whisper');
const REQUIRED_MODELS = [
  { id: 'base', filename: 'ggml-base.bin' },
  { id: 'medium', filename: 'ggml-medium.bin' },
];
fs.mkdirSync(whisperDir, { recursive: true });

for (const m of REQUIRED_MODELS) {
  const file = path.join(whisperDir, m.filename);
  if (fs.existsSync(file)) {
    ok(`${m.filename} present`);
    continue;
  }
  console.log(`[preflight-dist] ${m.filename} missing — downloading via scripts/download-whisper-model.mjs --model ${m.id}...`);
  const r = spawnSync(
    'node',
    [path.join(ROOT, 'scripts/download-whisper-model.mjs'), '--model', m.id],
    { stdio: 'inherit' },
  );
  if (r.status !== 0) {
    fail(`failed to download ${m.filename} (download-whisper-model.mjs exited ${r.status}). Run manually: pnpm -F @jarvis/desktop download-whisper-model -- --model ${m.id}`);
  }
  if (!fs.existsSync(file)) {
    fail(`download script reported success but ${file} still missing — investigate`);
  }
  ok(`${m.filename} downloaded`);
}

// ============================================
// 5. Cross-build deps — Win on Linux/macOS
// ============================================
if (target === 'win' && process.platform !== 'win32') {
  const wine = spawnSync('wine', ['--version'], { encoding: 'utf8' });
  if (wine.status !== 0) {
    fail(`wine não encontrado. Instale com: sudo apt install wine wine32 wine64 (Ubuntu 22.04+), ou habilite i386 antes: sudo dpkg --add-architecture i386 && sudo apt update`);
  }
  ok(`wine ${wine.stdout.trim()}`);

  const mono = spawnSync('mono', ['--version'], { encoding: 'utf8' });
  if (mono.status !== 0) {
    warn(`mono não encontrado (opcional — NSIS funciona sem; necessário só para Squirrel.Windows). Para instalar: sudo apt install mono-devel`);
  } else {
    ok(`mono ${mono.stdout.split('\n')[0]}`);
  }
}

// ============================================
// 6. Linux smoke (always when target=linux)
// ============================================
if (target === 'linux') {
  ok('linux build — no cross-build deps needed');
}

ok('preflight OK — proceeding to electron-builder');
