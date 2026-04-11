#!/usr/bin/env node
/**
 * Ban a libs proibidas de wake word do lockfile (WAKE-09).
 * Phase 22 decision: apenas onnxruntime-web + openwakeword ONNX models.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCKFILE = path.resolve(__dirname, '../pnpm-lock.yaml');

const BANNED = [
  '@picovoice/porcupine',
  'porcupine-node',
  'bumblebee-hotword',
  'snowboy',
  'vosk',
];

if (!fs.existsSync(LOCKFILE)) {
  console.error(`[ban-check] pnpm-lock.yaml not found at ${LOCKFILE}`);
  process.exit(1);
}

const content = fs.readFileSync(LOCKFILE, 'utf8');
const hits = [];
for (const lib of BANNED) {
  const regex = new RegExp(lib.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (regex.test(content)) {
    hits.push(lib);
  }
}

if (hits.length > 0) {
  console.error(`[ban-check] ❌ FAILED — banned libs in pnpm-lock.yaml: ${hits.join(', ')}`);
  console.error('[ban-check] These libraries are prohibited by Phase 22 (privacy / licensing).');
  console.error('[ban-check] See .planning/phases/22-.../22-CONTEXT.md §Locked by Research.');
  process.exit(1);
}

console.log('[ban-check] ✅ no banned wake word libs in pnpm-lock.yaml');
process.exit(0);
