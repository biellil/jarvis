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
import { getSelectedModel } from '../voiceInput/vramDetection.js';
import { setActiveWhisperModel } from '../voiceInput/voiceHandler.js';

// Active AbortController for the in-flight download (one at a time per settings window)
let _activeController: AbortController | null = null;

function broadcastProgress(settingsWindow: BrowserWindow, payload: WhisperDownloadProgress): void {
  if (!settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send(IPC_CHANNELS.WHISPER_DOWNLOAD_PROGRESS, payload);
  }
}

/**
 * Resolve VRAM-detected model size to a numeric MB estimate for 'auto' resolution.
 * Since vramDetection.ts does not export a raw VRAM number (only the resolved model),
 * we pass 0 and let resolveWhisperModel fall back to selectModelByVram(0) for 'auto'.
 * For non-'auto' options, vramMb is unused.
 *
 * A better approach for 'auto': directly use getSelectedModel() from vramDetection
 * which already ran VRAM detection at startup.
 */
function getVramMbForResolver(): number {
  // vramDetection.ts doesn't export a raw VRAM number;
  // resolveWhisperModel 'auto' branch will use selectModelByVram(0) → 'base' (CPU path).
  // This is acceptable — the auto-VRAM model was already selected at startup via
  // detectVramAndSelectModel() and is available via getSelectedModel().
  return 0;
}

export function setupWhisperHandlers(settingsWindow: BrowserWindow): void {
  ipcMain.handle(
    IPC_CHANNELS.WHISPER_DOWNLOAD_MODEL,
    async (_event, option: WhisperModelOption): Promise<void> => {
      // Cancel previous in-flight download (D-04)
      if (_activeController) {
        _activeController.abort();
        _activeController = null;
      }

      // For 'auto', use the already-resolved VRAM-detected model directly
      // to avoid re-running VRAM detection synchronously.
      let resolvedModel: ReturnType<typeof getSelectedModel>;
      if (option === 'auto') {
        resolvedModel = getSelectedModel();
      } else {
        resolvedModel = resolveWhisperModel(option, getVramMbForResolver());
      }

      const totalFallbackBytes = (MODEL_SIZES_MB[resolvedModel] ?? 0) * 1024 * 1024;

      // Cache hit path (D-02)
      if (isWhisperModelCached(resolvedModel)) {
        // Activate the model for subsequent transcriptions (D-16)
        setActiveWhisperModel(resolvedModel);
        broadcastProgress(settingsWindow, {
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
            broadcastProgress(settingsWindow, {
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
        broadcastProgress(settingsWindow, {
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
        broadcastProgress(settingsWindow, {
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
