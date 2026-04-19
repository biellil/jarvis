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
 *
 * Phase 23 Plan 02 (D-03): Primeiro item do menu é "Pause listening" /
 * "Resume listening" — kill switch do wake word com persistência via
 * store + broadcast para renderers via ipc/settings.
 */
import { Tray, Menu, app, BrowserWindow } from 'electron';
import path from 'node:path';
import { changeHotkey } from './hotkey';
import { changePttHotkey } from './ptt-hotkey';
import {
  getWidgetHotkey,
  getPttHotkey,
  getWakeWordPaused,
  setWakeWordPaused,
} from './store';
import { broadcastPauseToggle } from './ipc/settings';
import { openSettingsWindow } from './settingsWindow';

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
  const paused = getWakeWordPaused();

  // D-03: reflect estado atual no tooltip do tray. O menu é rebuild toda vez
  // que o usuário alterna pause/resume, então o tooltip fica sincronizado.
  tray?.setToolTip(paused ? 'JARVIS — paused' : 'JARVIS — listening');

  // D-08: Extended menu with Configure Hotkey and Configure PTT submenus
  return Menu.buildFromTemplate([
    // Phase 23 Plan 02 (D-03): kill switch pause/resume no TOPO
    {
      label: paused ? 'Resume listening' : 'Pause listening',
      click: () => {
        const next = !paused;
        setWakeWordPaused(next);
        broadcastPauseToggle(next);
        // Rebuild para refletir o novo label + tooltip
        const rebuilt = buildContextMenu(mainWindow);
        tray?.setContextMenu(rebuilt);
      },
    },
    { type: 'separator' },
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
      label: 'Settings',
      click: () => openSettingsWindow(),
    },
    { type: 'separator' },
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
    { type: 'separator' },
    {
      label: 'Open DevTools',
      click: () => {
        // Janela de 240x240 transparente sem frame não tem como abrir DevTools
        // via Ctrl+Shift+I (não captura foco). Abrir via tray é a única via.
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      },
    },
    { type: 'separator' },
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
