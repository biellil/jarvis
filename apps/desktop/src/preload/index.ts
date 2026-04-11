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
  type WakeWordModelBytes,
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
   * Phase 19.5: WebM/Opus bytes pro gateway /api/chat/audio
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

  /**
   * Toggle click-through for transparent window areas
   * ignore=true: transparent areas pass clicks to desktop
   * ignore=false: window captures mouse events (for dragging)
   */
  setIgnoreMouseEvents: (ignore: boolean): void => {
    ipcRenderer.send(IPC_CHANNELS.SET_IGNORE_MOUSE, ignore);
  },

  /**
   * Phase 22 Plan 02 (WAKE-05): wake word model loader bridge.
   * Main lê os 4 arquivos .onnx via fs.readFile e retorna Uint8Arrays.
   * Renderer usa ort.InferenceSession.create() para hidratar as sessions.
   */
  wakeWord: {
    loadModels: (): Promise<WakeWordModelBytes> =>
      ipcRenderer.invoke(IPC_CHANNELS.WAKE_WORD_LOAD_MODELS),
  },

  /**
   * Phase 23 Plan 01: Settings API
   */
  settings: {
    getWakeWordEnabled: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.GET_WAKE_WORD_ENABLED),
    setWakeWordEnabled: (enabled: boolean): void => {
      ipcRenderer.send(IPC_CHANNELS.SET_WAKE_WORD_ENABLED, enabled);
    },
  },

  /**
   * Event listener interface for PTT events
   * Phase 13, Plan 04: PTT hotkey integration
   */
  ipcRenderer: {
    on: (channel: string, callback: (event: any, ...args: any[]) => void) => {
      ipcRenderer.on(channel, callback);
    },
    off: (channel: string, callback: (event: any, ...args: any[]) => void) => {
      ipcRenderer.removeListener(channel, callback);
    },
  },
};

// Expose typed API to renderer as window.jarvis
contextBridge.exposeInMainWorld('jarvis', api);

console.log('[preload] JARVIS API exposed to renderer');
