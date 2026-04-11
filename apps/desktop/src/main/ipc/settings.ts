/**
 * Settings IPC Handlers
 * WAKE-03: Persist wakeWordEnabled preference
 */
import { ipcMain, BrowserWindow } from 'electron';
import { getWakeWordEnabled, setWakeWordEnabled } from '../store';

export function setupSettingsHandlers(): void {
  // Handle sync call for initial state
  ipcMain.handle('get-wake-word-enabled', () => {
    return getWakeWordEnabled();
  });

  // Handle updates from UI (though currently it's more from Tray)
  ipcMain.on('set-wake-word-enabled', (_event, enabled: boolean) => {
    setWakeWordEnabled(enabled);

    // Notify all windows (renderer) of the change
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('wake-word-settings-changed', enabled);
    });
  });
}
