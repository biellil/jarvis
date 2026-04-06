/**
 * System Tray Module
 *
 * DESK-04: Tray icon with menu Show/Hide/Quit
 * ACTV-01: Configure Hotkey submenu with radio options
 * D-05: Icon 16x16 + 32x32 PNG cyan circle
 * D-06: Single-click shows menu (Windows/Linux default)
 * D-07: Tooltip "JARVIS"
 * D-08: Menu with Show, Hide, Configure Hotkey, Quit
 */
import { Tray, Menu, app, BrowserWindow } from 'electron';
import path from 'node:path';
import { changeHotkey } from './hotkey';
import Store from 'electron-store';

let tray: Tray | null = null;

interface HotkeyConfig {
  accelerator: string;
}

interface StoreSchema {
  hotkey?: HotkeyConfig;
}

const store = new Store<StoreSchema>();

// D-06 to D-08: Available hotkey options (research line 173-178)
const HOTKEY_OPTIONS = [
  { label: 'Ctrl+Shift+J', accelerator: 'CmdOrCtrl+Shift+J' },
  { label: 'Ctrl+Alt+J', accelerator: 'CmdOrCtrl+Alt+J' },
  { label: 'Ctrl+Shift+Space', accelerator: 'CmdOrCtrl+Shift+Space' },
  { label: 'Ctrl+`', accelerator: 'CmdOrCtrl+`' },
] as const;

export function createTray(mainWindow: BrowserWindow): void {
  // D-05: Use 16x16 icon (Electron auto-selects 32x32 for high-DPI)
  const iconPath = path.join(__dirname, '../../resources/tray/icon-16x16.png');
  tray = new Tray(iconPath);

  // D-07: Simple tooltip with app name only
  tray.setToolTip('JARVIS');

  // Build context menu with hotkey submenu
  const contextMenu = buildContextMenu(mainWindow);

  // D-06: Single-click shows context menu (default behavior)
  tray.setContextMenu(contextMenu);
}

function buildContextMenu(mainWindow: BrowserWindow): Menu {
  // Get current hotkey from store
  const savedConfig = store.get('hotkey');
  const currentAccelerator = savedConfig?.accelerator || 'CmdOrCtrl+Shift+J';

  // D-08: Extended menu with Configure Hotkey submenu
  return Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        mainWindow.show();
      },
    },
    {
      label: 'Hide',
      click: () => {
        mainWindow.hide();
      },
    },
    {
      label: 'Configure Hotkey',
      submenu: HOTKEY_OPTIONS.map((option) => ({
        label: option.label,
        type: 'radio' as const,
        checked: option.accelerator === currentAccelerator,
        click: () => {
          // D-08: Immediate hotkey change
          const success = changeHotkey(option.accelerator, mainWindow);
          if (success) {
            // Rebuild menu to update radio selection
            const newMenu = buildContextMenu(mainWindow);
            tray?.setContextMenu(newMenu);
          }
        },
      })),
    },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
