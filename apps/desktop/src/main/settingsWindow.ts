import { BrowserWindow, app, ipcMain } from 'electron';
import path from 'node:path';
import process from 'node:process';
import { IPC_CHANNELS } from '../shared/ipc-types';

let settingsWindow: BrowserWindow | null = null;

function createSettingsWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 520,
    show: false,
    frame: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, '../preload/settings.js'),
    },
  });

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    const base = process.env['ELECTRON_RENDERER_URL'].replace(/\/$/, '');
    win.loadURL(`${base}/settings.html`);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/settings.html'));
  }

  // Hide instead of destroy on close — reopens instantly
  win.on('close', (e) => {
    e.preventDefault();
    win.hide();
  });

  return win;
}

export function openSettingsWindow(): void {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    settingsWindow = createSettingsWindow();
  }

  if (!settingsWindow.isVisible()) {
    settingsWindow.show();
  } else {
    settingsWindow.focus();
  }
}

export function initSettingsWindowIpc(): void {
  ipcMain.on(IPC_CHANNELS.SETTINGS_CLOSE, () => {
    settingsWindow?.hide();
  });
}
