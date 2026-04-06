/**
 * Hotkey IPC Handlers
 * D-01: Centralized in ipc/ organized by feature
 * D-03: Returns Result type, never throws
 * ACTV-01: Expose hotkey status to renderer
 */
import { ipcMain, globalShortcut } from 'electron';
import { IPC_CHANNELS, type GetHotkeyStatusResponse } from '../../shared/ipc-types';
import Store from 'electron-store';

interface HotkeyConfig {
  accelerator: string;
}

interface StoreSchema {
  hotkey?: HotkeyConfig;
}

const store = new Store<StoreSchema>();
const DEFAULT_HOTKEY = 'CmdOrCtrl+Shift+J';

export function setupHotkeyHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.HOTKEY_GET_STATUS,
    async (): Promise<GetHotkeyStatusResponse> => {
      try {
        // Get current hotkey from store
        const savedConfig = store.get('hotkey');
        const accelerator = savedConfig?.accelerator || DEFAULT_HOTKEY;

        // Check if hotkey is currently registered
        const registered = globalShortcut.isRegistered(accelerator);

        console.log(`[IPC:hotkey:get-status] Accelerator: ${accelerator}, Registered: ${registered}`);

        return {
          success: true,
          data: {
            accelerator,
            registered,
          },
        };
      } catch (err) {
        // D-03: Never throw across IPC boundary - return Result type
        console.error('[IPC:hotkey:get-status] Error:', err);
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }
  );
}
