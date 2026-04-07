/**
 * Preload Script - Bridge between main and renderer
 *
 * SECURITY: This is the ONLY way renderer can communicate with main.
 * - contextBridge.exposeInMainWorld creates a safe API surface
 * - ipcRenderer is NOT exposed directly (security violation)
 * - TypeScript types from shared/ipc-types.ts ensure type safety
 */
import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type JarvisAPI,
  type SendTextResponse,
  type SendAudioResponse,
} from '../shared/ipc-types';

const api: JarvisAPI = {
  /**
   * Send text message to main process
   * D-04: Proves IPC end-to-end without gateway integration
   */
  sendText: (message: string): Promise<SendTextResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND_TEXT, message);
  },

  /**
   * Send audio buffer to main process
   * Phase 13, Plan 03: Audio recording with WAV conversion
   */
  sendAudio: (audioBuffer: Uint8Array): Promise<SendAudioResponse> => {
    // Convert Uint8Array to Buffer for IPC transfer
    return ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND_AUDIO, Buffer.from(audioBuffer));
  },

  /**
   * Get hotkey registration status
   */
  getHotkeyStatus: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.HOTKEY_GET_STATUS);
  },
};

// Expose typed API to renderer as window.jarvis
contextBridge.exposeInMainWorld('jarvis', api);

console.log('[preload] JARVIS API exposed to renderer');
