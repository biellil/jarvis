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
// Wake Word IPC Types — Phase 22 Plan 02 (WAKE-05)
// ============================================

/**
 * Bytes dos 4 modelos ONNX do pipeline wake word. Retornados pelo handler
 * `wakeWord:load-models` no main (lidos via fs.readFile) e convertidos em
 * `ort.InferenceSession` pelo `modelLoader.ts` no renderer.
 *
 * Trip: a transferência atravessa o IPC como Uint8Array (~4 MB total) uma
 * única vez no boot — não há streaming por chunk.
 */
export interface WakeWordModelBytes {
  mel: Uint8Array;
  embed: Uint8Array;
  vad: Uint8Array;
  kw: Uint8Array;
}

/**
 * WakeWordApi — Phase 23 Plan 02
 *
 * Estendida com `getPaused` + `onPauseToggle` (D-06). Substitui a antiga
 * SettingsApi que ficava separada para um único booleano — agora tudo que
 * é sobre wake word vive debaixo do mesmo namespace.
 */
export interface WakeWordApi {
  loadModels: () => Promise<WakeWordModelBytes>;
  /** D-06: lê o valor persistido no electron-store no boot do renderer */
  getPaused: () => Promise<boolean>;
  /**
   * D-06: listener para o canal broadcastado pelo tray ao clicar
   * "Pause listening"/"Resume listening". Retorna função de unsubscribe —
   * chamar no unmount do hook.
   */
  onPauseToggle: (cb: (paused: boolean) => void) => () => void;
}

// ============================================
// Channel Names (type-safe channel registry)
// ============================================

export const IPC_CHANNELS = {
  CHAT_SEND_TEXT: 'chat:send-text',
  CHAT_SEND_AUDIO: 'chat:send-audio',
  HOTKEY_GET_STATUS: 'hotkey:get-status',
  SET_IGNORE_MOUSE: 'window:set-ignore-mouse',
  WAKE_WORD_LOAD_MODELS: 'wakeWord:load-models',
  // Phase 23 Plan 02 — D-06 pause/resume via tray
  WAKE_WORD_GET_PAUSED: 'wakeWord:get-paused',
  WAKE_WORD_PAUSE_TOGGLE: 'wakeWord:pause-toggle',
  // Phase 25 ORB-POL-05 — drag-to-reposition
  WINDOW_MOVE: 'window:move',
  WINDOW_SAVE_ORB_POSITION: 'window:save-orb-position',
  // Phase 34 Settings window
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  SETTINGS_CLOSE: 'settings:close',
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

// ============================================
// PTT Event Types
// ============================================

// Phase 22 Plan 01 (WAKE-07): payload é literal 'toggle' — o renderer consulta
// o VoiceInputManager para decidir se deve start ou stop a gravação.
export type PttAction = 'toggle';

// ============================================
// Settings IPC Types — Phase 34
// ============================================

export type WhisperModelOption = 'auto' | 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo';
export type TtsProviderOption = 'murf' | 'elevenlabs';

export interface SettingsData {
  pttHotkey: string;
  ttsProvider: TtsProviderOption;
  ttsApiKey: string;
  whisperModelOverride: WhisperModelOption;
}

export interface SaveSettingsRequest {
  pttHotkey?: string;
  ttsProvider?: TtsProviderOption;
  ttsApiKey?: string;
  whisperModelOverride?: WhisperModelOption;
}

export interface SaveSettingsResponse {
  success: boolean;
  error?: string;
}

export interface SettingsApi {
  get: () => Promise<SettingsData>;
  save: (data: SaveSettingsRequest) => Promise<SaveSettingsResponse>;
  close: () => void;
}

// ============================================
// Jarvis API (exposed via contextBridge)
// ============================================

export interface JarvisAPI {
  sendText: (message: string) => Promise<SendTextResponse>;
  sendAudio: (audioBuffer: Uint8Array) => Promise<SendAudioResponse>;
  getHotkeyStatus: () => Promise<GetHotkeyStatusResponse>;
  setIgnoreMouseEvents: (ignore: boolean) => void;
  // Phase 25 ORB-POL-05 — arrastar orb e persistir posição
  moveWindow: (dx: number, dy: number) => void;
  saveOrbPosition: () => void;

  // Phase 22 Plan 02 + Phase 23 Plan 02: wake word model loader + pause bridge
  wakeWord: WakeWordApi;

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
    settings: SettingsApi;  // Settings window only — exposed via settings preload
  }
}

// Ensure this file is treated as a module
export {};
