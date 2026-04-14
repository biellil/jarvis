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

import { app, BrowserWindow, dialog, ipcMain, screen, session } from 'electron';
import { setupIpcHandlers } from './ipc';
import { calculateInitialPosition, savePosition } from './position';
import { getOrbPosition, setOrbPosition } from './store';
import { IPC_CHANNELS } from '../shared/ipc-types';
import { createTray, destroyTray } from './tray';
import { registerHotkey, unregisterAll } from './hotkey';
import { registerPttHotkey, unregisterPttHotkey } from './ptt-hotkey';
import { loadBackendConfig, createBackendClient } from './backend-client';
import { openChatStream } from './sse-client';
import { createActionExecutor, type ActionExecutor } from './action-executor';
import { ACTION_HANDLERS, REQUIRES_CONFIRMATION } from './actions';
import { initializeGpuDetection } from './voiceInput/gpuDetection';

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
  // ORB-POL-05: prefer last dragged position; fall back to calculateInitialPosition()
  const orbPos = getOrbPosition();
  const { x, y } = orbPos ?? calculateInitialPosition();
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

app.whenReady().then(async () => {
  // 22-GAP-07: Permission handler explícito para microfone e media.
  // Sem esse handler, o comportamento padrão do Electron pode silenciosamente
  // negar getUserMedia (dependendo da versão), fazendo o wake word e PTT
  // falharem sem erro visível. Agora concedemos explicitamente e logamos toda
  // requisição de permissão pra debug.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const origin = 'requestingUrl' in details ? (details as { requestingUrl?: string }).requestingUrl : 'unknown';
    console.log('[permission] request:', permission, 'from:', origin);
    if (permission === 'media' || permission === 'audioCapture') {
      console.log('[permission] → granted:', permission);
      callback(true);
      return;
    }
    // Nega tudo que não seja media por padrão — principio do menor privilégio.
    console.log('[permission] → denied (not media):', permission);
    callback(false);
  });

  // Check handler — usado quando o renderer consulta permissions.query() ou
  // o próprio Chromium verifica cached permission antes de prompt.
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === 'media' || permission === 'audioCapture') {
      return true;
    }
    return false;
  });

  console.log('[permission] handlers registered — media/audioCapture granted by default');

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

  // Phase 29 (STT-01, STT-03): GPU detection on startup when local STT enabled
  // D-09: detect once, cache in module scope, zero overhead per transcription
  // D-13: feature flag default false — existing behavior preserved when unset
  const useWhisperCpp = process.env['USE_WHISPER_CPP'] === 'true';
  if (useWhisperCpp) {
    try {
      await initializeGpuDetection();
    } catch (err) {
      console.error('[whisper] GPU detection failed:', err);
      // Non-fatal: app continues; STT will be unavailable
    }
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

  // Phase 25 ORB-POL-05: mover janela durante drag do orb.
  // dx/dy são deltas de posição (pixels) — o renderer calcula a diferença
  // entre posição atual do mouse e posição no início do drag (mousedown).
  ipcMain.on(IPC_CHANNELS.WINDOW_MOVE, (_event, dx: number, dy: number) => {
    if (!mainWindow) return;
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x + dx, y + dy);
  });

  // Phase 25 ORB-POL-05: persistir posição após drag completado.
  // Chamado no mouseup do renderer — salva posição atual da janela.
  ipcMain.on(IPC_CHANNELS.WINDOW_SAVE_ORB_POSITION, (_event) => {
    if (!mainWindow) return;
    const [x, y] = mainWindow.getPosition();
    setOrbPosition(x, y);
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
