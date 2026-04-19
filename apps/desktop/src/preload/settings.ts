import { contextBridge, ipcRenderer } from 'electron';
import type { SettingsApi } from '../shared/ipc-types';

const settings: SettingsApi = {
  get: () => ipcRenderer.invoke('settings:get'),
  save: (data) => ipcRenderer.invoke('settings:save', data),
  close: () => ipcRenderer.send('settings:close'),
};

contextBridge.exposeInMainWorld('settings', settings);
