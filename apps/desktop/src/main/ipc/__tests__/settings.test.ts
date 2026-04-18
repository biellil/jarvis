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
const getWhisperModelOverrideMock = vi.fn<[], 'auto' | 'tiny' | 'base' | 'small' | 'medium' | 'large-v3-turbo'>(() => 'auto');
const setTtsProviderMock = vi.fn();
const setTtsApiKeyMock = vi.fn();
const setWhisperModelOverrideMock = vi.fn();

vi.mock('../../store', () => ({
  getWakeWordPaused: () => getWakeWordPausedMock(),
  getPttHotkey: () => getPttHotkeyMock(),
  getTtsProvider: () => getTtsProviderMock(),
  getTtsApiKey: () => getTtsApiKeyMock(),
  getWhisperModelOverride: () => getWhisperModelOverrideMock(),
  setTtsProvider: (...args: unknown[]) => setTtsProviderMock(...args),
  setTtsApiKey: (...args: unknown[]) => setTtsApiKeyMock(...args),
  setWhisperModelOverride: (...args: unknown[]) => setWhisperModelOverrideMock(...args),
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

// Mock do electron — capturamos tanto ipcMain.handle quanto
// BrowserWindow.getAllWindows para inspecionar o broadcast.
const ipcHandleMock = vi.fn();
const fakeWebContentsSendA = vi.fn();
const fakeWebContentsSendB = vi.fn();
const getAllWindowsMock = vi.fn(() => [
  { webContents: { send: fakeWebContentsSendA } },
  { webContents: { send: fakeWebContentsSendB } },
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

// Fake mainWindow for Phase 34 tests
const fakeMainWindow = {} as Electron.BrowserWindow;

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
    getPttHotkeyMock.mockReturnValue('CmdOrCtrl+Space');
    getTtsProviderMock.mockReturnValue('elevenlabs');
    getTtsApiKeyMock.mockReturnValue('');
    getWhisperModelOverrideMock.mockReturnValue('auto');
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
        whisperModelOverride: 'auto',
      });
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
  });
});
