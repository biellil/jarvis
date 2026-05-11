/**
 * Wake word pause IPC handler tests — Phase 23 Plan 02 (D-03, D-06)
 * Settings IPC handler tests — Phase 34 (SET-01..05)
 *
 * Phase 23 covers:
 *  - Handler `wakeWord:get-paused` registrado e retornando o valor do store
 *  - Helper broadcastPauseToggle envia para TODAS as BrowserWindows com o
 *    canal `wakeWord:pause-toggle` e o payload correto
 *
 * Phase 34 covers:
 *  - SETTINGS_GET handler returns all four fields from store
 *  - SETTINGS_SAVE handler saves fields, calls changePttHotkey, reinitializeTTS
 *  - SETTINGS_SAVE returns { success: false, error } on hotkey conflict
 *  - SETTINGS_SAVE TTS reinit failure is non-fatal
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock do store — import relativo ao arquivo sob teste.
const getWakeWordPausedMock = vi.fn<[], boolean>(() => false);
const getPttHotkeyMock = vi.fn<[], string>(() => 'CmdOrCtrl+Space');
const getTtsProviderMock = vi.fn<[], 'murf' | 'elevenlabs'>(() => 'elevenlabs');
const getTtsApiKeyMock = vi.fn<[], string>(() => '');
const getWhisperModelOverrideMock = vi.fn<[], WhisperModelOption>(() => 'base');
const setTtsProviderMock = vi.fn();
const setTtsApiKeyMock = vi.fn();
const setWhisperModelOverrideMock = vi.fn();
// Phase 40 — settings:get agora inclui vadSilenceThresholdMs (VLISTEN-04).
const getVadSilenceThresholdMsMock = vi.fn<[], number>(() => 500);
// Phase 40 Plan 06 — handler always-listening:vad-threshold persiste via setVadSilenceThresholdMs.
const setVadSilenceThresholdMsMock = vi.fn<[number], void>();
// QUICK-260427-tjc — voice ID per-provider mocks
const getTtsVoiceIdMock = vi.fn<[provider: 'murf' | 'elevenlabs'], string>(() => '');
const setTtsVoiceIdMock = vi.fn<[provider: 'murf' | 'elevenlabs', voiceId: string], void>();
// Phase 52 — Settings Extras mocks (SEXT-01, SEXT-02, SEXT-03)
const getLmStudioUrlMock = vi.fn<[], string>(() => 'http://localhost:1234/v1');
const getLlmProviderMock = vi.fn<[], 'lmstudio' | 'openai' | 'anthropic'>(() => 'lmstudio');
const getWakeWordThresholdMock = vi.fn<[], number>(() => 0.5);
// Phase 53 Plan 03 — Streaming TTS flag (STTS-02)
const getStreamingTtsEnabledMock = vi.fn<[], boolean>(() => false);
const setStreamingTtsEnabledMock = vi.fn<[boolean], void>();
// Phase 60 — LM Studio Streaming Events flag (LLM-PROV-02)
const getStreamingLMStudioEventsEnabledMock = vi.fn<[], boolean>(() => false);
const setStreamingLMStudioEventsEnabledMock = vi.fn<[boolean], void>();

vi.mock('../../store', () => ({
  getWakeWordPaused: () => getWakeWordPausedMock(),
  getPttHotkey: () => getPttHotkeyMock(),
  getTtsProvider: () => getTtsProviderMock(),
  getTtsApiKey: () => getTtsApiKeyMock(),
  getWhisperModelOverride: () => getWhisperModelOverrideMock(),
  setTtsProvider: (...args: unknown[]) => setTtsProviderMock(...args),
  setTtsApiKey: (...args: unknown[]) => setTtsApiKeyMock(...args),
  setWhisperModelOverride: (...args: unknown[]) => setWhisperModelOverrideMock(...args),
  getVadSilenceThresholdMs: () => getVadSilenceThresholdMsMock(),
  setVadSilenceThresholdMs: (...args: unknown[]) =>
    setVadSilenceThresholdMsMock(args[0] as number),
  getTtsVoiceId: (...args: unknown[]) =>
    getTtsVoiceIdMock(args[0] as 'murf' | 'elevenlabs'),
  setTtsVoiceId: (...args: unknown[]) =>
    setTtsVoiceIdMock(args[0] as 'murf' | 'elevenlabs', args[1] as string),
  // Phase 52 — Settings Extras
  getLmStudioUrl: () => getLmStudioUrlMock(),
  getLlmProvider: () => getLlmProviderMock(),
  getWakeWordThreshold: () => getWakeWordThresholdMock(),
  // Phase 53 Plan 03 — Streaming TTS flag (STTS-02)
  getStreamingTtsEnabled: () => getStreamingTtsEnabledMock(),
  setStreamingTtsEnabled: (...args: unknown[]) =>
    setStreamingTtsEnabledMock(args[0] as boolean),
  // Phase 60 — LM Studio Streaming Events flag (LLM-PROV-02)
  getStreamingLMStudioEventsEnabled: () => getStreamingLMStudioEventsEnabledMock(),
  setStreamingLMStudioEventsEnabled: (...args: unknown[]) =>
    setStreamingLMStudioEventsEnabledMock(args[0] as boolean),
  // Phase 57 — Cloud provider API keys
  getOpenaiApiKey: () => '',
  getAnthropicApiKey: () => '',
  getGeminiApiKey: () => '',
  setOpenaiApiKey: vi.fn(),
  setAnthropicApiKey: vi.fn(),
  setGeminiApiKey: vi.fn(),
  // Phase 68 D-07 — TTS local-only flag (kokoro local mode)
  getTtsLocalOnlyFlag: () => false,
  setTtsLocalOnlyFlag: vi.fn(),
  // Phase 62+ — Screenshot hotkey
  getScreenshotHotkey: () => '',
  setScreenshotHotkey: vi.fn(),
  // Phase 62+ — MCP server flag
  getMcpServerEnabled: () => false,
}));

// Mock ptt-hotkey
const changePttHotkeyMock = vi.fn<[string, unknown], boolean>(() => true);
vi.mock('../../ptt-hotkey', () => ({
  changePttHotkey: (...args: unknown[]) => changePttHotkeyMock(args[0] as string, args[1]),
}));

// Mock reinitializeTTS
const reinitializeTTSMock = vi.fn<[], Promise<void>>(() => Promise.resolve());
vi.mock('../../voiceInput/voiceHandler', () => ({
  reinitializeTTS: () => reinitializeTTSMock(),
}));

// Mock screenshot-hotkey (Phase 62+)
vi.mock('../../screenshot-hotkey', () => ({
  changeScreenshotHotkey: vi.fn(),
}));

// Mock kokoroResources — imports app from electron (Phase 62+)
vi.mock('../../voiceInput/tts/kokoroResources', () => ({
  isKokoroModelCached: vi.fn(() => false),
}));

// Mock do electron — capturamos tanto ipcMain.handle quanto
// BrowserWindow.getAllWindows para inspecionar o broadcast.
const ipcHandleMock = vi.fn();
const fakeWebContentsSendA = vi.fn();
const fakeWebContentsSendB = vi.fn();
const getAllWindowsMock = vi.fn(() => [
  { webContents: { send: fakeWebContentsSendA }, isDestroyed: () => false },
  { webContents: { send: fakeWebContentsSendB }, isDestroyed: () => false },
]);

vi.mock('electron', () => ({
  ipcMain: {
    handle: (...args: unknown[]) => ipcHandleMock(...args),
  },
  BrowserWindow: {
    getAllWindows: () => getAllWindowsMock(),
  },
}));

// Importar APÓS os mocks
import { setupSettingsHandlers, broadcastPauseToggle } from '../settings';
import { IPC_CHANNELS } from '../../../shared/ipc-types';
import type { WhisperModelOption } from '../../../shared/ipc-types';

// Fake mainWindow for Phase 34 tests
const fakeMainWindow = {} as Electron.BrowserWindow;

// Fake mainWindow with broadcast capability — Phase 40 Plan 06 (VLISTEN-04).
// Permite inspecionar o broadcast de 'vad:threshold-changed' sem mexer no
// fakeMainWindow histórico das suítes Phase 23/34.
function makeMainWindowWithSend(): Electron.BrowserWindow {
  const send = vi.fn();
  return {
    webContents: { send },
    isDestroyed: () => false,
  } as unknown as Electron.BrowserWindow;
}

describe('ipc/settings — Phase 23 Plan 02', () => {
  beforeEach(() => {
    ipcHandleMock.mockReset();
    fakeWebContentsSendA.mockReset();
    fakeWebContentsSendB.mockReset();
    getWakeWordPausedMock.mockReset();
    getWakeWordPausedMock.mockReturnValue(false);
  });

  describe('setupSettingsHandlers', () => {
    it("registers handler for 'wakeWord:get-paused'", () => {
      setupSettingsHandlers(fakeMainWindow);
      expect(ipcHandleMock).toHaveBeenCalledWith(
        IPC_CHANNELS.WAKE_WORD_GET_PAUSED,
        expect.any(Function)
      );
    });

    it('handler returns getWakeWordPaused() value', () => {
      getWakeWordPausedMock.mockReturnValue(true);
      setupSettingsHandlers(fakeMainWindow);

      const wakeWordCall = ipcHandleMock.mock.calls.find(
        (call) => call[0] === IPC_CHANNELS.WAKE_WORD_GET_PAUSED
      ) as [string, () => boolean] | undefined;
      expect(wakeWordCall).toBeDefined();
      const handler = wakeWordCall![1];
      expect(handler()).toBe(true);
      expect(getWakeWordPausedMock).toHaveBeenCalled();
    });

    it('handler returns false when store is default', () => {
      getWakeWordPausedMock.mockReturnValue(false);
      setupSettingsHandlers(fakeMainWindow);

      const wakeWordCall = ipcHandleMock.mock.calls.find(
        (call) => call[0] === IPC_CHANNELS.WAKE_WORD_GET_PAUSED
      ) as [string, () => boolean] | undefined;
      expect(wakeWordCall).toBeDefined();
      const handler = wakeWordCall![1];
      expect(handler()).toBe(false);
    });
  });

  describe('broadcastPauseToggle', () => {
    it('sends pause-toggle event to every BrowserWindow', () => {
      broadcastPauseToggle(true);

      expect(fakeWebContentsSendA).toHaveBeenCalledWith(
        IPC_CHANNELS.WAKE_WORD_PAUSE_TOGGLE,
        true
      );
      expect(fakeWebContentsSendB).toHaveBeenCalledWith(
        IPC_CHANNELS.WAKE_WORD_PAUSE_TOGGLE,
        true
      );
    });

    it('propagates false payload too', () => {
      broadcastPauseToggle(false);
      expect(fakeWebContentsSendA).toHaveBeenCalledWith(
        IPC_CHANNELS.WAKE_WORD_PAUSE_TOGGLE,
        false
      );
      expect(fakeWebContentsSendB).toHaveBeenCalledWith(
        IPC_CHANNELS.WAKE_WORD_PAUSE_TOGGLE,
        false
      );
    });

    it('no-op when there are zero windows', () => {
      getAllWindowsMock.mockReturnValueOnce([]);
      expect(() => broadcastPauseToggle(true)).not.toThrow();
      expect(fakeWebContentsSendA).not.toHaveBeenCalled();
    });
  });
});

describe('ipc/settings — Phase 34', () => {
  beforeEach(() => {
    ipcHandleMock.mockReset();
    changePttHotkeyMock.mockReset();
    reinitializeTTSMock.mockReset();
    setTtsProviderMock.mockReset();
    setTtsApiKeyMock.mockReset();
    setWhisperModelOverrideMock.mockReset();
    // QUICK-260427-tjc: reset voice ID mocks per test
    setTtsVoiceIdMock.mockReset();
    getTtsVoiceIdMock.mockReset();
    getTtsVoiceIdMock.mockReturnValue('');
    getPttHotkeyMock.mockReturnValue('CmdOrCtrl+Space');
    getTtsProviderMock.mockReturnValue('elevenlabs');
    getTtsApiKeyMock.mockReturnValue('');
    getWhisperModelOverrideMock.mockReturnValue('base');
    changePttHotkeyMock.mockReturnValue(true);
    reinitializeTTSMock.mockResolvedValue(undefined);
  });

  function getHandler(channel: string): ((...args: unknown[]) => unknown) | undefined {
    const call = ipcHandleMock.mock.calls.find((c) => c[0] === channel) as
      | [string, (...args: unknown[]) => unknown]
      | undefined;
    return call?.[1];
  }

  describe('SETTINGS_GET handler', () => {
    it('registers settings:get handler', () => {
      setupSettingsHandlers(fakeMainWindow);
      expect(ipcHandleMock).toHaveBeenCalledWith(
        IPC_CHANNELS.SETTINGS_GET,
        expect.any(Function)
      );
    });

    it('returns all four settings fields from store', () => {
      getPttHotkeyMock.mockReturnValue('CmdOrCtrl+Alt+V');
      getTtsProviderMock.mockReturnValue('murf');
      getTtsApiKeyMock.mockReturnValue('my-api-key');
      getWhisperModelOverrideMock.mockReturnValue('base');

      setupSettingsHandlers(fakeMainWindow);
      const handler = getHandler(IPC_CHANNELS.SETTINGS_GET) as () => unknown;
      expect(handler).toBeDefined();

      const result = handler();
      expect(result).toEqual({
        pttHotkey: 'CmdOrCtrl+Alt+V',
        ttsProvider: 'murf',
        ttsApiKey: 'my-api-key',
        whisperModelOverride: 'base',
        // Phase 40 — VLISTEN-04: settings:get inclui vadSilenceThresholdMs
        vadSilenceThresholdMs: 500,
        // QUICK-260427-tjc: settings:get inclui ttsVoiceIds per-provider
        ttsVoiceIds: { murf: '', elevenlabs: '', kokoro: '' },
        // Phase 52 — Settings Extras
        lmStudioUrl: 'http://localhost:1234/v1',
        llmProvider: 'lmstudio',
        wakeWordThreshold: 0.5,
        // Phase 53 Plan 03 — Streaming TTS flag default false (D-10)
        streamingTtsEnabled: false,
        // Phase 60 — LM Studio Streaming Events flag default false (D-03)
        streamingLMStudioEventsEnabled: false,
        // Phase 57 — Cloud provider API keys
        openaiApiKey: '',
        anthropicApiKey: '',
        geminiApiKey: '',
        // Phase 62/68 — kokoro local-only flag
        kokoroLocalOnly: false,
        kokoroModelCached: false,
        // Phase 63 — Screenshot hotkey
        screenshotHotkey: '',
      });
    });

    it('returns defaults when store has no overrides', () => {
      setupSettingsHandlers(fakeMainWindow);
      const handler = getHandler(IPC_CHANNELS.SETTINGS_GET) as () => unknown;
      const result = handler();
      expect(result).toEqual({
        pttHotkey: 'CmdOrCtrl+Space',
        ttsProvider: 'elevenlabs',
        ttsApiKey: '',
        whisperModelOverride: 'base',
        // Phase 40 — VLISTEN-04: default 500ms quando store vazio (D-07).
        vadSilenceThresholdMs: 500,
        // QUICK-260427-tjc: default '' por provider quando store vazio
        ttsVoiceIds: { murf: '', elevenlabs: '', kokoro: '' },
        // Phase 52 — Settings Extras defaults
        lmStudioUrl: 'http://localhost:1234/v1',
        llmProvider: 'lmstudio',
        wakeWordThreshold: 0.5,
        // Phase 53 Plan 03 — Streaming TTS flag default false (D-10)
        streamingTtsEnabled: false,
        // Phase 60 — LM Studio Streaming Events flag default false (D-03)
        streamingLMStudioEventsEnabled: false,
        // Phase 57 — Cloud provider API keys
        openaiApiKey: '',
        anthropicApiKey: '',
        geminiApiKey: '',
        // Phase 62/68 — kokoro local-only flag
        kokoroLocalOnly: false,
        kokoroModelCached: false,
        // Phase 63 — Screenshot hotkey
        screenshotHotkey: '',
      });
    });

    // QUICK-260427-tjc: Test 1 — settings:get includes ttsVoiceIds per provider
    it('settings:get returns ttsVoiceIds with murf and elevenlabs keys (QUICK-260427-tjc)', () => {
      getTtsVoiceIdMock.mockImplementation((provider) =>
        provider === 'murf' ? 'pt-BR-yago' : 'voice-elev-99',
      );
      setupSettingsHandlers(fakeMainWindow);
      const handler = getHandler(IPC_CHANNELS.SETTINGS_GET) as () => {
        ttsVoiceIds: Record<string, string>;
      };
      const result = handler();
      expect(result.ttsVoiceIds).toEqual({
        murf: 'pt-BR-yago',
        elevenlabs: 'voice-elev-99',
        kokoro: 'voice-elev-99', // mock returns 'voice-elev-99' for non-murf providers
      });
      expect(getTtsVoiceIdMock).toHaveBeenCalledWith('murf');
      expect(getTtsVoiceIdMock).toHaveBeenCalledWith('elevenlabs');
    });
  });

  describe('SETTINGS_SAVE handler', () => {
    it('registers settings:save handler', () => {
      setupSettingsHandlers(fakeMainWindow);
      expect(ipcHandleMock).toHaveBeenCalledWith(
        IPC_CHANNELS.SETTINGS_SAVE,
        expect.any(Function)
      );
    });

    it('returns { success: true } when all fields saved successfully', async () => {
      setupSettingsHandlers(fakeMainWindow);
      const handler = getHandler(IPC_CHANNELS.SETTINGS_SAVE) as (
        _event: null,
        req: unknown
      ) => Promise<unknown>;

      const result = await handler(null, {
        pttHotkey: 'CmdOrCtrl+Alt+V',
        ttsProvider: 'murf',
        ttsApiKey: 'key123',
        whisperModelOverride: 'base',
      });

      expect(result).toEqual({ success: true });
    });

    it('calls changePttHotkey when pttHotkey provided', async () => {
      setupSettingsHandlers(fakeMainWindow);
      const handler = getHandler(IPC_CHANNELS.SETTINGS_SAVE) as (
        _event: null,
        req: unknown
      ) => Promise<unknown>;

      await handler(null, { pttHotkey: 'CmdOrCtrl+Alt+V' });
      expect(changePttHotkeyMock).toHaveBeenCalledWith('CmdOrCtrl+Alt+V', fakeMainWindow);
    });

    it('does not call changePttHotkey when pttHotkey not provided', async () => {
      setupSettingsHandlers(fakeMainWindow);
      const handler = getHandler(IPC_CHANNELS.SETTINGS_SAVE) as (
        _event: null,
        req: unknown
      ) => Promise<unknown>;

      await handler(null, { ttsProvider: 'murf' });
      expect(changePttHotkeyMock).not.toHaveBeenCalled();
    });

    it('returns { success: false, error: "PTT hotkey already in use" } when changePttHotkey returns false', async () => {
      changePttHotkeyMock.mockReturnValue(false);
      setupSettingsHandlers(fakeMainWindow);
      const handler = getHandler(IPC_CHANNELS.SETTINGS_SAVE) as (
        _event: null,
        req: unknown
      ) => Promise<unknown>;

      const result = await handler(null, { pttHotkey: 'CmdOrCtrl+Alt+V' });
      expect(result).toEqual({ success: false, error: 'PTT hotkey already in use' });
    });

    it('calls setTtsProvider when ttsProvider provided', async () => {
      setupSettingsHandlers(fakeMainWindow);
      const handler = getHandler(IPC_CHANNELS.SETTINGS_SAVE) as (
        _event: null,
        req: unknown
      ) => Promise<unknown>;

      await handler(null, { ttsProvider: 'murf' });
      expect(setTtsProviderMock).toHaveBeenCalledWith('murf');
    });

    it('calls setTtsApiKey when ttsApiKey provided', async () => {
      setupSettingsHandlers(fakeMainWindow);
      const handler = getHandler(IPC_CHANNELS.SETTINGS_SAVE) as (
        _event: null,
        req: unknown
      ) => Promise<unknown>;

      await handler(null, { ttsApiKey: 'new-key' });
      expect(setTtsApiKeyMock).toHaveBeenCalledWith('new-key');
    });

    it('calls setWhisperModelOverride when whisperModelOverride provided', async () => {
      setupSettingsHandlers(fakeMainWindow);
      const handler = getHandler(IPC_CHANNELS.SETTINGS_SAVE) as (
        _event: null,
        req: unknown
      ) => Promise<unknown>;

      await handler(null, { whisperModelOverride: 'base' });
      expect(setWhisperModelOverrideMock).toHaveBeenCalledWith('base');
    });

    it('calls reinitializeTTS when ttsProvider is provided', async () => {
      setupSettingsHandlers(fakeMainWindow);
      const handler = getHandler(IPC_CHANNELS.SETTINGS_SAVE) as (
        _event: null,
        req: unknown
      ) => Promise<unknown>;

      await handler(null, { ttsProvider: 'murf' });
      expect(reinitializeTTSMock).toHaveBeenCalled();
    });

    it('calls reinitializeTTS when ttsApiKey is provided', async () => {
      setupSettingsHandlers(fakeMainWindow);
      const handler = getHandler(IPC_CHANNELS.SETTINGS_SAVE) as (
        _event: null,
        req: unknown
      ) => Promise<unknown>;

      await handler(null, { ttsApiKey: 'new-key' });
      expect(reinitializeTTSMock).toHaveBeenCalled();
    });

    it('does not call reinitializeTTS when only non-TTS fields provided', async () => {
      setupSettingsHandlers(fakeMainWindow);
      const handler = getHandler(IPC_CHANNELS.SETTINGS_SAVE) as (
        _event: null,
        req: unknown
      ) => Promise<unknown>;

      await handler(null, { pttHotkey: 'CmdOrCtrl+Alt+V', whisperModelOverride: 'base' });
      expect(reinitializeTTSMock).not.toHaveBeenCalled();
    });

    it('TTS reinit failure is non-fatal — still returns { success: true }', async () => {
      reinitializeTTSMock.mockRejectedValue(new Error('TTS init failed'));
      setupSettingsHandlers(fakeMainWindow);
      const handler = getHandler(IPC_CHANNELS.SETTINGS_SAVE) as (
        _event: null,
        req: unknown
      ) => Promise<unknown>;

      const result = await handler(null, { ttsProvider: 'murf' });
      expect(result).toEqual({ success: true });
    });

    it('returns { success: false, error } on unexpected throw', async () => {
      setTtsProviderMock.mockImplementation(() => {
        throw new Error('store write failed');
      });
      setupSettingsHandlers(fakeMainWindow);
      const handler = getHandler(IPC_CHANNELS.SETTINGS_SAVE) as (
        _event: null,
        req: unknown
      ) => Promise<unknown>;

      const result = await handler(null, { ttsProvider: 'murf' }) as { success: boolean; error?: string };
      expect(result.success).toBe(false);
      expect(result.error).toBe('store write failed');
    });

    // ==========================================================
    // QUICK-260427-tjc: voice ID save + reinit gate
    // ==========================================================

    it('Test 2 — settings:save with ttsVoiceIds: { murf } calls setTtsVoiceId once for murf', async () => {
      setupSettingsHandlers(fakeMainWindow);
      const handler = getHandler(IPC_CHANNELS.SETTINGS_SAVE) as (
        _event: null,
        req: unknown
      ) => Promise<unknown>;

      await handler(null, { ttsVoiceIds: { murf: 'pt-BR-gustavo' } });
      expect(setTtsVoiceIdMock).toHaveBeenCalledTimes(1);
      expect(setTtsVoiceIdMock).toHaveBeenCalledWith('murf', 'pt-BR-gustavo');
    });

    it('Test 3 — settings:save with both providers calls setTtsVoiceId twice', async () => {
      setupSettingsHandlers(fakeMainWindow);
      const handler = getHandler(IPC_CHANNELS.SETTINGS_SAVE) as (
        _event: null,
        req: unknown
      ) => Promise<unknown>;

      await handler(null, { ttsVoiceIds: { murf: 'X', elevenlabs: 'Y' } });
      expect(setTtsVoiceIdMock).toHaveBeenCalledTimes(2);
      expect(setTtsVoiceIdMock).toHaveBeenCalledWith('murf', 'X');
      expect(setTtsVoiceIdMock).toHaveBeenCalledWith('elevenlabs', 'Y');
    });

    it('Test 4 — settings:save with ttsVoiceIds present triggers reinitializeTTS', async () => {
      setupSettingsHandlers(fakeMainWindow);
      const handler = getHandler(IPC_CHANNELS.SETTINGS_SAVE) as (
        _event: null,
        req: unknown
      ) => Promise<unknown>;

      await handler(null, { ttsVoiceIds: { murf: 'pt-BR-yago' } });
      expect(reinitializeTTSMock).toHaveBeenCalled();
    });

    it('Test 5 — settings:save without ttsVoiceIds (only pttHotkey) does NOT call setTtsVoiceId nor reinit', async () => {
      setupSettingsHandlers(fakeMainWindow);
      const handler = getHandler(IPC_CHANNELS.SETTINGS_SAVE) as (
        _event: null,
        req: unknown
      ) => Promise<unknown>;

      await handler(null, { pttHotkey: 'CmdOrCtrl+Alt+V' });
      expect(setTtsVoiceIdMock).not.toHaveBeenCalled();
      expect(reinitializeTTSMock).not.toHaveBeenCalled();
    });
  });
});

describe('ipc/settings — Phase 40 Plan 06 (VLISTEN-04, T-40-VAD)', () => {
  beforeEach(() => {
    ipcHandleMock.mockReset();
    setVadSilenceThresholdMsMock.mockReset();
    getVadSilenceThresholdMsMock.mockReset();
    getVadSilenceThresholdMsMock.mockReturnValue(500);
    // Defaults para os outros getters — settings:get precisa retornar shape válido.
    getPttHotkeyMock.mockReturnValue('CmdOrCtrl+Space');
    getTtsProviderMock.mockReturnValue('elevenlabs');
    getTtsApiKeyMock.mockReturnValue('');
    getWhisperModelOverrideMock.mockReturnValue('base');
    // QUICK-260427-tjc: voice ID mocks reset
    getTtsVoiceIdMock.mockReset();
    getTtsVoiceIdMock.mockReturnValue('');
    setTtsVoiceIdMock.mockReset();
    // Phase 52 — Settings Extras mocks reset with defaults
    getLmStudioUrlMock.mockReset();
    getLmStudioUrlMock.mockReturnValue('http://localhost:1234/v1');
    getLlmProviderMock.mockReset();
    getLlmProviderMock.mockReturnValue('lmstudio');
    getWakeWordThresholdMock.mockReset();
    getWakeWordThresholdMock.mockReturnValue(0.5);
  });

  function getHandler(channel: string): ((...args: unknown[]) => unknown) | undefined {
    const call = ipcHandleMock.mock.calls.find((c) => c[0] === channel) as
      | [string, (...args: unknown[]) => unknown]
      | undefined;
    return call?.[1];
  }

  describe('always-listening:vad-threshold handler', () => {
    it('registers handler for ALWAYS_LISTENING_VAD_THRESHOLD on setupSettingsHandlers', () => {
      setupSettingsHandlers(makeMainWindowWithSend());
      expect(ipcHandleMock).toHaveBeenCalledWith(
        IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD,
        expect.any(Function),
      );
    });

    it('clamps incoming ms below 300 to 300 and persists clamped value', async () => {
      setupSettingsHandlers(makeMainWindowWithSend());
      const handler = getHandler(IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD)!;

      const result = (await handler(null, 100)) as { success: boolean; clampedMs: number };

      expect(result).toEqual({ success: true, clampedMs: 300 });
      expect(setVadSilenceThresholdMsMock).toHaveBeenCalledWith(300);
    });

    it('clamps incoming ms above 800 to 800 and persists clamped value', async () => {
      setupSettingsHandlers(makeMainWindowWithSend());
      const handler = getHandler(IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD)!;

      const result = (await handler(null, 9999)) as { success: boolean; clampedMs: number };

      expect(result).toEqual({ success: true, clampedMs: 800 });
      expect(setVadSilenceThresholdMsMock).toHaveBeenCalledWith(800);
    });

    it('passes valid in-range value through unchanged (e.g., 600)', async () => {
      setupSettingsHandlers(makeMainWindowWithSend());
      const handler = getHandler(IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD)!;

      const result = (await handler(null, 600)) as { success: boolean; clampedMs: number };

      expect(result).toEqual({ success: true, clampedMs: 600 });
      expect(setVadSilenceThresholdMsMock).toHaveBeenCalledWith(600);
    });

    it('treats NaN/non-number input as 300 (defensive)', async () => {
      setupSettingsHandlers(makeMainWindowWithSend());
      const handler = getHandler(IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD)!;

      const result = (await handler(null, Number.NaN)) as { success: boolean; clampedMs: number };

      expect(result.clampedMs).toBe(300);
      expect(setVadSilenceThresholdMsMock).toHaveBeenCalledWith(300);
    });

    it('broadcasts vad:threshold-changed to mainWindow with clamped value', async () => {
      const mainWindow = makeMainWindowWithSend();
      setupSettingsHandlers(mainWindow);
      const handler = getHandler(IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD)!;

      await handler(null, 700);

      const send = (mainWindow.webContents.send as unknown as ReturnType<typeof vi.fn>);
      expect(send).toHaveBeenCalledWith('vad:threshold-changed', 700);
    });

    it('does not crash if mainWindow is destroyed when handler fires', async () => {
      const send = vi.fn();
      const destroyedWindow = {
        webContents: { send },
        isDestroyed: () => true,
      } as unknown as Electron.BrowserWindow;

      setupSettingsHandlers(destroyedWindow);
      const handler = getHandler(IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD)!;

      const result = (await handler(null, 500)) as { success: boolean; clampedMs: number };

      expect(result).toEqual({ success: true, clampedMs: 500 });
      expect(send).not.toHaveBeenCalled();
      // Persistência ainda acontece — isDestroyed só bloqueia o broadcast.
      expect(setVadSilenceThresholdMsMock).toHaveBeenCalledWith(500);
    });
  });
});

// ============================================================
// Phase 53 Plan 03 — Streaming TTS feature flag (STTS-02)
// Mirror Phase 52 SEXT-03 wakeWordThreshold pattern: handler persists +
// broadcasts streamingTts:changed to all BrowserWindows.
// ============================================================

describe('ipc/settings — Phase 53 Plan 03 (STTS-02 streamingTts:set)', () => {
  beforeEach(() => {
    ipcHandleMock.mockReset();
    fakeWebContentsSendA.mockReset();
    fakeWebContentsSendB.mockReset();
    setStreamingTtsEnabledMock.mockReset();
    getStreamingTtsEnabledMock.mockReset();
    getStreamingTtsEnabledMock.mockReturnValue(false);
    // Defaults so settings:get can still return shape if invoked.
    getPttHotkeyMock.mockReturnValue('CmdOrCtrl+Space');
    getTtsProviderMock.mockReturnValue('elevenlabs');
    getTtsApiKeyMock.mockReturnValue('');
    getWhisperModelOverrideMock.mockReturnValue('base');
    getTtsVoiceIdMock.mockReturnValue('');
    getVadSilenceThresholdMsMock.mockReturnValue(500);
    getLmStudioUrlMock.mockReturnValue('http://localhost:1234/v1');
    getLlmProviderMock.mockReturnValue('lmstudio');
    getWakeWordThresholdMock.mockReturnValue(0.5);
  });

  function getHandler(channel: string): ((...args: unknown[]) => unknown) | undefined {
    const call = ipcHandleMock.mock.calls.find((c) => c[0] === channel) as
      | [string, (...args: unknown[]) => unknown]
      | undefined;
    return call?.[1];
  }

  it('registers handler for STREAMING_TTS_SET', () => {
    setupSettingsHandlers(fakeMainWindow);
    expect(ipcHandleMock).toHaveBeenCalledWith(
      IPC_CHANNELS.STREAMING_TTS_SET,
      expect.any(Function),
    );
  });

  it('handler with payload true persists via setStreamingTtsEnabled(true) and returns { success: true }', async () => {
    setupSettingsHandlers(fakeMainWindow);
    const handler = getHandler(IPC_CHANNELS.STREAMING_TTS_SET)!;

    const result = (await handler(null, true)) as { success: boolean };

    expect(setStreamingTtsEnabledMock).toHaveBeenCalledWith(true);
    expect(result).toEqual({ success: true });
  });

  it('handler with payload false persists via setStreamingTtsEnabled(false)', async () => {
    setupSettingsHandlers(fakeMainWindow);
    const handler = getHandler(IPC_CHANNELS.STREAMING_TTS_SET)!;

    await handler(null, false);

    expect(setStreamingTtsEnabledMock).toHaveBeenCalledWith(false);
  });

  it('handler broadcasts STREAMING_TTS_CHANGED to every non-destroyed BrowserWindow with the value', async () => {
    setupSettingsHandlers(fakeMainWindow);
    const handler = getHandler(IPC_CHANNELS.STREAMING_TTS_SET)!;

    await handler(null, true);

    expect(fakeWebContentsSendA).toHaveBeenCalledWith(
      IPC_CHANNELS.STREAMING_TTS_CHANGED,
      true,
    );
    expect(fakeWebContentsSendB).toHaveBeenCalledWith(
      IPC_CHANNELS.STREAMING_TTS_CHANGED,
      true,
    );
  });

  it('handler coerces non-boolean payload via !! (matches Phase 52 SEXT pattern)', async () => {
    setupSettingsHandlers(fakeMainWindow);
    const handler = getHandler(IPC_CHANNELS.STREAMING_TTS_SET)!;

    // !!'true' === true → handler must coerce and persist as true
    await handler(null, 'truthy-string');

    expect(setStreamingTtsEnabledMock).toHaveBeenCalledWith(true);
    expect(fakeWebContentsSendA).toHaveBeenCalledWith(
      IPC_CHANNELS.STREAMING_TTS_CHANGED,
      true,
    );
  });
});
