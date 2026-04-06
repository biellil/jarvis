/**
 * Electron Main Process
 *
 * SECURITY: This file creates the BrowserWindow with security-hardened configuration.
 * DESK-01: contextIsolation: true, nodeIntegration: false
 *
 * Pattern: RESEARCH.md Pattern 2 - Security-First BrowserWindow Configuration
 */
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { setupIpcHandlers } from './ipc';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false, // Prevent white flash - show after 'ready-to-show'
    backgroundColor: '#0F172A', // Match UI-SPEC slate-900
    webPreferences: {
      // ================================================
      // SECURITY HARDENING - CRITICAL, NON-NEGOTIABLE
      // ================================================
      contextIsolation: true,      // Isolate preload from renderer context
      nodeIntegration: false,      // Renderer cannot access Node.js APIs
      sandbox: true,               // Renderer in OS-level sandbox (default v20+)
      webSecurity: true,           // Enforce same-origin policy
      allowRunningInsecureContent: false, // Block mixed content

      // Preload script - the ONLY bridge between main and renderer
      preload: path.join(__dirname, '../preload/index.js'),
    },
  });

  // Load renderer based on environment
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    // Development - HMR via Vite dev server
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
    mainWindow.webContents.openDevTools(); // Auto-open DevTools in dev
  } else {
    // Production - load bundled index.html
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Show window when ready - prevents white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  setupIpcHandlers(); // Register IPC handlers before window creation
  createWindow();

  app.on('activate', () => {
    // macOS: re-create window when dock icon clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Quit on all platforms except macOS
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
