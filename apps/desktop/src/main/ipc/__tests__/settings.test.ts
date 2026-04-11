/**
 * Wake word pause IPC handler tests — Phase 23 Plan 02 (D-03, D-06)
 *
 * Cobre:
 *  - Handler `wakeWord:get-paused` registrado e retornando o valor do store
 *  - Helper broadcastPauseToggle envia para TODAS as BrowserWindows com o
 *    canal `wakeWord:pause-toggle` e o payload correto
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock do store — import relativo ao arquivo sob teste.
const getWakeWordPausedMock = vi.fn<[], boolean>(() => false);
vi.mock('../../store', () => ({
  getWakeWordPaused: () => getWakeWordPausedMock(),
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
      setupSettingsHandlers();
      expect(ipcHandleMock).toHaveBeenCalledTimes(1);
      expect(ipcHandleMock).toHaveBeenCalledWith(
        IPC_CHANNELS.WAKE_WORD_GET_PAUSED,
        expect.any(Function)
      );
    });

    it('handler returns getWakeWordPaused() value', () => {
      getWakeWordPausedMock.mockReturnValue(true);
      setupSettingsHandlers();

      const [, handler] = ipcHandleMock.mock.calls[0] as [
        string,
        () => boolean
      ];
      expect(handler()).toBe(true);
      expect(getWakeWordPausedMock).toHaveBeenCalled();
    });

    it('handler returns false when store is default', () => {
      getWakeWordPausedMock.mockReturnValue(false);
      setupSettingsHandlers();

      const [, handler] = ipcHandleMock.mock.calls[0] as [
        string,
        () => boolean
      ];
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
