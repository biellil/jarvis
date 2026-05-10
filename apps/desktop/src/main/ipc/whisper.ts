/**
 * Whisper IPC Handlers — Phase 50 (WHISPER-01, WHISPER-02)
 *
 * Handler for 'whisper:download-model':
 * 1. Resolves WhisperModelOption → WhisperModel via resolveWhisperModel
 * 2. Checks isWhisperModelCached — on hit, broadcasts success immediately
 * 3. On miss, calls ensureWhisperModel with onProgress callback that broadcasts
 *    'whisper:download-progress' events to the settings window (throttled in backend)
 *
 * Cancellation (D-04): selecting a new model while download is in-flight:
 *   - The _activeController is stored per-call; calling downloadModel again
 *     aborts the previous controller before starting a new download.
 */
import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-types.js';
import type { WhisperDownloadProgress, WhisperModelOption } from '../../shared/ipc-types.js';
import {
  ensureWhisperModel,
  isWhisperModelCached,
  MODEL_SIZES_MB,
} from '../voiceInput/whisperResources.js';
import { resolveWhisperModel } from '../voiceInput/whisperModelResolver.js';
import { setActiveWhisperModel } from '../voiceInput/voiceHandler.js';

// Active AbortController for the in-flight download (one at a time per settings window)
let _activeController: AbortController | null = null;

function broadcastProgress(getWindow: () => BrowserWindow | null, payload: WhisperDownloadProgress): void {
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.WHISPER_DOWNLOAD_PROGRESS, payload);
  }
}

// Phase 68 D-03: 'auto' removed from WhisperModelOption; vramMb unused for explicit options.
// Pass 0 as vramMb — resolveWhisperModel uses OPTION_TO_MODEL for all explicit options.
function getVramMbForResolver(): number {
  return 0;
}

/**
 * setupWhisperHandlers — registers IPC handler for 'whisper:download-model'.
 * Accepts a lazy getter for the settings window (created on first open) so this
 * can be called at startup before the settings window is instantiated (Phase 50 D-16).
 */
export function setupWhisperHandlers(getSettingsWindow: () => BrowserWindow | null): void {
  ipcMain.handle(
    IPC_CHANNELS.WHISPER_DOWNLOAD_MODEL,
    async (_event, option: WhisperModelOption): Promise<void> => {
      // Cancel previous in-flight download (D-04)
      if (_activeController) {
        _activeController.abort();
        _activeController = null;
      }

      // Phase 68 D-03: 'auto' removed; resolve via OPTION_TO_MODEL directly.
      const resolvedModel = resolveWhisperModel(option, getVramMbForResolver());

      const totalFallbackBytes = (MODEL_SIZES_MB[resolvedModel] ?? 0) * 1024 * 1024;

      // Cache hit path (D-02)
      if (isWhisperModelCached(resolvedModel)) {
        // Activate the model for subsequent transcriptions (D-16)
        setActiveWhisperModel(resolvedModel);
        broadcastProgress(getSettingsWindow, {
          model: resolvedModel,
          status: 'success',
          percent: 100,
          downloadedBytes: totalFallbackBytes,
          totalBytes: totalFallbackBytes,
        });
        return;
      }

      // Download path
      const controller = new AbortController();
      _activeController = controller;

      try {
        await ensureWhisperModel(resolvedModel, {
          signal: controller.signal,
          onProgress: ({ downloadedBytes, totalBytes, percent }) => {
            const effectiveTotal = totalBytes > 0 ? totalBytes : totalFallbackBytes;
            broadcastProgress(getSettingsWindow, {
              model: resolvedModel,
              status: 'downloading',
              percent,
              downloadedBytes,
              totalBytes: effectiveTotal,
            });
          },
        });

        // Activate the model for subsequent transcriptions (D-16)
        setActiveWhisperModel(resolvedModel);
        // Success — emit final broadcast
        broadcastProgress(getSettingsWindow, {
          model: resolvedModel,
          status: 'success',
          percent: 100,
          downloadedBytes: totalFallbackBytes,
          totalBytes: totalFallbackBytes,
        });
      } catch (err) {
        // Ignore AbortError (user switched model — new download already started)
        if (err instanceof Error && err.name === 'AbortError') return;

        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error('[whisper-ipc] Download failed:', errorMessage);
        broadcastProgress(getSettingsWindow, {
          model: resolvedModel,
          status: 'error',
          percent: 0,
          downloadedBytes: 0,
          totalBytes: totalFallbackBytes,
          errorMessage,
        });
      } finally {
        if (_activeController === controller) {
          _activeController = null;
        }
      }
    },
  );
}
