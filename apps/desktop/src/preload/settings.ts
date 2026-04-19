import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type SettingsApi } from '../shared/ipc-types';

const settings: SettingsApi = {
  get: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  save: (data) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE, data),
  close: () => ipcRenderer.send(IPC_CHANNELS.SETTINGS_CLOSE),
};

contextBridge.exposeInMainWorld('settings', settings);
