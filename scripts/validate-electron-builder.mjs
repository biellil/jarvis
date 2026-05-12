#!/usr/bin/env node
/**
 * validate-electron-builder.mjs — Phase 71 Wave 0 validator.
 *
 * Parses apps/desktop/electron-builder.yml and asserts:
 *   1. win.target contains both 'nsis' and 'portable' (DIST-01 + DIST-02)
 *   2. mac.target[*].arch contains 'universal' (DIST-03 — see research §Pitfall 1)
 *   3. linux.target === 'AppImage' (DIST-04)
 *   4. extraResources has entry { from: '../../.env.example', to: '.env.example' } (D-09)
 *   5. extraResources sharp prebuilds for darwin-arm64, darwin-x64, linux-x64 (Pitfall 6)
 *   6. whisper filter contains ggml-base.bin AND ggml-medium.bin (D-11, D-12)
 *   7. whisper filter does NOT contain ggml-tiny.bin or ggml-large-v3.bin (D-12)
 *
 * Usage:
 *   node scripts/validate-electron-builder.mjs                                   # uses default path
 *   node scripts/validate-electron-builder.mjs apps/desktop/electron-builder.yml # explicit
 *
 * Exits 0 on success, 1 on any assertion failure with actionable message.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ymlPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ROOT, 'apps/desktop/electron-builder.yml');

const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

if (!fs.existsSync(ymlPath)) {
  console.error(`[validate-electron-builder] ERROR: yml not found at ${ymlPath}`);
  process.exit(1);
}

let doc;
try {
  doc = yaml.parse(fs.readFileSync(ymlPath, 'utf8'));
} catch (err) {
  console.error(`[validate-electron-builder] ERROR: failed to parse yml: ${err.message}`);
  process.exit(1);
}

// Check 1: win.target = [nsis, portable]
const winTarget = Array.isArray(doc.win?.target) ? doc.win.target : [doc.win?.target];
check(winTarget.includes('nsis'), 'win.target must include "nsis" (DIST-01)');
check(winTarget.includes('portable'), 'win.target must include "portable" (DIST-02)');

// Check 2: mac.target arch universal (Pitfall 1)
const macTargets = Array.isArray(doc.mac?.target) ? doc.mac.target : [];
const hasUniversal = macTargets.some((t) => {
  const arches = Array.isArray(t.arch) ? t.arch : [t.arch];
  return t.target === 'dmg' && arches.includes('universal');
});
check(hasUniversal, 'mac.target must include { target: dmg, arch: [universal] } (DIST-03, research Pitfall 1)');

// Check 3: linux.target AppImage
check(doc.linux?.target === 'AppImage', 'linux.target must be "AppImage" (DIST-04)');

// Check 4: .env.example extraResources entry (D-09)
const extras = doc.extraResources ?? [];
const hasEnvExample = extras.some((r) => r.from === '../../.env.example' && r.to === '.env.example');
check(hasEnvExample, 'extraResources must include .env.example bundle: { from: "../../.env.example", to: ".env.example" } (D-09)');

// Check 5: sharp cross-platform prebuilds (Pitfall 6)
const sharpRequired = ['sharp-darwin-arm64', 'sharp-darwin-x64', 'sharp-linux-x64'];
for (const pkg of sharpRequired) {
  const present = extras.some((r) => typeof r.from === 'string' && r.from.includes(`@img/${pkg}`));
  check(present, `extraResources must include @img/${pkg} prebuild for cross-platform sharp (research Pitfall 6)`);
}

// Check 6: whisper filter contains base + medium (D-11)
const whisperBlock = extras.find((r) => r.from === 'resources/models/whisper');
if (!whisperBlock) {
  errors.push('extraResources missing resources/models/whisper block (D-11)');
} else {
  const filter = whisperBlock.filter ?? [];
  check(filter.includes('ggml-base.bin'), 'whisper filter must include "ggml-base.bin" (D-11)');
  check(filter.includes('ggml-medium.bin'), 'whisper filter must include "ggml-medium.bin" (D-11)');
  check(!filter.includes('ggml-tiny.bin'), 'whisper filter must NOT include "ggml-tiny.bin" (D-12 — on-demand only) — ggml-tiny.bin should not be in filter (post-D-12)');
  check(!filter.includes('ggml-large-v3.bin'), 'whisper filter must NOT include "ggml-large-v3.bin" (D-12 — removed from UI post-Phase 68)');
}

if (errors.length > 0) {
  console.error('[validate-electron-builder] FAIL:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log('[validate-electron-builder] OK — all 6 checks passed');
process.exit(0);
