/**
 * Settings IPC Handlers
 *
 * Phase 23 Plan 02 (D-03, D-06): Wake word pause handlers (preserved)
 * Phase 34 (SET-01..05): Settings window get/save handlers
 */
import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS, type SettingsData, type SaveSettingsRequest } from '../../shared/ipc-types';
import {
  getWakeWordPaused,
  getPttHotkey,
  getTtsProvider,
  getTtsApiKey,
  getWhisperModelOverride,
  setTtsProvider,
  setTtsApiKey,
  setWhisperModelOverride,
} from '../store';
import { changePttHotkey } from '../ptt-hotkey';
import { reinitializeTTS } from '../voiceInput/voiceHandler';

export function setupSettingsHandlers(mainWindow: BrowserWindow): void {
  // Phase 23: wake word pause handler (preserved)
  ipcMain.handle(IPC_CHANNELS.WAKE_WORD_GET_PAUSED, () => {
    return getWakeWordPaused();
  });

  // Phase 34: get all settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (): SettingsData => {
    return {
      pttHotkey: getPttHotkey(),
      ttsProvider: getTtsProvider(),
      ttsApiKey: getTtsApiKey(),
      whisperModelOverride: getWhisperModelOverride(),
    };
  });

  // Phase 34: save settings — applies each field, live-reloads TTS if changed
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SAVE,
    async (_event, request: SaveSettingsRequest): Promise<{ success: boolean; error?: string }> => {
      try {
        // PTT hotkey change
        if (request.pttHotkey !== undefined) {
          const ok = changePttHotkey(request.pttHotkey, mainWindow);
          if (!ok) {
            return { success: false, error: 'PTT hotkey already in use' };
          }
        }

        // TTS provider and API key
        if (request.ttsProvider !== undefined) {
          setTtsProvider(request.ttsProvider);
        }
        if (request.ttsApiKey !== undefined) {
          setTtsApiKey(request.ttsApiKey);
        }

        // Whisper model override
        if (request.whisperModelOverride !== undefined) {
          setWhisperModelOverride(request.whisperModelOverride);
        }

        // Live TTS reload when TTS-related settings changed (SET-03)
        if (request.ttsProvider !== undefined || request.ttsApiKey !== undefined) {
          try {
            await reinitializeTTS();
            console.log('[settings] TTS provider re-initialized after settings save');
          } catch (reinitErr) {
            // Non-fatal: TTS will use previous provider; log but don't block save
            console.warn('[settings] TTS reinit failed (non-fatal):', reinitErr);
          }
        }

        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[settings] Save error:', message);
        return { success: false, error: message };
      }
    },
  );
}

/**
 * Broadcast do toggle pause/resume a todos os renderers abertos.
 * Chamado pelo tray.ts onClick do item "Pause listening"/"Resume listening".
 */
export function broadcastPauseToggle(paused: boolean): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(IPC_CHANNELS.WAKE_WORD_PAUSE_TOGGLE, paused);
  });
}
