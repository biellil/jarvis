/**
 * System Tray Module
 *
 * DESK-04: Tray icon with menu Show/Hide/Quit
 * D-05: Icon 16x16 + 32x32 PNG cyan circle
 * D-06: Single-click shows menu (Windows/Linux default)
 * D-07: Tooltip "JARVIS"
 * D-08: Menu with exactly 3 items: Show, Hide, Quit
 */
import { Tray, Menu, app, BrowserWindow } from 'electron';
import path from 'node:path';

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow): void {
  // D-05: Use 16x16 icon (Electron auto-selects 32x32 for high-DPI)
  const iconPath = path.join(__dirname, '../../resources/tray/icon-16x16.png');
  tray = new Tray(iconPath);

  // D-07: Simple tooltip with app name only
  tray.setToolTip('JARVIS');

  // D-08: Exactly 3 menu items for DESK-04 compliance
  const contextMenu = Menu.buildFromTemplate([
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
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  // D-06: Single-click shows context menu (default behavior)
  tray.setContextMenu(contextMenu);
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
