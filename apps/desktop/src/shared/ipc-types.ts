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
// Voice Mode Types — Phase 39 (VMODE-02, VMODE-03)
// ============================================

/**
 * VoiceMode — os 3 modos de captura mutuamente exclusivos.
 * Persiste via electron-store (campo 'voiceMode').
 * Default implícito: 'wake-word' (D-07: migração v1.8 silenciosa).
 */
export type VoiceMode = 'wake-word' | 'always-listening' | 'ptt-only';

/**
 * VoiceModeChangeEvent — payload do EventEmitter 'voiceMode:change'.
 * D-05: payload rich para suportar audit log futuro e UX condicional.
 * D-08: reason='migration' NUNCA emitido no startup — só em trocas reais.
 */
export interface VoiceModeChangeEvent {
  oldMode: VoiceMode;
  newMode: VoiceMode;
  /** 'user' = troca manual via tray/API; 'system' = mudança programática interna */
  reason: 'user' | 'system';
  /** Unix timestamp ms — Date.now() */
  timestamp: number;
}

// ============================================
// Always-Listening Types — Phase 40 (VLISTEN-01, VLISTEN-02, VLISTEN-04)
// ============================================

/**
 * AlwaysListeningUtterancePayload — payload do IPC 'always-listening:utterance'.
 *
 * Enviado pelo renderer ao main quando o VAD detecta fim de fala E o classifier
 * aprova a utterance (D-04). O renderer captura áudio contínuo, segmenta com VAD,
 * e o pipeline de classifier (Phase 40-04/05) decide se vale enviar ao STT/LLM.
 *
 * Volume IPC bounded: WAV ~5–100KB por utterance de 0.5–10s @ 16kHz mono Int16LE
 * (encodeFloat32ToWav.ts). Picos de tráfego controlados pelo VAD silence threshold.
 */
export interface AlwaysListeningUtterancePayload {
  /** WAV-encoded buffer (16kHz mono Int16LE) — output de encodeFloat32ToWav.ts */
  wavBuffer: Uint8Array;
  /** Unix timestamp ms — quando o VAD disparou speech-end */
  timestamp: number;
}

/**
 * VoiceModeDegradedEvent — emitido quando Always-Listening falha ao iniciar (D-09, D-16).
 *
 * Consumer: Phase 41 tray (toast acionável "Voltar para Wake Word").
 * Main emite via EventEmitter interno + IPC broadcast para o renderer.
 *
 * Reason discriminado permite consumer mostrar mensagem específica:
 * - classifier-load-fail: ONNX session falhou ao instanciar
 * - classifier-download-fail: Hugging Face CDN inacessível, sem fallback
 * - timeout: classifier > 10s para classificar utterance (D-09)
 * - permission-denied: SO bloqueou acesso ao microfone
 */
export interface VoiceModeDegradedEvent {
  attemptedMode: VoiceMode;
  reason: 'classifier-load-fail' | 'classifier-download-fail' | 'timeout' | 'permission-denied';
  /** Mensagem pt-BR para exibir no toast (Phase 41) */
  message: string;
}

// ============================================
// Voice Mode Switch Result — Phase 41 (VUI-01)
// ============================================

/**
 * VoiceModeSwitchResult — payload do canal IPC 'voice-mode:switch-result'.
 *
 * D-02: Canal unificado para sucesso e bloqueio — renderer decide como renderizar.
 * D-05: Enviado em ambos os casos (success:true e success:false).
 *
 * Consumer: Phase 42 renderer (toast de confirmação).
 * Producer: apps/desktop/src/main/ipc/voiceMode.ts broadcastModeSwitch().
 */
export interface VoiceModeSwitchResult {
  /** true = modo trocado com sucesso; false = bloqueado (captura ativa ou transition em progresso) */
  success: boolean;
  /** Modo para o qual a troca ocorreu. Presente apenas quando success:true. */
  newMode?: VoiceMode;
  /** Label human-readable do novo modo. Presente apenas quando success:true. D-07: "Wake Word" | "Always-Listening" | "PTT-only" */
  label?: string;
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
  // Phase 39 — voice mode change broadcast (main → renderer)
  VOICE_MODE_CHANGE: 'voiceMode:change',
  // Phase 40 — Always-Listening channels (VLISTEN-01, VLISTEN-02, VLISTEN-04)
  /** main → renderer: instrui o engine de always-listening a iniciar captura */
  ALWAYS_LISTENING_START: 'always-listening:start',
  /** main → renderer: instrui o engine de always-listening a parar captura */
  ALWAYS_LISTENING_STOP: 'always-listening:stop',
  /** renderer → main: WAV pronto para STT (após VAD + classifier) */
  ALWAYS_LISTENING_UTTERANCE: 'always-listening:utterance',
  /** Settings → main → renderer: reconfigure VAD silence threshold em tempo real (UI-SPEC: real-time apply) */
  ALWAYS_LISTENING_VAD_THRESHOLD: 'always-listening:vad-threshold',
  /**
   * Phase 43 (VPTT-03): main → renderer — força fim imediato do utterance VAD.
   * Disparado quando user pressiona hotkey PTT em modo Always-Listening.
   * Renderer (hook futuro `useAlwaysListening`) decide se há samples > 0
   * antes de fechar a janela — strategy main-side só comanda.
   * Comportamento por estado (D-02): no-op silencioso em idle/processing/0-samples.
   */
  ALWAYS_LISTENING_FORCE_FLUSH: 'always-listening:force-flush',
  /** main → tray (Phase 41 consumer): always-listening falhou, modo degradado */
  VOICE_MODE_DEGRADED: 'voiceMode:degraded',
  // Phase 41 — resultado de troca de modo via tray (main → renderer)
  // D-02: canal unificado — payload { success, newMode?, label? }
  VOICE_MODE_SWITCH_RESULT: 'voice-mode:switch-result',
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
  // Phase 40 — VAD silence threshold (VLISTEN-04)
  // Range 300-800ms, default 500ms — populado pelo handler settings:get via getVadSilenceThresholdMs()
  vadSilenceThresholdMs: number;
}

export interface SaveSettingsRequest {
  pttHotkey?: string;
  ttsProvider?: TtsProviderOption;
  ttsApiKey?: string;
  whisperModelOverride?: WhisperModelOption;
  // NOTE Phase 40 (UI-SPEC): vadSilenceThresholdMs NÃO está aqui.
  // Aplicado em tempo real via IPC 'always-listening:vad-threshold' — sem botão "Save".
}

export interface SaveSettingsResponse {
  success: boolean;
  error?: string;
}

export interface SettingsApi {
  get: () => Promise<SettingsData>;
  save: (data: SaveSettingsRequest) => Promise<SaveSettingsResponse>;
  close: () => void;
  // Phase 40 (VLISTEN-04) — apply runtime do VAD silence threshold.
  // Sem botão "Save" — o slider aplica em tempo real via IPC round-trip.
  setVadThreshold: (
    ms: number,
  ) => Promise<{ success: boolean; clampedMs: number }>;
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
