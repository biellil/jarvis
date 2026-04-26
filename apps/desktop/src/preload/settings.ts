import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type SettingsApi } from '../shared/ipc-types';

const settings: SettingsApi = {
  get: () => ipcRenderer.invoke('settings:get'),
  save: (data) => ipcRenderer.invoke('settings:save', data),
  close: () => ipcRenderer.send('settings:close'),
  // Phase 40 (VLISTEN-04) — runtime apply do VAD silence threshold.
  // Boundary IPC clampa [300, 800]ms (T-40-VAD); o backend retorna o valor
  // efetivamente aplicado em clampedMs.
  setVadThreshold: (ms: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD, ms),
};

contextBridge.exposeInMainWorld('settings', settings);
