/**
 * Electron Main Process
 *
 * SECURITY: This file creates the BrowserWindow with security-hardened configuration.
 * DESK-01: contextIsolation: true, nodeIntegration: false
 *
 * Pattern: RESEARCH.md Pattern 2 - Security-First BrowserWindow Configuration
 */
import path from 'node:path';
import process from 'node:process';

// Load .env from monorepo root before anything else reads process.env.
// Node 21+ native API — no dotenv dep needed.
try {
  const envPath = path.resolve(import.meta.dirname ?? __dirname, '../../../../.env');
  process.loadEnvFile(envPath);
} catch {
  // .env is optional — loadBackendConfig will fail-fast if required vars missing.
}

import { app, BrowserWindow, dialog, ipcMain, screen } from 'electron';
import { setupIpcHandlers } from './ipc';
import { calculateInitialPosition, savePosition } from './position';
import { createTray, destroyTray } from './tray';
import { registerHotkey, unregisterAll } from './hotkey';
import { registerPttHotkey, unregisterPttHotkey } from './ptt-hotkey';
import { loadBackendConfig, createBackendClient } from './backend-client';
import { openChatStream } from './sse-client';
import { createActionExecutor, type ActionExecutor } from './action-executor';
import { ACTION_HANDLERS, REQUIRES_CONFIRMATION } from './actions';

let mainWindow: BrowserWindow | null = null;
let actionExecutor: ActionExecutor | null = null;

function createWindow(): void {
  // D-03 (260410-td5): janela 240x240 = esfera 128px + 56px de respiro em cada
  // lado para drop-shadow externo não ser cortado pela borda retangular.
  mainWindow = new BrowserWindow({
    width: 240,
    height: 240,
    show: false,                 // Prevent white flash - show after 'ready-to-show'
    frame: false,                // DESK-02: frameless window
    transparent: true,           // DESK-02: transparent background
    backgroundColor: '#00000000', // Explicit transparent hex (Windows 11 defaults to white without this)
    hasShadow: false,            // OS shadow paints a visible rectangle behind the window
    alwaysOnTop: true,           // DESK-02: always-on-top
    skipTaskbar: true,           // DESK-02: hide from taskbar/alt+tab
    resizable: false,            // Fixed size in Phase 10
    webPreferences: {
      // ================================================
      // SECURITY HARDENING - CRITICAL, NON-NEGOTIABLE
      // ================================================
      contextIsolation: true,      // Isolate preload from renderer context
      nodeIntegration: false,      // Renderer cannot access Node.js APIs
      sandbox: true,               // Renderer in OS-level sandbox (default v20+)
      webSecurity: true,           // Enforce same-origin policy
      allowRunningInsecureContent: false, // Block mixed content

      // Phase 22 WAKE-01: janela oculta (hide via hotkey / fora da tela)
      // NÃO pode pausar o renderer — wake word engine precisa continuar
      // rodando inferência contínua mesmo sem foco. Chromium pausa o
      // renderer por default após ~10s sem foco; backgroundThrottling:false
      // desliga essa otimização. Trava de research §Pattern 5 + CONTEXT.md.
      backgroundThrottling: false,

      // Preload script - the ONLY bridge between main and renderer
      preload: path.join(__dirname, '../preload/index.js'),
    },
  });

  // Set initial position before loading URL
  const { x, y } = calculateInitialPosition();
  mainWindow.setPosition(x, y);

  // Load renderer based on environment
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    // Development - HMR via Vite dev server
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
    // DevTools: Ctrl+Shift+I or right-click > Inspect to open manually
  } else {
    // Production - load bundled index.html
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Show window when ready - prevents white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Default: transparent areas pass clicks through to desktop
  // forward: true keeps mousemove flowing into renderer for hover detection
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Fase 18.5: fail-fast se JARVIS_API_KEY ausente.
  let config;
  try {
    config = loadBackendConfig();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `ERRO: JARVIS_API_KEY env var obrigatória. Gere com: openssl rand -hex 32\nDetalhe: ${msg}`,
    );
    app.exit(1);
    return;
  }

  const backendClient = createBackendClient(config);
  actionExecutor = createActionExecutor({
    handlers: ACTION_HANDLERS,
    requiresConfirmation: REQUIRES_CONFIRMATION,
    backendClient,
    dialog: {
      showMessageBox: (opts) =>
        dialog.showMessageBox(opts as Electron.MessageBoxOptions),
    },
  });

  setupIpcHandlers({
    openStream: openChatStream,
    config,
    actionExecutor,
  });
  createWindow();

  // IPC: toggle click-through from renderer (orb hover enter/leave)
  ipcMain.on('window:set-ignore-mouse', (_event, ignore: boolean) => {
    mainWindow?.setIgnoreMouseEvents(ignore, { forward: true });
  });
  createTray(mainWindow!); // DESK-04: Initialize tray icon

  const hotkeyRegistered = registerHotkey(mainWindow!);
  if (!hotkeyRegistered) {
    console.warn('Failed to register hotkey - already in use or system restriction');
  }

  const pttHotkeyRegistered = registerPttHotkey(mainWindow!);
  if (!pttHotkeyRegistered) {
    console.warn('Failed to register PTT hotkey - already in use or system restriction');
  }

  app.on('activate', () => {
    // macOS: re-create window when dock icon clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Save position and cleanup before app quits (D-10)
app.on('before-quit', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const [x, y] = mainWindow.getPosition();
    savePosition(x, y);
  }
  unregisterAll(); // Cleanup widget global shortcuts
  unregisterPttHotkey(); // Cleanup PTT hotkey
  destroyTray(); // Cleanup tray icon
  // Fase 18.5: aguarda queue de actions drenar (fire-and-forget, before-quit
  // não pode ser async sem event.preventDefault — é best-effort).
  actionExecutor?.shutdown().catch((err) => {
    console.warn('[main] actionExecutor.shutdown() failed:', err);
  });
});

app.on('window-all-closed', () => {
  // Quit on all platforms except macOS
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
