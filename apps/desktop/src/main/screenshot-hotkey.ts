/**
 * Screenshot Hotkey Module — Phase 63 Vision Pipeline (VISION-03)
 *
 * D-07: Configurable global hotkey (default CmdOrCtrl+Shift+S) triggers screen capture.
 * Pattern: mirrors ptt-hotkey.ts exactly — module-scoped currentHotkey tracking,
 * register/change/unregister exports, BrowserWindow reference for webContents.send.
 *
 * On trigger:
 *   1. Call desktopCapturer inline (same logic as capture.ts handler)
 *   2. Send VISION_SCREENSHOT_CAPTURED to renderer with base64 data URL
 *   3. Show + focus main window (chat input becomes active)
 *
 * Note: capture is done inline here (not via IPC round-trip) to avoid
 * ipcRenderer.invoke() from main process (main can call desktopCapturer directly).
 */
import { globalShortcut, BrowserWindow, desktopCapturer } from 'electron';
import sharp from 'sharp';
import { IPC_CHANNELS } from '../shared/ipc-types.js';
import { getScreenshotHotkey, setScreenshotHotkey } from './store.js';

// Track current accelerator for re-registration on change and unregister on quit
let currentScreenshotHotkey: string | null = null;

/**
 * Capture screen and return base64 data URL (inline — same logic as capture.ts handler).
 * Returns null on failure (permission denied, no sources, sharp error).
 */
async function captureScreenForHotkey(): Promise<string | null> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    });
    if (sources.length === 0) {
      console.warn('[screenshot-hotkey] No sources — screen recording permission denied?');
      return null;
    }
    const pngBuffer = sources[0].thumbnail.toPNG();
    const jpegBuffer = await sharp(pngBuffer)
      .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
  } catch (err) {
    console.error('[screenshot-hotkey] Capture error:', (err as Error).message);
    return null;
  }
}

/**
 * Register the screenshot global hotkey.
 * Reads accelerator from electron-store (default: 'CmdOrCtrl+Shift+S').
 * Returns true on success, false if accelerator already taken.
 */
export function registerScreenshotHotkey(mainWindow: BrowserWindow): boolean {
  const accelerator = getScreenshotHotkey();

  const success = globalShortcut.register(accelerator, async () => {
    console.log('[screenshot-hotkey] Triggered — capturing screen');
    const base64 = await captureScreenForHotkey();
    if (!base64) {
      // Show error via renderer
      mainWindow.webContents.send(IPC_CHANNELS.VISION_SCREENSHOT_CAPTURED, {
        base64: null,
        error: 'PERMISSION_DENIED',
      });
      return;
    }
    // Send to renderer — ChatInput.tsx listens and populates pendingImage
    mainWindow.webContents.send(IPC_CHANNELS.VISION_SCREENSHOT_CAPTURED, { base64 });
    // Focus chat window so user can type their question
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    console.log('[screenshot-hotkey] Screenshot sent to renderer');
  });

  if (success) {
    currentScreenshotHotkey = accelerator;
    console.log(`[screenshot-hotkey] Registered: ${accelerator}`);
  } else {
    console.warn(`[screenshot-hotkey] Failed to register: ${accelerator} (already taken)`);
  }

  return success;
}

/**
 * Change screenshot hotkey to a new accelerator.
 * Persists to electron-store. Returns true on success.
 */
export function changeScreenshotHotkey(accelerator: string, mainWindow: BrowserWindow): boolean {
  if (currentScreenshotHotkey) {
    globalShortcut.unregister(currentScreenshotHotkey);
    console.log(`[screenshot-hotkey] Unregistered: ${currentScreenshotHotkey}`);
  }
  currentScreenshotHotkey = null;

  const prevHotkey = currentScreenshotHotkey;
  setScreenshotHotkey(accelerator);
  const success = registerScreenshotHotkey(mainWindow);
  if (!success) {
    // Restore previous hotkey string if new one failed
    if (prevHotkey) {
      setScreenshotHotkey(prevHotkey);
    }
  }
  return success;
}

/**
 * Unregister screenshot hotkey. Call on app 'will-quit' / 'before-quit'.
 */
export function unregisterScreenshotHotkey(): void {
  if (currentScreenshotHotkey) {
    globalShortcut.unregister(currentScreenshotHotkey);
    currentScreenshotHotkey = null;
    console.log('[screenshot-hotkey] Hotkey unregistered');
  }
}
