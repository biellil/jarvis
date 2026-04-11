/**
 * voiceInput/resources.ts — resolvedor de paths dos modelos ONNX do wake word
 * e loader de bytes via fs.readFile. Rodando no main process (Node.js),
 * este módulo é a ÚNICA ponte entre o file system e o renderer para os
 * assets wakeword-models.
 *
 * SECURITY: os paths são hardcoded via app.isPackaged check. O handler
 * IPC que consome este módulo (main/ipc/wakeWord.ts) NÃO aceita argumentos
 * do renderer — mitiga T-22-02-01 (path traversal).
 *
 * Packaging (Plan 04): os 4 arquivos .onnx entram no installer via
 * electron-builder `extraResources` (NÃO asarUnpack, por pitfall do research).
 * Em dev, os arquivos ficam em `apps/desktop/resources/wakeword-models/`;
 * em prod, em `process.resourcesPath/wakeword-models/`.
 */
import { app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

// ESM-safe __dirname polyfill (main é bundled como ESM pelo electron-vite)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface WakeWordModelPaths {
  mel: string;
  embed: string;
  vad: string;
  kw: string;
}

export interface WakeWordModelBytes {
  mel: Uint8Array;
  embed: Uint8Array;
  vad: Uint8Array;
  kw: Uint8Array;
}

export function getWakeWordModelPaths(): WakeWordModelPaths {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, 'wakeword-models')
    : // Em dev: dist/main/index.js → ../../resources/wakeword-models → apps/desktop/resources/wakeword-models
      path.join(__dirname, '../../resources/wakeword-models');

  return {
    mel: path.join(base, 'melspectrogram.onnx'),
    embed: path.join(base, 'embedding_model.onnx'),
    vad: path.join(base, 'silero_vad.onnx'),
    kw: path.join(base, 'hey_jarvis_v0.1.onnx'),
  };
}

export async function loadWakeWordModelBytes(): Promise<WakeWordModelBytes> {
  const paths = getWakeWordModelPaths();
  const [mel, embed, vad, kw] = await Promise.all([
    fs.readFile(paths.mel),
    fs.readFile(paths.embed),
    fs.readFile(paths.vad),
    fs.readFile(paths.kw),
  ]);
  return {
    mel: new Uint8Array(mel.buffer, mel.byteOffset, mel.byteLength),
    embed: new Uint8Array(embed.buffer, embed.byteOffset, embed.byteLength),
    vad: new Uint8Array(vad.buffer, vad.byteOffset, vad.byteLength),
    kw: new Uint8Array(kw.buffer, kw.byteOffset, kw.byteLength),
  };
}
