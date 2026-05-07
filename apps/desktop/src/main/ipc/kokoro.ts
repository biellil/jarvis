/**
 * Kokoro IPC Handlers — Phase 62 (TTS-OFF-01, TTS-OFF-04)
 *
 * Handlers for Kokoro model download with progress (mirrors whisper.ts Phase 50).
 * D-02: AbortController cancels in-flight download.
 * D-04: Restart from zero on retry — no Range header (handled by kokoroResources.ts).
 */
import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-types.js';
import type { KokoroDownloadProgress } from '../../shared/ipc-types.js';
import {
  downloadKokoroModel,
  isKokoroModelCached,
  getKokoroModelPath,
  KOKORO_MODEL_SIZE_MB,
} from '../voiceInput/tts/kokoroResources.js';
import { setKokoroModelPath } from '../store.js';

let _activeController: AbortController | null = null;

function broadcastProgress(
  getWindow: () => BrowserWindow | null,
  payload: KokoroDownloadProgress,
): void {
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.KOKORO_DOWNLOAD_PROGRESS, payload);
  }
}

/**
 * setupKokoroHandlers — registers IPC handlers for Kokoro model management.
 * Accepts a lazy getter for the settings window (same pattern as setupWhisperHandlers,
 * Phase 50 D-16: settings window is created lazily, not at startup).
 */
export function setupKokoroHandlers(getSettingsWindow: () => BrowserWindow | null): void {
  // Check if model is already cached
  ipcMain.handle(IPC_CHANNELS.KOKORO_CHECK_CACHED, (): boolean => {
    return isKokoroModelCached();
  });

  // Start download
  ipcMain.handle(IPC_CHANNELS.KOKORO_DOWNLOAD_MODEL, async (): Promise<void> => {
    // D-02: Cancel any in-flight download before starting new one
    if (_activeController) {
      _activeController.abort();
      _activeController = null;
    }

    // Cache hit: broadcast success immediately (no download needed)
    if (isKokoroModelCached()) {
      broadcastProgress(getSettingsWindow, {
        status: 'success',
        percent: 100,
        downloadedMb: KOKORO_MODEL_SIZE_MB,
        totalMb: KOKORO_MODEL_SIZE_MB,
      });
      return;
    }

    _activeController = new AbortController();
    const controller = _activeController;

    try {
      await downloadKokoroModel({
        signal: controller.signal,
        onProgress: (percent, downloadedMb, totalMb) => {
          broadcastProgress(getSettingsWindow, {
            status: 'downloading',
            percent,
            downloadedMb,
            totalMb,
          });
        },
      });

      // Persist model path to store for fast cache check on restart
      setKokoroModelPath(getKokoroModelPath());

      broadcastProgress(getSettingsWindow, {
        status: 'success',
        percent: 100,
        downloadedMb: KOKORO_MODEL_SIZE_MB,
        totalMb: KOKORO_MODEL_SIZE_MB,
      });
    } catch (err) {
      if (controller.signal.aborted) return; // User cancelled — no error broadcast
      const msg = err instanceof Error ? err.message : String(err);
      broadcastProgress(getSettingsWindow, {
        status: 'error',
        percent: 0,
        downloadedMb: 0,
        totalMb: KOKORO_MODEL_SIZE_MB,
        errorMessage: msg,
      });
    } finally {
      if (_activeController === controller) _activeController = null;
    }
  });

  // Cancel download
  ipcMain.handle(IPC_CHANNELS.KOKORO_CANCEL_DOWNLOAD, (): void => {
    if (_activeController) {
      _activeController.abort();
      _activeController = null;
    }
  });
}
