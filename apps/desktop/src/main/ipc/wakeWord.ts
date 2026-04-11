/**
 * Wake Word IPC Handlers — Phase 22 Plan 02.
 *
 * Expõe um único canal `wakeWord:load-models` que retorna os 4 modelos ONNX
 * como Uint8Arrays para o renderer criar InferenceSessions.
 *
 * SECURITY: o handler NÃO aceita argumentos do renderer — os paths são
 * resolvidos 100% no main via `getWakeWordModelPaths()` baseado em
 * `app.isPackaged`. Mitiga T-22-02-01 (path traversal via IPC).
 *
 * Pattern: segue `setupHotkeyHandlers()` — função sem args que registra os
 * handlers internamente via `ipcMain.handle`. Chamada a partir do entry real
 * de IPC (apps/desktop/src/main/ipc/index.ts), NÃO via um `ipc.ts` obsoleto
 * que não existe no projeto.
 */
import { ipcMain } from 'electron';
import {
  loadWakeWordModelBytes,
  type WakeWordModelBytes,
} from '../voiceInput/resources';
import { IPC_CHANNELS } from '../../shared/ipc-types';

export function registerWakeWordIpc(): void {
  ipcMain.handle(
    IPC_CHANNELS.WAKE_WORD_LOAD_MODELS,
    async (): Promise<WakeWordModelBytes> => {
      // Deliberadamente ignora o event arg — path hardcoded no main.
      return await loadWakeWordModelBytes();
    },
  );
}
