#!/usr/bin/env node
/**
 * generate-tray-template.mjs — Phase 51 (MCOS-01, D-03)
 *
 * Gera apps/desktop/resources/tray/iconTemplate.png (16x16) e
 * iconTemplate@2x.png (32x32) a partir de icon-16x16.png e icon-32x32.png.
 *
 * Estrategia: preserva canal alpha do PNG fonte; forca RGB para #000000.
 * macOS auto-inverte para branco no dark mode via template image API.
 *
 * Uso: node apps/desktop/scripts/generate-tray-template.mjs
 */
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRAY_DIR = path.resolve(__dirname, '../resources/tray');

const PAIRS = [
  { src: 'icon-16x16.png', dst: 'iconTemplate.png' },
  { src: 'icon-32x32.png', dst: 'iconTemplate@2x.png' },
];

async function blackenPreservingAlpha(srcPath, dstPath) {
  const img = sharp(srcPath).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  // info.channels === 4 (RGBA). Forca R=G=B=0; preserva A.
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0;
    data[i + 1] = 0;
    data[i + 2] = 0;
    // data[i + 3] (alpha) inalterado
  }
  await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toFile(dstPath);
  console.log(`[generate-tray-template] ${path.basename(srcPath)} -> ${path.basename(dstPath)} (${info.width}x${info.height})`);
}

for (const { src, dst } of PAIRS) {
  await blackenPreservingAlpha(path.join(TRAY_DIR, src), path.join(TRAY_DIR, dst));
}
console.log('[generate-tray-template] done.');
