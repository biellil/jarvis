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

/**
 * VoiceModeApi — Quick 260427-qzg
 *
 * Permite ao renderer ler o voice mode ativo e reagir a mudanças via tray
 * sem reload. Usado por App.tsx para gatear hooks de wake word/multi-turn
 * — em ptt-only/always-listening, esses hooks nunca rodam.
 */
export interface VoiceModeApi {
  /** Lê o modo ativo do VoiceModeManager via ipcRenderer.invoke. Retorna null em estado degradado. */
  getMode: () => Promise<VoiceMode | null>;
  /**
   * Listener para o canal `voiceMode:change` broadcastado pelo main após
   * cada `setMode()` bem-sucedido. Retorna função de unsubscribe — chamar
   * no unmount do hook.
   */
  onChange: (cb: (event: VoiceModeChangeEvent) => void) => () => void;
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
  /** D-03 (Phase 44 VHARD-01): Reason for blocking. Presente apenas quando success:false. */
  blockedReason?: 'mic-permission-denied';
  /** D-03 (Phase 44 VHARD-01): Deep link URL para System Settings (macOS). Presente apenas quando success:false. */
  settingsUrl?: string;
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
  // Quick 260427-qzg — renderer → main: lê o modo atual do VoiceModeManager
  // para gatear hooks (useWakeWord/useMultiTurnWindow) só em mode 'wake-word'.
  VOICE_MODE_GET: 'voiceMode:get',
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
  // Phase 44 (VHARD-01): renderer → main — abre System Settings via shell.openExternal()
  SHELL_OPEN_SYSTEM_SETTINGS: 'shell:open-system-settings',
  // Phase 50 — Whisper pre-download (WHISPER-01, WHISPER-02)
  /** renderer → main: trigger immediate Whisper model download (or cache-hit check) */
  WHISPER_DOWNLOAD_MODEL: 'whisper:download-model',
  /** main → renderer: broadcast download progress events */
  WHISPER_DOWNLOAD_PROGRESS: 'whisper:download-progress',
  // Phase 52 — Settings Extras (SEXT-01, SEXT-02, SEXT-03)
  /** renderer → main: set LM Studio base URL, validated and persisted */
  LM_STUDIO_SET_URL: 'lm-studio:set-url',
  /** renderer → main: set active LLM provider (after optional token warning) */
  LLM_SET_PROVIDER: 'llm:set-provider',
  /** renderer → main: set wake word classifier threshold (0.0–1.0), applied in real-time */
  WAKE_WORD_SET_THRESHOLD: 'wakeWord:set-threshold',
  /** main → renderer: wake word threshold changed (for engine reconfig) */
  WAKE_WORD_THRESHOLD_CHANGED: 'wakeWord:threshold-changed',
  // Phase 53 — Streaming TTS (STTS-01, STTS-02)
  /** main → renderer: per-sentence TTS audio chunk (base64-encoded mp3/wav) */
  TTS_CHUNK: 'tts:chunk',
  /** main → renderer: streaming turn finished (all chunks flushed/synthesized) */
  TTS_END: 'tts:end',
  /** renderer → main (or main → renderer): abort/barge-in for current turn */
  TTS_STOP: 'tts:stop',
  /** renderer → main: enable/disable streaming TTS (default false, D-10) */
  STREAMING_TTS_SET: 'streamingTts:set',
  /** main → renderer: streaming TTS flag changed (multi-window sync) */
  STREAMING_TTS_CHANGED: 'streamingTts:changed',
  // Phase 60 — LM Studio Streaming Events feature flag (LLM-PROV-02)
  /** renderer → main: enable/disable LM Studio native streaming events */
  STREAMING_LM_STUDIO_EVENTS_SET: 'streamingLMStudioEvents:set',
  /** main → renderer: LM Studio streaming events flag changed (multi-window sync) */
  STREAMING_LM_STUDIO_EVENTS_CHANGED: 'streamingLMStudioEvents:changed',
  // Phase 57 — Live LLM reload (LLM-PROV-01)
  /** renderer → main: reload LLM with new provider + API keys, no restart */
  RELOAD_LLM: 'llm:reload',
  // Phase 54 — LLM Actions channel (LACT-06, LACT-09)
  /** main → renderer: gateway sent action request; renderer shows confirmation toast */
  ACTION_REQUEST: 'actions:request',
  /** renderer → main: user responded (confirmed/denied) or timeout; main forwards ACK to gateway */
  ACTION_ACK: 'actions:ack',
  // Phase 55 — LLM Actions execution (LACT-01..05)
  /** renderer → main: execute OS action after user confirmation; returns ActionExecuteResult */
  ACTION_EXECUTE: 'actions:execute',
  // Phase 56 — Diagnostics (QA-01)
  /** renderer → main: return count of active AudioContext instances (should always be 1) */
  DIAGNOSTICS_GET_AUDIO_CONTEXT_COUNT: 'diagnostics:get-audio-context-count',
  // Phase 62 — Kokoro offline TTS (TTS-OFF-01, TTS-OFF-04)
  /** renderer → main: trigger Kokoro model download (or cache-hit check) */
  KOKORO_DOWNLOAD_MODEL: 'kokoro:download-model',
  /** main → renderer: broadcast Kokoro download progress events */
  KOKORO_DOWNLOAD_PROGRESS: 'kokoro:download-progress',
  /** renderer → main: cancel in-flight Kokoro model download */
  KOKORO_CANCEL_DOWNLOAD: 'kokoro:cancel-download',
  /** renderer → main: check if Kokoro model is already cached */
  KOKORO_CHECK_CACHED: 'kokoro:check-cached',
  // Phase 63 — Vision Pipeline (VISION-01, VISION-02, VISION-03)
  /** main handles: captures screen via desktopCapturer + sharp, returns base64 JPEG data URL */
  CAPTURE_SCREEN: 'vision:capture-screen',
  /** renderer → main → backend: send message + attached image base64 data URL */
  CHAT_SEND_IMAGE: 'chat:send-image',
  /** main → renderer: hotkey path — screenshot captured, populate pendingImage in chat input */
  VISION_SCREENSHOT_CAPTURED: 'vision:screenshot-captured',
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

// ============================================
// Whisper Download IPC Types — Phase 50 (WHISPER-01, WHISPER-02)
// ============================================

/**
 * WhisperDownloadProgress — payload of 'whisper:download-progress' broadcast.
 * Emitted by main → renderer as download proceeds.
 * status='success' emitted on cache-hit (instant) OR after 100% download.
 * status='error' includes errorMessage.
 */
export interface WhisperDownloadProgress {
  model: string;                                           // resolved WhisperModel name
  status: 'downloading' | 'success' | 'error';
  percent: number;                                         // 0-100
  downloadedBytes: number;
  totalBytes: number;
  errorMessage?: string;                                   // present only when status='error'
}

/**
 * WhisperApi — exposed via window.whisper in settings preload.
 * downloadModel: renderer → main invoke (fire-and-forget; progress via onDownloadProgress).
 * onDownloadProgress: registers listener for 'whisper:download-progress' broadcasts.
 */
export interface WhisperApi {
  downloadModel: (option: WhisperModelOption) => Promise<void>;
  onDownloadProgress: (cb: (payload: WhisperDownloadProgress) => void) => () => void;
}

// Phase 62 — extended with 'kokoro' (TTS-OFF-01, D-13)
export type TtsProviderOption = 'murf' | 'elevenlabs' | 'kokoro';

// Phase 52 — LLM provider union (SEXT-02); Phase 57 adds 'gemini' (LLM-PROV-01)
export type LlmProvider = 'lmstudio' | 'openai' | 'anthropic' | 'gemini';

// Phase 57 — LLM reload request (LLM-PROV-01)
export interface ReloadLlmRequest {
  provider: LlmProvider;
  lmStudioUrl?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
  llmModel?: string;
}

export interface SettingsData {
  pttHotkey: string;
  ttsProvider: TtsProviderOption;
  ttsApiKey: string;
  whisperModelOverride: WhisperModelOption;
  // Phase 40 — VAD silence threshold (VLISTEN-04)
  // Range 300-800ms, default 500ms — populado pelo handler settings:get via getVadSilenceThresholdMs()
  vadSilenceThresholdMs: number;
  // QUICK-260427-tjc: per-provider voice ID. Empty string = use provider's hardcoded default.
  ttsVoiceIds: Record<TtsProviderOption, string>;
  // Phase 52 — Settings Extras
  /** LM Studio base URL persisted by user. Default: 'http://localhost:1234/v1' */
  lmStudioUrl: string;
  /** Active LLM provider key. */
  llmProvider: LlmProvider;
  /** Wake word classifier threshold (0.0–1.0). Default: 0.5 */
  wakeWordThreshold: number;
  // Phase 53 — Streaming TTS feature flag (STTS-02)
  /** Streaming TTS enabled flag. Default: false (D-10). */
  streamingTtsEnabled: boolean;
  // Phase 60 — LM Studio Streaming Events feature flag (LLM-PROV-02)
  /** LM Studio native streaming events enabled. Default: false (D-03). */
  streamingLMStudioEventsEnabled: boolean;
  // Phase 57 — Cloud provider API keys (LLM-PROV-01)
  /** Persisted OPENAI_API_KEY from electron-store. Empty string if not set. */
  openaiApiKey: string;
  /** Persisted ANTHROPIC_API_KEY from electron-store. Empty string if not set. */
  anthropicApiKey: string;
  /** Persisted GEMINI_API_KEY from electron-store. Empty string if not set. */
  geminiApiKey: string;
  // Phase 62 — Kokoro offline TTS (TTS-OFF-05, D-06)
  /** When true, Kokoro TTS never falls back to cloud providers. Default: false. */
  kokoroLocalOnly: boolean;
  /** Whether Kokoro ONNX model is already cached on disk. */
  kokoroModelCached: boolean;
  // Phase 63 — Screenshot hotkey (VISION-03, D-07)
  /** Global screenshot hotkey accelerator. Default: 'CmdOrCtrl+Shift+S'. */
  screenshotHotkey: string;
}

export interface SaveSettingsRequest {
  pttHotkey?: string;
  ttsProvider?: TtsProviderOption;
  ttsApiKey?: string;
  whisperModelOverride?: WhisperModelOption;
  // NOTE Phase 40 (UI-SPEC): vadSilenceThresholdMs NÃO está aqui.
  // Aplicado em tempo real via IPC 'always-listening:vad-threshold' — sem botão "Save".
  // QUICK-260427-tjc: per-provider voice ID. Empty string = use provider's hardcoded default.
  ttsVoiceIds?: Partial<Record<TtsProviderOption, string>>;
  // NOTE Phase 52: lmStudioUrl, llmProvider, wakeWordThreshold are NOT here.
  // Applied in real-time via dedicated IPC channels (apply-without-restart pattern).
  // Phase 62 — Kokoro local-only flag (TTS-OFF-05, D-06)
  // Included here (not in apply-without-restart) because it requires TTS reinit.
  kokoroLocalOnly?: boolean;
  // Phase 63 — Screenshot hotkey (VISION-03, D-07)
  screenshotHotkey?: string;
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
  // Phase 52 — Settings Extras (SEXT-01, SEXT-02, SEXT-03)
  /** Apply LM Studio base URL without restart. Returns normalized URL or error. */
  setLmStudioUrl: (url: string) => Promise<{ success: boolean; appliedUrl?: string; error?: string }>;
  /** Apply active LLM provider without restart. */
  setLlmProvider: (provider: LlmProvider) => Promise<{ success: boolean; error?: string }>;
  /** Apply wake word classifier threshold (0.0–1.0) without restart. Returns clamped value. */
  setWakeWordThreshold: (threshold: number) => Promise<{ success: boolean; clampedThreshold: number }>;
  // Phase 53 — Streaming TTS feature flag (STTS-02)
  /** Toggle streaming TTS (default false, D-10). Live-flips per turn (D-11). */
  setStreamingTts: (enabled: boolean) => Promise<{ success: boolean }>;
  /** Subscribe to streaming TTS flag changes (multi-window sync). Returns unsubscribe. */
  onStreamingTtsChanged: (cb: (enabled: boolean) => void) => () => void;
  // Phase 60 — LM Studio Streaming Events feature flag (LLM-PROV-02)
  /** Toggle LM Studio native streaming events (default false, D-03). Triggers backend reload. */
  setStreamingLMStudioEvents: (enabled: boolean) => Promise<{ success: boolean }>;
  /** Subscribe to streaming events flag changes (multi-window sync). Returns unsubscribe fn. */
  onStreamingLMStudioEventsChanged: (cb: (enabled: boolean) => void) => () => void;
  // Phase 57 — Live LLM reload (LLM-PROV-01)
  /** Reload LLM with new provider and API keys without restart. */
  reloadLlm: (req: ReloadLlmRequest) => Promise<{ success: boolean; error?: string }>;
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

  // Quick 260427-qzg: voice mode bridge (read + change subscription)
  voiceMode: VoiceModeApi;

  // Phase 44 (VHARD-01, D-04): abre System Settings do macOS (sandbox-safe)
  // Renderer sandbox não pode chamar shell.openExternal() diretamente.
  openSystemSettings?: () => void;

  // Phase 53 Plan 02 (STTS-01): streaming TTS chunk listeners.
  streamingTts?: {
    onChunk: (cb: (payload: TTSChunkPayload) => void) => () => void;
    onEnd: (cb: (payload: TTSEndPayload) => void) => () => void;
    onStop: (cb: (payload: TTSStopPayload) => void) => () => void;
  };

  // Phase 54 Plan 04 (LACT-06): LLM file action confirmation channel.
  // Phase 55 (LACT-01..05): extended with execute() for OS action dispatch.
  actions?: {
    /** Subscribe to action_request from gateway. Returns unsubscribe fn. */
    onRequest: (cb: (payload: ActionRequestPayload) => void) => () => void;
    /** Send ACK to main (confirmed/denied/timeout). content is passed for viewContent actions (D-01). */
    sendAck: (requestId: string, status: ActionAckStatus, content?: string) => Promise<{ success: boolean; error?: string }>;
    /**
     * Execute OS action after user confirms toast (Phase 55, D-12).
     * Main process runs the OS operation and returns the result.
     * For viewContent, result.content contains the file text.
     */
    execute: (payload: ActionExecutePayload) => Promise<ActionExecuteResult>;
    /**
     * Alias for execute() — Phase 55 plan-spec compatible name.
     * @alias execute
     */
    executeAction: (payload: ExecuteActionPayload) => Promise<ExecuteActionResult>;
  };

  // Phase 63 — Vision Pipeline (VISION-01, VISION-02, VISION-03)
  vision?: {
    /** Capture screen via desktopCapturer in main process. Returns full data URL. */
    captureScreen: () => Promise<CaptureScreenResult>;
    /** Send message + image together via CHAT_SEND_IMAGE. */
    sendImage: (req: SendImageRequest) => Promise<SendTextResponse>;
    /** Subscribe to hotkey-triggered screenshot events (main → renderer). Returns unsubscribe fn. */
    onScreenshotCaptured: (cb: (payload: VisionScreenshotPayload) => void) => () => void;
  };

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
    whisper: WhisperApi;    // Settings window only — exposed via settings preload
    kokoro: KokoroApi;      // Settings window only — exposed via settings preload (Phase 62)
  }
}

// ============================================
// Streaming TTS Types — Phase 53 (STTS-01, STTS-02)
// ============================================

/**
 * TTSChunkPayload — emitted by main → renderer for each sentence-level
 * TTS audio chunk during a streaming turn. `idx` is monotonically increasing
 * starting at 0 and represents assignment order from the SentenceChunker
 * (NOT synthesis-completion order — the renderer queue is responsible for
 * ordered playback).
 *
 * `isLast` is reserved for future use (Plan 02/04 may flip the final chunk's
 * flag); current emitter sets it to false on every chunk and signals
 * completion via the separate TTS_END channel.
 */
export interface TTSChunkPayload {
  turnId: string;
  idx: number;
  audioBase64: string;
  format: 'mp3' | 'wav';
  isLast: boolean;
}

/** TTS_END payload — turn finished, no more chunks coming for this turnId. */
export interface TTSEndPayload {
  turnId: string;
}

/** TTS_STOP payload — barge-in / abort signal for a specific turn. */
export interface TTSStopPayload {
  turnId: string;
}

// ============================================
// LLM Actions Types — Phase 54 (LACT-06, LACT-09)
// ============================================

export type FileAction = 'openFolder' | 'openFile' | 'closeFile' | 'viewContent' | 'deleteFile' | 'moveFile' | 'renameFile';
export type ActionAckStatus = 'confirmed' | 'denied' | 'timeout';

/** Payload of ACTION_REQUEST broadcast (main → renderer) */
export interface ActionRequestPayload {
  requestId: string;
  action: FileAction;
  path: string;
  model: string;
}

/** Payload of ACTION_ACK invoke (renderer → main) */
export interface ActionAckPayload {
  requestId: string;
  status: ActionAckStatus;
  /** File content for viewContent actions (D-01). Only set when status='confirmed' and action='viewContent'. */
  content?: string;
}

// ============================================
// LLM Actions — Execution Types — Phase 55 (LACT-01..05)
// ============================================

/**
 * ActionExecutePayload — renderer → main (actions:execute)
 * Sent after user confirms the toast; main executes the OS action.
 */
export interface ActionExecutePayload {
  requestId: string;
  action: FileAction;
  /** For openFolder/openFile: absolute path. For closeFile: process name (D-07). For moveFile: destination path is encoded as 'src::dest' within the path field. */
  path: string;
}

/**
 * ActionExecuteResult — return value of actions:execute invoke.
 * content is populated only for viewContent + success (D-01).
 */
export interface ActionExecuteResult {
  success: boolean;
  /** File text content — only present when action=viewContent and success=true */
  content?: string;
  error?: string;
}

/** @alias ActionExecutePayload — Phase 55 plan-spec compatible alias */
export type ExecuteActionPayload = ActionExecutePayload;

/** @alias ActionExecuteResult — Phase 55 plan-spec compatible alias */
export type ExecuteActionResult = ActionExecuteResult;

// ============================================
// Kokoro Download Types — Phase 62 (TTS-OFF-01, TTS-OFF-04)
// ============================================

/**
 * KokoroDownloadProgress — payload of 'kokoro:download-progress' broadcast.
 * Mirrors WhisperDownloadProgress (Phase 50) — same progress bar pattern.
 */
export interface KokoroDownloadProgress {
  status: 'downloading' | 'success' | 'error';
  percent: number;                   // 0-100
  downloadedMb: number;
  totalMb: number;
  errorMessage?: string;             // present only when status='error'
}

/**
 * KokoroApi — exposed via window.kokoro in settings preload.
 * downloadModel: renderer → main invoke (fire-and-forget; progress via onDownloadProgress).
 * cancelDownload: renderer → main invoke (aborts in-flight download).
 * checkCached: renderer → main invoke (returns true if model already on disk).
 * onDownloadProgress: registers listener for 'kokoro:download-progress' broadcasts.
 */
export interface KokoroApi {
  downloadModel: () => Promise<void>;
  cancelDownload: () => Promise<void>;
  checkCached: () => Promise<boolean>;
  onDownloadProgress: (cb: (payload: KokoroDownloadProgress) => void) => () => void;
}

// ============================================
// Vision Pipeline Types — Phase 63 (VISION-01, VISION-02, VISION-03)
// ============================================

/**
 * CaptureScreenResult — return value of CAPTURE_SCREEN IPC handler.
 * base64 is a full data URL: "data:image/jpeg;base64,..."
 */
export type CaptureScreenResult =
  | { success: true; base64: string }
  | { success: false; error: 'PERMISSION_DENIED' | string };

/**
 * SendImageRequest — payload of CHAT_SEND_IMAGE invoke (renderer → main).
 * imageBase64 is a full data URL: "data:image/jpeg;base64,..."
 */
export interface SendImageRequest {
  message: string;
  imageBase64: string;
}

/**
 * VisionScreenshotPayload — payload of VISION_SCREENSHOT_CAPTURED broadcast (main → renderer).
 * Sent by screenshot-hotkey.ts after capture; base64 is null on permission denied or error.
 */
export interface VisionScreenshotPayload {
  base64: string | null; // full data URL on success; null on failure
  error?: string; // set when base64 is null (e.g. 'PERMISSION_DENIED')
}

// Ensure this file is treated as a module
export {};
