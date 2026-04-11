/**
 * Wake Word Pause IPC Handlers — Phase 23 Plan 02 (D-03, D-06)
 *
 * WAKE-03: Persist wakeWordPaused preference. Substitui o draft antigo
 * baseado em `wakeWordEnabled` / `wake-word-settings-changed` (semântica
 * invertida conforme 23-CONTEXT.md).
 *
 * - Handler `wakeWord:get-paused`: renderer lê o valor persistido no boot
 * - broadcastPauseToggle(paused): helper chamado pelo tray após o click
 *   para notificar TODAS as janelas de renderer (useWakeWord escuta via
 *   onPauseToggle).
 */
import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-types';
import { getWakeWordPaused } from '../store';

export function setupSettingsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.WAKE_WORD_GET_PAUSED, () => {
    return getWakeWordPaused();
  });
}

/**
 * Broadcast do toggle pause/resume a todos os renderers abertos.
 * Chamado pelo tray.ts onClick do item "Pause listening"/"Resume listening".
 */
export function broadcastPauseToggle(paused: boolean): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(IPC_CHANNELS.WAKE_WORD_PAUSE_TOGGLE, paused);
  });
}
