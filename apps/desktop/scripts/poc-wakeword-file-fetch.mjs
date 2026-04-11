#!/usr/bin/env node
/**
 * POC — Assumption A4 validation: can Electron renderer use
 * `ort.InferenceSession.create('file:///...')` directly?
 *
 * This script is NOT a vitest — it's manual documentation for the
 * executor to validate the file:// fetch approach before choosing
 * between:
 *   1. Direct file:// URL (simpler, 1 file read, zero IPC)
 *   2. IPC read-and-transfer (bytes via Uint8Array, guaranteed to work)
 *
 * Usage:
 *   node apps/desktop/scripts/poc-wakeword-file-fetch.mjs
 *
 * For the REAL POC, paste the snippet below into the DevTools console of
 * `pnpm --filter @jarvis/desktop dev` (Ctrl+Shift+I) and record the result:
 *
 * ```js
 * (async () => {
 *   const ort = await import('onnxruntime-web');
 *   ort.env.wasm.numThreads = 1;
 *   try {
 *     // Ajuste o path para um .onnx real quando os modelos forem baixados no Plan 03.
 *     const s = await ort.InferenceSession.create('file:///absolute/path/to/hey_jarvis_v0.1.onnx');
 *     console.log('A4_RESULT: file_url_works', s);
 *   } catch (e) {
 *     console.log('A4_RESULT: file_url_blocked', e.message);
 *   }
 * })();
 * ```
 *
 * Expected outcomes:
 * - A4_RESULT=file_url_works  → Task 2 poderia usar direct URL no modelLoader.
 * - A4_RESULT=file_url_blocked → Task 2 usa IPC read-and-transfer (approach atual).
 *
 * DECISION (documented in 22-02-SUMMARY.md):
 * Por default, este plano adota **approach 1 do research: IPC read-and-transfer**
 * (main process lê fs.readFile, retorna Uint8Array via ipcRenderer.invoke).
 * Esta escolha é mais robusta e funciona em dev + prod independente de
 * CSP/file protocol policies do Chromium. O POC fica como fallback seed
 * para quem quiser otimizar depois.
 */

console.log(
  '[POC A4] Cole o snippet no DevTools do Electron em `pnpm --filter @jarvis/desktop dev`',
);
console.log('[POC A4] Reporte o valor de A4_RESULT no SUMMARY.md.');
console.log('[POC A4] Decisão atual (sem rodar o POC): IPC read-and-transfer.');
