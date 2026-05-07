/**
 * Settings IPC Handlers
 *
 * Phase 23 Plan 02 (D-03, D-06): Wake word pause handlers (preserved)
 * Phase 34 (SET-01..05): Settings window get/save handlers
 * Phase 40 (VLISTEN-04): VAD silence threshold runtime apply (always-listening)
 */
import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS, type SettingsData, type SaveSettingsRequest, type ReloadLlmRequest } from '../../shared/ipc-types';
import {
  getWakeWordPaused,
  getPttHotkey,
  getTtsProvider,
  getTtsApiKey,
  getWhisperModelOverride,
  setTtsProvider,
  setTtsApiKey,
  setWhisperModelOverride,
  getVadSilenceThresholdMs,
  setVadSilenceThresholdMs,
  getTtsVoiceId,
  setTtsVoiceId,
  getLmStudioUrl,
  setLmStudioUrl,
  getLlmProvider,
  setLlmProvider,
  getWakeWordThreshold,
  setWakeWordThreshold,
  getStreamingTtsEnabled,
  setStreamingTtsEnabled,
  getStreamingLMStudioEventsEnabled,
  setStreamingLMStudioEventsEnabled,
  getGeminiApiKey,
  setGeminiApiKey,
  getOpenaiApiKey,
  setOpenaiApiKey,
  getAnthropicApiKey,
  setAnthropicApiKey,
  getTtsLocalOnlyFlag,
  setTtsLocalOnlyFlag,
  getKokoroModelPath,
} from '../store';
import { changePttHotkey } from '../ptt-hotkey';
import { reinitializeTTS } from '../voiceInput/voiceHandler';

/**
 * Phase 40 (VLISTEN-04) — canal main → renderer para o engine renderer-side
 * (AlwaysListeningEngine) reconfigurar o VAD silence threshold em runtime.
 *
 * Separado de IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD (renderer → main)
 * para deixar claro no grep qual lado origina o evento. Engine listener
 * registrado em apps/desktop/src/renderer/src/voice/alwaysListening/AlwaysListeningEngine.ts.
 */
const VAD_THRESHOLD_CHANGED_CHANNEL = 'vad:threshold-changed';

export function setupSettingsHandlers(mainWindow: BrowserWindow): void {
  // Phase 23: wake word pause handler (preserved)
  ipcMain.handle(IPC_CHANNELS.WAKE_WORD_GET_PAUSED, () => {
    return getWakeWordPaused();
  });

  // Phase 34: get all settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (): SettingsData => {
    return {
      pttHotkey: getPttHotkey(),
      ttsProvider: getTtsProvider(),
      ttsApiKey: getTtsApiKey(),
      whisperModelOverride: getWhisperModelOverride(),
      // Phase 40 (VLISTEN-04): UI consome este valor para popular o slider VAD.
      // Default 500ms quando store está vazio (D-07 default no read).
      vadSilenceThresholdMs: getVadSilenceThresholdMs(),
      // QUICK-260427-tjc: per-provider voice ID — UI hidrata input "Voice ID"
      // baseado no provider ativo. Empty string = use provider default.
      ttsVoiceIds: {
        murf: getTtsVoiceId('murf'),
        elevenlabs: getTtsVoiceId('elevenlabs'),
        kokoro: getTtsVoiceId('kokoro'),
      },
      // Phase 52 — Settings Extras (SEXT-01, SEXT-02, SEXT-03)
      lmStudioUrl: getLmStudioUrl(),
      llmProvider: getLlmProvider(),
      wakeWordThreshold: getWakeWordThreshold(),
      // Phase 53 — Streaming TTS feature flag (STTS-02)
      streamingTtsEnabled: getStreamingTtsEnabled(),
      // Phase 60 — LM Studio Streaming Events feature flag (LLM-PROV-02)
      streamingLMStudioEventsEnabled: getStreamingLMStudioEventsEnabled(),
      // Phase 57 — Cloud LLM provider API keys
      openaiApiKey: getOpenaiApiKey(),
      anthropicApiKey: getAnthropicApiKey(),
      geminiApiKey: getGeminiApiKey(),
      // Phase 62 — Kokoro offline TTS (TTS-OFF-05)
      kokoroLocalOnly: getTtsLocalOnlyFlag(),
      kokoroModelCached: getKokoroModelPath() !== '',
    };
  });

  // Phase 34: save settings — applies each field, live-reloads TTS if changed
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SAVE,
    async (_event, request: SaveSettingsRequest): Promise<{ success: boolean; error?: string }> => {
      try {
        // PTT hotkey change
        if (request.pttHotkey !== undefined) {
          const ok = changePttHotkey(request.pttHotkey, mainWindow);
          if (!ok) {
            return { success: false, error: 'PTT hotkey already in use' };
          }
        }

        // TTS provider and API key
        if (request.ttsProvider !== undefined) {
          setTtsProvider(request.ttsProvider);
        }
        if (request.ttsApiKey !== undefined) {
          setTtsApiKey(request.ttsApiKey);
        }

        // QUICK-260427-tjc: per-provider voice ID. Itera só os providers que vieram
        // no request (UI envia objeto completo, mas mantemos guard string defensivo).
        if (request.ttsVoiceIds !== undefined) {
          for (const [provider, id] of Object.entries(request.ttsVoiceIds)) {
            if (typeof id === 'string') {
              setTtsVoiceId(provider as 'murf' | 'elevenlabs' | 'kokoro', id);
            }
          }
        }

        // Whisper model override
        if (request.whisperModelOverride !== undefined) {
          setWhisperModelOverride(request.whisperModelOverride);
        }

        // Phase 62 — Kokoro local-only flag (TTS-OFF-05)
        if (request.kokoroLocalOnly !== undefined) {
          setTtsLocalOnlyFlag(request.kokoroLocalOnly);
        }

        // Live TTS reload when TTS-related settings changed (SET-03 + QUICK-260427-tjc).
        // QUICK-260427-tjc: voice ID change also requires TTS reinit (factory injects env).
        // Phase 62: kokoroLocalOnly change also requires TTS reinit.
        if (
          request.ttsProvider !== undefined ||
          request.ttsApiKey !== undefined ||
          request.ttsVoiceIds !== undefined ||
          request.kokoroLocalOnly !== undefined
        ) {
          try {
            await reinitializeTTS();
            console.log('[settings] TTS provider re-initialized after settings save');
          } catch (reinitErr) {
            // Non-fatal: TTS will use previous provider; log but don't block save
            console.warn('[settings] TTS reinit failed (non-fatal):', reinitErr);
          }
        }

        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[settings] Save error:', message);
        return { success: false, error: message };
      }
    },
  );

  // Phase 40 (VLISTEN-04, T-40-VAD) — VAD silence threshold runtime apply.
  // Registrado aqui (em vez de em AlwaysListeningStrategy.start) para que o
  // slider de Settings sempre consiga salvar o valor — mesmo fora do modo
  // always-listening. Quando o modo está ativo, o broadcast 'vad:threshold-changed'
  // é consumido pelo AlwaysListeningEngine no renderer (reconfigureVadThreshold).
  //
  // T-40-VAD: clamp explícito com literais [300, 800]ms na borda IPC — defesa
  // em profundidade junto com store.setVadSilenceThresholdMs (que também faz
  // clamp). Mantemos os literais 300/800 visíveis no point-of-use para
  // facilitar auditoria via grep.
  ipcMain.handle(
    IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD,
    async (_event, ms: number): Promise<{ success: boolean; clampedMs: number }> => {
      const safeMs = typeof ms === 'number' && !Number.isNaN(ms) ? ms : 300;
      const clamped = Math.max(300, Math.min(800, safeMs));
      setVadSilenceThresholdMs(clamped);

      // Broadcast main → renderer (engine listener consome para reconfigureVadThreshold).
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(VAD_THRESHOLD_CHANGED_CHANNEL, clamped);
      }

      return { success: true, clampedMs: clamped };
    },
  );

  // Phase 52 (SEXT-01) — LM Studio URL apply without restart
  ipcMain.handle(
    IPC_CHANNELS.LM_STUDIO_SET_URL,
    async (_event, url: string): Promise<{ success: boolean; appliedUrl?: string; error?: string }> => {
      try {
        const withSchema = typeof url === 'string' && url.startsWith('http') ? url : `http://${url}`;
        const urlObj = new URL(withSchema); // throws on invalid URL
        const normalized = urlObj.toString().replace(/\/$/, '');
        setLmStudioUrl(normalized);
        // Broadcast to all windows (Pitfall #4: single-window send would miss main chat window)
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) win.webContents.send('lm-studio:url-changed', normalized);
        });
        return { success: true, appliedUrl: normalized };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: `Invalid URL: ${message}` };
      }
    },
  );

  // Phase 52 (SEXT-02) — LLM provider apply without restart
  ipcMain.handle(
    IPC_CHANNELS.LLM_SET_PROVIDER,
    async (_event, provider: string): Promise<{ success: boolean; error?: string }> => {
      const validProviders = ['lmstudio', 'openai', 'anthropic', 'gemini'] as const;
      if (!validProviders.includes(provider as (typeof validProviders)[number])) {
        return { success: false, error: `Invalid provider: ${provider}` };
      }
      setLlmProvider(provider as (typeof validProviders)[number]);
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) win.webContents.send('llm:provider-changed', provider);
      });
      return { success: true };
    },
  );

  // Phase 52 (SEXT-03) — Wake word threshold apply without restart
  ipcMain.handle(
    IPC_CHANNELS.WAKE_WORD_SET_THRESHOLD,
    async (_event, threshold: number): Promise<{ success: boolean; clampedThreshold: number }> => {
      const safe = typeof threshold === 'number' && !Number.isNaN(threshold) ? threshold : 0.5;
      const clamped = Math.max(0.0, Math.min(1.0, safe));
      setWakeWordThreshold(clamped);
      // Broadcast to all windows for WakeWordEngine.setThreshold() call in renderer
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.WAKE_WORD_THRESHOLD_CHANGED, clamped);
        }
      });
      return { success: true, clampedThreshold: clamped };
    },
  );

  // Phase 53 (STTS-02) — Streaming TTS feature flag apply without restart.
  // D-10: default false; D-11: Plan 04 reads getStreamingTtsEnabled() at turn start.
  // Mirrors Phase 52 SEXT-03 pattern: persist + multi-window broadcast.
  ipcMain.handle(
    IPC_CHANNELS.STREAMING_TTS_SET,
    async (_event, enabled: boolean): Promise<{ success: boolean }> => {
      const value = !!enabled;
      setStreamingTtsEnabled(value);
      // Phase 53 Plan 04: diagnostic log so QA can confirm flag flips reach main.
      console.log('[settings] streamingTts =', value);
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.STREAMING_TTS_CHANGED, value);
        }
      });
      return { success: true };
    },
  );

  // Phase 60 (LLM-PROV-02) — LM Studio Streaming Events feature flag apply without restart.
  // D-03: persist + broadcast + trigger backend reload so factory re-creates LLM with new flag.
  ipcMain.handle(
    IPC_CHANNELS.STREAMING_LM_STUDIO_EVENTS_SET,
    async (_event, enabled: boolean): Promise<{ success: boolean }> => {
      const value = !!enabled;
      setStreamingLMStudioEventsEnabled(value);
      console.log('[settings] streamingLMStudioEvents =', value);
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.STREAMING_LM_STUDIO_EVENTS_CHANGED, value);
        }
      });
      // Trigger backend LLM reload so factory re-creates LLM with updated flag (non-fatal)
      try {
        await fetch('http://localhost:8001/internal/reload-llm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: getLlmProvider(),
            lmStudioUrl: getLmStudioUrl(),
            useStreamingEvents: value,
          }),
        });
      } catch (err) {
        const cause = (err as any)?.cause;
        const isConnRefused = cause?.code === 'ECONNREFUSED' || cause instanceof AggregateError;
        if (!isConnRefused) {
          console.warn('[settings] streamingLMStudioEvents reload-llm call failed (non-fatal):', err);
        }
      }
      return { success: true };
    },
  );

  // Phase 57 (LLM-PROV-01) — Live LLM reload with new provider + API keys.
  // D-04: API keys persisted to electron-store before backend call.
  // D-05: Keys passed in body to backend (not as env vars).
  // D-13: Backend 400 → error toast + lmstudio fallback.
  ipcMain.handle(
    IPC_CHANNELS.RELOAD_LLM,
    async (_event, request: ReloadLlmRequest): Promise<{ success: boolean; error?: string }> => {
      // Persist API keys to electron-store (D-04)
      if (request.openaiApiKey !== undefined) setOpenaiApiKey(request.openaiApiKey);
      if (request.anthropicApiKey !== undefined) setAnthropicApiKey(request.anthropicApiKey);
      if (request.geminiApiKey !== undefined) setGeminiApiKey(request.geminiApiKey);

      try {
        const response = await fetch('http://localhost:8001/internal/reload-llm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: request.provider,
            lmStudioUrl: request.lmStudioUrl,
            openaiApiKey: request.openaiApiKey || getOpenaiApiKey(),
            anthropicApiKey: request.anthropicApiKey || getAnthropicApiKey(),
            geminiApiKey: request.geminiApiKey || getGeminiApiKey(),
            llmModel: request.llmModel,
          }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({ error: 'Unknown error' }));
          const errorMsg = typeof body?.error === 'string' ? body.error : 'LLM reload failed';
          const toastMsg = errorMsg.includes('GEMINI_API_KEY')
            ? 'GEMINI_API_KEY inválida — usando LM Studio'
            : `LLM reload failed: ${errorMsg}`;
          // Broadcast error toast to all windows
          BrowserWindow.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) win.webContents.send('toast', { type: 'error', message: toastMsg });
          });
          // Fallback to lmstudio (D-13)
          try {
            await fetch('http://localhost:8001/internal/reload-llm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ provider: 'lmstudio', lmStudioUrl: getLmStudioUrl() }),
            });
          } catch {
            // Fallback failed silently — LM Studio may be offline
          }
          return { success: false, error: toastMsg };
        }

        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) win.webContents.send('toast', { type: 'error', message: `LLM reload failed: ${message}` });
        });
        return { success: false, error: message };
      }
    },
  );
}

/**
 * Broadcast do toggle pause/resume a todos os renderers abertos.
 * Chamado pelo tray.ts onClick do item "Pause listening"/"Resume listening".
 */
export function broadcastPauseToggle(paused: boolean): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(IPC_CHANNELS.WAKE_WORD_PAUSE_TOGGLE, paused);
  });
}
