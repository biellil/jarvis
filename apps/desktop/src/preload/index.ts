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
  type TTSChunkPayload,
  type TTSEndPayload,
  type TTSStopPayload,
  type VoiceMode,
  type VoiceModeChangeEvent,
  type WakeWordModelBytes,
  type ActionRequestPayload,
  type ActionAckStatus,
  type ActionAckPayload,
  type ActionExecutePayload,
  type ActionExecuteResult,
  type CaptureScreenResult,
  type SendImageRequest,
  type VisionScreenshotPayload,
  type ResumeRequestBody,
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

  // Phase 25 ORB-POL-05 — drag orb
  moveWindow: (dx: number, dy: number): void => {
    ipcRenderer.send(IPC_CHANNELS.WINDOW_MOVE, dx, dy);
  },
  saveOrbPosition: (): void => {
    ipcRenderer.send(IPC_CHANNELS.WINDOW_SAVE_ORB_POSITION);
  },

  /**
   * Phase 22 Plan 02 (WAKE-05) + Phase 23 Plan 02 (D-06):
   * - loadModels: lê os 4 .onnx via fs.readFile e retorna Uint8Arrays
   * - getPaused: lê o estado persistido no electron-store no boot do renderer
   * - onPauseToggle: listener do broadcast do tray "Pause/Resume listening"
   */
  wakeWord: {
    loadModels: (): Promise<WakeWordModelBytes> =>
      ipcRenderer.invoke(IPC_CHANNELS.WAKE_WORD_LOAD_MODELS),
    getPaused: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.WAKE_WORD_GET_PAUSED),
    onPauseToggle: (cb: (paused: boolean) => void) => {
      const handler = (_event: unknown, paused: boolean) => cb(paused);
      ipcRenderer.on(IPC_CHANNELS.WAKE_WORD_PAUSE_TOGGLE, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.WAKE_WORD_PAUSE_TOGGLE, handler);
      };
    },
  },

  /**
   * Quick 260427-qzg: voice mode bridge.
   * - getMode: lê modo ativo do VoiceModeManager (null em estado degradado).
   * - onChange: ouve broadcasts de mudança de modo (main → renderer) para
   *   App.tsx desmontar/remontar useWakeWord/useMultiTurnWindow conforme o
   *   usuário troca o modo via tray, sem reload da janela.
   */
  voiceMode: {
    getMode: (): Promise<VoiceMode | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.VOICE_MODE_GET),
    onChange: (cb: (event: VoiceModeChangeEvent) => void) => {
      const handler = (_event: unknown, payload: VoiceModeChangeEvent) => cb(payload);
      ipcRenderer.on(IPC_CHANNELS.VOICE_MODE_CHANGE, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.VOICE_MODE_CHANGE, handler);
      };
    },
  },

  /**
   * Phase 44 (VHARD-01, D-04): abre System Settings via main process.
   * Renderer sandbox não pode chamar shell.openExternal() diretamente.
   * Main process tem URL hardcoded — renderer não controla qual URL é aberta.
   */
  openSystemSettings: (): void => {
    ipcRenderer.send(IPC_CHANNELS.SHELL_OPEN_SYSTEM_SETTINGS);
  },

  /**
   * Phase 53 Plan 02 (STTS-01): streaming TTS chunk listeners.
   * Uses IPC_CHANNELS.TTS_* constants from Plan 01.
   */
  streamingTts: {
    onChunk: (cb: (payload: TTSChunkPayload) => void) => {
      const handler = (_event: unknown, payload: TTSChunkPayload): void => cb(payload);
      ipcRenderer.on(IPC_CHANNELS.TTS_CHUNK, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.TTS_CHUNK, handler);
      };
    },
    onEnd: (cb: (payload: TTSEndPayload) => void) => {
      const handler = (_event: unknown, payload: TTSEndPayload): void => cb(payload);
      ipcRenderer.on(IPC_CHANNELS.TTS_END, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.TTS_END, handler);
      };
    },
    onStop: (cb: (payload: TTSStopPayload) => void) => {
      const handler = (_event: unknown, payload: TTSStopPayload): void => cb(payload);
      ipcRenderer.on(IPC_CHANNELS.TTS_STOP, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.TTS_STOP, handler);
      };
    },
  },

  /**
   * Phase 54 Plan 04 (LACT-06): LLM file action confirmation channel.
   * - onRequest: subscribes to ACTION_REQUEST from main (gateway → Electron → renderer)
   * - sendAck: sends confirmed/denied/timeout ACK back to main (→ gateway)
   */
  actions: {
    onRequest: (cb: (payload: ActionRequestPayload) => void) => {
      const handler = (_event: unknown, payload: ActionRequestPayload): void => cb(payload);
      ipcRenderer.on(IPC_CHANNELS.ACTION_REQUEST, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.ACTION_REQUEST, handler);
    },
    sendAck: (requestId: string, status: ActionAckStatus, content?: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.ACTION_ACK, { requestId, status, content } as ActionAckPayload),
    /**
     * Phase 55 (LACT-01..05): Execute OS action after user confirms toast (D-12).
     * Main runs the OS operation (openPath/kill/readFile) and returns the result.
     */
    execute: (payload: ActionExecutePayload): Promise<ActionExecuteResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.ACTION_EXECUTE, payload),
    /**
     * Alias for execute() — Phase 55 plan-spec compatible name.
     * @alias execute
     */
    executeAction: (payload: ActionExecutePayload): Promise<ActionExecuteResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.ACTION_EXECUTE, payload),
  },

  /**
   * Phase 63 Vision Pipeline (VISION-02, VISION-03):
   * - captureScreen: invoke CAPTURE_SCREEN IPC handler in main
   * - sendImage: send message + image via CHAT_SEND_IMAGE
   * - onScreenshotCaptured: listen for VISION_SCREENSHOT_CAPTURED (hotkey path)
   */
  vision: {
    captureScreen: (): Promise<CaptureScreenResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.CAPTURE_SCREEN),
    sendImage: (req: SendImageRequest): Promise<SendTextResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND_IMAGE, req),
    onScreenshotCaptured: (cb: (payload: VisionScreenshotPayload) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: VisionScreenshotPayload) => cb(payload);
      ipcRenderer.on(IPC_CHANNELS.VISION_SCREENSHOT_CAPTURED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.VISION_SCREENSHOT_CAPTURED, listener);
    },
  },

  /**
   * Phase 66 (AGENT-02/03/04): Agentic task IPC bridge.
   * resumeTask/cancelTask proxy to backend HTTP endpoints via main process.
   * getBackendUrl returns { url, bearer } for renderer to open SSE via fetch.
   */
  tasks: {
    resumeTask: (taskId: string, body: ResumeRequestBody) =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_RESUME, taskId, body),
    cancelTask: (taskId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_CANCEL, taskId),
    getBackendUrl: () =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_GET_BACKEND_URL),
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
