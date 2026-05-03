import { contextBridge, ipcRenderer } from 'electron';
import type { SettingsApi, WhisperApi, WhisperDownloadProgress } from '../shared/ipc-types';

// Inlined to avoid shared chunk extraction in preload bundle (Electron sandbox
// preloadRequire can't load Rollup chunk files). Must match
// IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD in shared/ipc-types.ts.
const VAD_THRESHOLD_CHANNEL = 'always-listening:vad-threshold';

const settings: SettingsApi = {
  get: () => ipcRenderer.invoke('settings:get'),
  save: (data) => ipcRenderer.invoke('settings:save', data),
  close: () => ipcRenderer.send('settings:close'),
  // Phase 40 (VLISTEN-04) — runtime apply do VAD silence threshold.
  // Boundary IPC clampa [300, 800]ms (T-40-VAD); o backend retorna o valor
  // efetivamente aplicado em clampedMs.
  setVadThreshold: (ms: number) => ipcRenderer.invoke(VAD_THRESHOLD_CHANNEL, ms),
};

contextBridge.exposeInMainWorld('settings', settings);

// Phase 50 (WHISPER-01, WHISPER-02) — Whisper pre-download bridge.
// Inlined channel strings to avoid shared chunk extraction (same pattern as VAD_THRESHOLD_CHANNEL).
const WHISPER_DOWNLOAD_MODEL_CHANNEL = 'whisper:download-model';
const WHISPER_DOWNLOAD_PROGRESS_CHANNEL = 'whisper:download-progress';

const whisper: WhisperApi = {
  downloadModel: (option) => ipcRenderer.invoke(WHISPER_DOWNLOAD_MODEL_CHANNEL, option),
  onDownloadProgress: (cb) => {
    const handler = (_event: unknown, payload: WhisperDownloadProgress) => cb(payload);
    ipcRenderer.on(WHISPER_DOWNLOAD_PROGRESS_CHANNEL, handler);
    return () => {
      ipcRenderer.removeListener(WHISPER_DOWNLOAD_PROGRESS_CHANNEL, handler);
    };
  },
};

contextBridge.exposeInMainWorld('whisper', whisper);
