/**
 * IPC Types - Shared between main, preload, and renderer
 *
 * D-02: Types centralized here, imported by all processes
 * D-03: Handlers return Result type, never throw
 */

// ============================================
// Result Type Pattern (D-03)
// ============================================

export interface IpcResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================
// Chat IPC Types
// ============================================

export interface SendTextRequest {
  message: string;
}

export interface SendTextData {
  reply: string;
}

export type SendTextResponse = IpcResult<SendTextData>;

export interface SendAudioData {
  transcription: string;
  message: string;
  audioBase64: string;
  audioFormat: 'mp3' | 'wav';
  sttProvider: string;
  ttsProvider: string;
}

export interface SendAudioError {
  code: string;
  message: string;
}

export type SendAudioResponse =
  | { success: true; data: SendAudioData }
  | { success: false; error: SendAudioError };

// ============================================
// Hotkey IPC Types
// ============================================

export interface HotkeyStatus {
  accelerator: string;
  registered: boolean;
}

export type GetHotkeyStatusResponse = IpcResult<HotkeyStatus>;

// ============================================
// Channel Names (type-safe channel registry)
// ============================================

export const IPC_CHANNELS = {
  CHAT_SEND_TEXT: 'chat:send-text',
  CHAT_SEND_AUDIO: 'chat:send-audio',
  HOTKEY_GET_STATUS: 'hotkey:get-status',
  SET_IGNORE_MOUSE: 'window:set-ignore-mouse',
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

// ============================================
// PTT Event Types
// ============================================

// Phase 22 Plan 01 (WAKE-07): payload é literal 'toggle' — o renderer consulta
// o VoiceInputManager para decidir se deve start ou stop a gravação.
export type PttAction = 'toggle';

// ============================================
// Jarvis API (exposed via contextBridge)
// ============================================

export interface JarvisAPI {
  sendText: (message: string) => Promise<SendTextResponse>;
  sendAudio: (audioBuffer: Uint8Array) => Promise<SendAudioResponse>;
  getHotkeyStatus: () => Promise<GetHotkeyStatusResponse>;
  setIgnoreMouseEvents: (ignore: boolean) => void;

  // Event listener interface for renderer
  ipcRenderer?: {
    on: (channel: string, callback: (event: any, ...args: any[]) => void) => void;
    off: (channel: string, callback: (event: any, ...args: any[]) => void) => void;
  };
}

// ============================================
// Window augmentation for TypeScript
// ============================================

declare global {
  interface Window {
    jarvis: JarvisAPI;
  }
}

// Ensure this file is treated as a module
export {};
