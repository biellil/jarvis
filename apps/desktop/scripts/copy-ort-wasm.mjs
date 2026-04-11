#!/usr/bin/env node
/**
 * copy-ort-wasm.mjs — 22-GAP-02
 *
 * Copia os binários WASM do onnxruntime-web pro public/ do renderer Vite.
 *
 * Contexto: Em dev mode o Vite não sabe servir .wasm de dentro de node_modules
 * por path arbitrário — o SPA fallback intercepta e retorna index.html, fazendo
 * o ORT falhar com "expected magic word 00 61 73 6d, found 3c 21 44 4f" (HTML).
 *
 * Fix: copiar os .wasm e .mjs pro `src/renderer/public/ort/` e apontar
 * `ort.env.wasm.wasmPaths = '/ort/'`. Vite serve public/ automaticamente na
 * raiz do dev server e copia pra dist/renderer/ no build.
 *
 * Rodado pelo `postinstall` do apps/desktop/package.json — idempotente.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DESKTOP_ROOT = join(__dirname, '..');

const FILES = [
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.jsep.mjs',
];

function resolveOrtDistDir() {
  // pnpm symlinks node_modules/onnxruntime-web/dist directly. Works from either
  // the desktop workspace or the monorepo root (pnpm hoisting can vary).
  const candidates = [
    join(DESKTOP_ROOT, 'node_modules', 'onnxruntime-web', 'dist'),
    join(DESKTOP_ROOT, '..', '..', 'node_modules', 'onnxruntime-web', 'dist'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'ort-wasm-simd-threaded.wasm'))) {
      return dir;
    }
  }
  throw new Error(
    `[copy-ort-wasm] Could not locate onnxruntime-web/dist. Tried:\n  ${candidates.join('\n  ')}\n` +
      `Run \`pnpm install\` first.`,
  );
}

function main() {
  const srcDir = resolveOrtDistDir();
  const destDir = join(DESKTOP_ROOT, 'src', 'renderer', 'public', 'ort');

  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  let copied = 0;
  let skipped = 0;

  for (const file of FILES) {
    const srcPath = join(srcDir, file);
    const destPath = join(destDir, file);

    if (!existsSync(srcPath)) {
      console.warn(`[copy-ort-wasm] WARN: source missing ${srcPath} — skipping`);
      skipped++;
      continue;
    }

    // Idempotent: only copy if dest missing or sizes differ.
    if (existsSync(destPath)) {
      const srcBytes = readFileSync(srcPath);
      const destBytes = readFileSync(destPath);
      if (srcBytes.length === destBytes.length && srcBytes.equals(destBytes)) {
        skipped++;
        continue;
      }
    }

    writeFileSync(destPath, readFileSync(srcPath));
    copied++;
  }

  console.log(
    `[copy-ort-wasm] OK — ${copied} copied, ${skipped} skipped (destination: ${destDir})`,
  );
}

main();
