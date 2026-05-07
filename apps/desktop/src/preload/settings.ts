import { contextBridge, ipcRenderer } from 'electron';
import type { SettingsApi, WhisperApi, WhisperDownloadProgress, KokoroApi, KokoroDownloadProgress } from '../shared/ipc-types';

// Inlined to avoid shared chunk extraction in preload bundle (Electron sandbox
// preloadRequire can't load Rollup chunk files). Must match IPC_CHANNELS in shared/ipc-types.ts.
const VAD_THRESHOLD_CHANNEL = 'always-listening:vad-threshold';
// Phase 52 — Settings Extras (SEXT-01, SEXT-02, SEXT-03)
const LM_STUDIO_SET_URL_CHANNEL = 'lm-studio:set-url';
const LLM_SET_PROVIDER_CHANNEL = 'llm:set-provider';
const WAKE_WORD_SET_THRESHOLD_CHANNEL = 'wakeWord:set-threshold';
// Phase 53 — Streaming TTS feature flag (STTS-02)
const STREAMING_TTS_SET_CHANNEL = 'streamingTts:set';
const STREAMING_TTS_CHANGED_CHANNEL = 'streamingTts:changed';
// Phase 60 — LM Studio Streaming Events feature flag (LLM-PROV-02)
const STREAMING_LM_STUDIO_EVENTS_SET_CHANNEL = 'streamingLMStudioEvents:set';
const STREAMING_LM_STUDIO_EVENTS_CHANGED_CHANNEL = 'streamingLMStudioEvents:changed';
// Phase 57 — Live LLM reload (LLM-PROV-01)
const RELOAD_LLM_CHANNEL = 'llm:reload';

const settings: SettingsApi = {
  get: () => ipcRenderer.invoke('settings:get'),
  save: (data) => ipcRenderer.invoke('settings:save', data),
  close: () => ipcRenderer.send('settings:close'),
  // Phase 40 (VLISTEN-04) — runtime apply do VAD silence threshold.
  // Boundary IPC clampa [300, 800]ms (T-40-VAD); o backend retorna o valor
  // efetivamente aplicado em clampedMs.
  setVadThreshold: (ms: number) => ipcRenderer.invoke(VAD_THRESHOLD_CHANNEL, ms),
  // Phase 52 — Settings Extras (SEXT-01, SEXT-02, SEXT-03)
  setLmStudioUrl: (url: string) => ipcRenderer.invoke(LM_STUDIO_SET_URL_CHANNEL, url),
  setLlmProvider: (provider) => ipcRenderer.invoke(LLM_SET_PROVIDER_CHANNEL, provider),
  setWakeWordThreshold: (threshold: number) => ipcRenderer.invoke(WAKE_WORD_SET_THRESHOLD_CHANNEL, threshold),
  // Phase 53 — Streaming TTS toggle (STTS-02)
  setStreamingTts: (enabled: boolean) => ipcRenderer.invoke(STREAMING_TTS_SET_CHANNEL, enabled),
  onStreamingTtsChanged: (cb: (enabled: boolean) => void) => {
    const handler = (_event: unknown, value: boolean) => cb(value);
    ipcRenderer.on(STREAMING_TTS_CHANGED_CHANNEL, handler);
    return () => {
      ipcRenderer.removeListener(STREAMING_TTS_CHANGED_CHANNEL, handler);
    };
  },
  // Phase 60 — LM Studio Streaming Events toggle (LLM-PROV-02)
  setStreamingLMStudioEvents: (enabled: boolean) => ipcRenderer.invoke(STREAMING_LM_STUDIO_EVENTS_SET_CHANNEL, enabled),
  onStreamingLMStudioEventsChanged: (cb: (enabled: boolean) => void) => {
    const handler = (_event: unknown, value: boolean) => cb(value);
    ipcRenderer.on(STREAMING_LM_STUDIO_EVENTS_CHANGED_CHANNEL, handler);
    return () => {
      ipcRenderer.removeListener(STREAMING_LM_STUDIO_EVENTS_CHANGED_CHANNEL, handler);
    };
  },
  // Phase 57 — Live LLM reload (LLM-PROV-01)
  reloadLlm: (req) => ipcRenderer.invoke(RELOAD_LLM_CHANNEL, req),
};

contextBridge.exposeInMainWorld('settings', settings);

// Phase 50 (WHISPER-01, WHISPER-02) — Whisper pre-download bridge.
// Inlined channel strings to avoid shared chunk extraction (same pattern as VAD_THRESHOLD_CHANNEL).
const WHISPER_DOWNLOAD_MODEL_CHANNEL = 'whisper:download-model';
const WHISPER_DOWNLOAD_PROGRESS_CHANNEL = 'whisper:download-progress';

const whisper: WhisperApi = {
  downloadModel: (option) => ipcRenderer.invoke(WHISPER_DOWNLOAD_MODEL_CHANNEL, option),
  onDownloadProgress: (cb) => {
    const handler = (_event: unknown, payload: WhisperDownloadProgress) => cb(payload);
    ipcRenderer.on(WHISPER_DOWNLOAD_PROGRESS_CHANNEL, handler);
    return () => {
      ipcRenderer.removeListener(WHISPER_DOWNLOAD_PROGRESS_CHANNEL, handler);
    };
  },
};

contextBridge.exposeInMainWorld('whisper', whisper);

// Phase 62 (TTS-OFF-01, TTS-OFF-04) — Kokoro offline TTS download bridge.
// Inlined channel strings to avoid shared chunk extraction (same pattern as whisper above).
const KOKORO_DOWNLOAD_MODEL_CHANNEL = 'kokoro:download-model';
const KOKORO_CANCEL_DOWNLOAD_CHANNEL = 'kokoro:cancel-download';
const KOKORO_CHECK_CACHED_CHANNEL = 'kokoro:check-cached';
const KOKORO_DOWNLOAD_PROGRESS_CHANNEL = 'kokoro:download-progress';

const kokoro: KokoroApi = {
  downloadModel: () => ipcRenderer.invoke(KOKORO_DOWNLOAD_MODEL_CHANNEL),
  cancelDownload: () => ipcRenderer.invoke(KOKORO_CANCEL_DOWNLOAD_CHANNEL),
  checkCached: () => ipcRenderer.invoke(KOKORO_CHECK_CACHED_CHANNEL),
  onDownloadProgress: (cb) => {
    const handler = (_event: unknown, payload: KokoroDownloadProgress) => cb(payload);
    ipcRenderer.on(KOKORO_DOWNLOAD_PROGRESS_CHANNEL, handler);
    return () => {
      ipcRenderer.removeListener(KOKORO_DOWNLOAD_PROGRESS_CHANNEL, handler);
    };
  },
};

contextBridge.exposeInMainWorld('kokoro', kokoro);
