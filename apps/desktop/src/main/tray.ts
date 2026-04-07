/**
 * System Tray Module
 *
 * DESK-04: Tray icon with menu Show/Hide/Quit
 * ACTV-01: Configure Hotkey submenu with radio options
 * ACTV-03: Configure PTT submenu with radio options
 * D-05: Icon 16x16 + 32x32 PNG cyan circle
 * D-06: Single-click shows menu (Windows/Linux default)
 * D-07: Tooltip "JARVIS"
 * D-08: Menu with Show, Hide, Configure Hotkey, Configure PTT, Quit
 */
import { Tray, Menu, app, BrowserWindow } from 'electron';
import path from 'node:path';
import { changeHotkey } from './hotkey';
import { changePttHotkey } from './ptt-hotkey';
import { getWidgetHotkey, getPttHotkey } from './store';

let tray: Tray | null = null;

// D-06 to D-08: Available hotkey options (research line 173-178)
const HOTKEY_OPTIONS = [
  { label: 'Ctrl+Shift+J', accelerator: 'CmdOrCtrl+Shift+J' },
  { label: 'Ctrl+Alt+J', accelerator: 'CmdOrCtrl+Alt+J' },
  { label: 'Ctrl+Shift+Space', accelerator: 'CmdOrCtrl+Shift+Space' },
  { label: 'Ctrl+`', accelerator: 'CmdOrCtrl+`' },
] as const;

// PTT hotkey options (D-02)
const PTT_HOTKEY_OPTIONS = [
  { label: 'Space', accelerator: 'Space' },
  { label: 'Ctrl+Space', accelerator: 'CmdOrCtrl+Space' },
  { label: 'CapsLock (hold)', accelerator: 'CapsLock' },
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
  // Get current hotkeys from store
  const currentAccelerator = getWidgetHotkey();
  const currentPttAccelerator = getPttHotkey();

  // D-08: Extended menu with Configure Hotkey and Configure PTT submenus
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
      label: 'Configure PTT',
      submenu: PTT_HOTKEY_OPTIONS.map((option) => ({
        label: option.label,
        type: 'radio' as const,
        checked: option.accelerator === currentPttAccelerator,
        click: () => {
          // D-02: Immediate PTT hotkey change
          const success = changePttHotkey(option.accelerator, mainWindow);
          if (success) {
            // Rebuild menu to update radio selection
            const newMenu = buildContextMenu(mainWindow);
            tray?.setContextMenu(newMenu);
          } else {
            // D-06: Log warning if registration failed
            console.warn(`[Tray] Failed to change PTT hotkey to ${option.accelerator}`);
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
