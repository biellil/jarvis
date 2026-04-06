/**
 * Hotkey IPC Handler Tests
 *
 * Tests for hotkey status IPC handler
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain, globalShortcut } from 'electron';

// Mock electron-store
vi.mock('electron-store', () => {
  let mockStore: Record<string, unknown> = {};

  return {
    default: class Store {
      get(key: string) {
        return mockStore[key];
      }
      set(key: string, value: unknown) {
        mockStore[key] = value;
      }
      // Expose for test control
      static __resetStore() {
        mockStore = {};
      }
    },
  };
});

// Mock electron modules
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  globalShortcut: {
    isRegistered: vi.fn(() => true),
  },
}));

describe('Hotkey IPC Handlers', () => {
  beforeEach(async () => {
    // Reset module cache
    vi.resetModules();
    // Reset mock store
    const Store = (await import('electron-store')).default;
    (Store as any).__resetStore();

    // Reset mocks
    vi.mocked(ipcMain.handle).mockClear();
    vi.mocked(globalShortcut.isRegistered).mockClear();
    vi.mocked(globalShortcut.isRegistered).mockReturnValue(true);
  });

  describe('setupHotkeyHandlers', () => {
    it('should register HOTKEY_GET_STATUS handler', async () => {
      const { setupHotkeyHandlers } = await import('../ipc/hotkey');
      setupHotkeyHandlers();

      expect(ipcMain.handle).toHaveBeenCalledWith('hotkey:get-status', expect.any(Function));
    });
  });

  describe('HOTKEY_GET_STATUS handler', () => {
    it('should return success with default hotkey when no stored preference', async () => {
      const { setupHotkeyHandlers } = await import('../ipc/hotkey');
      setupHotkeyHandlers();

      // Get the handler function
      const handlerCall = vi.mocked(ipcMain.handle).mock.calls.find(
        (call) => call[0] === 'hotkey:get-status'
      );
      expect(handlerCall).toBeDefined();
      const handler = handlerCall![1];

      // Call handler
      const result = await handler({} as any);

      expect(result).toEqual({
        success: true,
        data: {
          accelerator: 'CmdOrCtrl+Shift+J',
          registered: true,
        },
      });
    });

    it('should return stored hotkey preference', async () => {
      const Store = (await import('electron-store')).default;
      const storeInstance = new Store();
      storeInstance.set('hotkey', { accelerator: 'CmdOrCtrl+Alt+J' });

      const { setupHotkeyHandlers } = await import('../ipc/hotkey');
      setupHotkeyHandlers();

      const handlerCall = vi.mocked(ipcMain.handle).mock.calls.find(
        (call) => call[0] === 'hotkey:get-status'
      );
      const handler = handlerCall![1];

      const result = await handler({} as any);

      expect(result).toEqual({
        success: true,
        data: {
          accelerator: 'CmdOrCtrl+Alt+J',
          registered: true,
        },
      });
    });

    it('should check if hotkey is actually registered', async () => {
      vi.mocked(globalShortcut.isRegistered).mockReturnValue(false);

      const { setupHotkeyHandlers } = await import('../ipc/hotkey');
      setupHotkeyHandlers();

      const handlerCall = vi.mocked(ipcMain.handle).mock.calls.find(
        (call) => call[0] === 'hotkey:get-status'
      );
      const handler = handlerCall![1];

      const result = await handler({} as any);

      expect(result).toEqual({
        success: true,
        data: {
          accelerator: 'CmdOrCtrl+Shift+J',
          registered: false,
        },
      });
      expect(globalShortcut.isRegistered).toHaveBeenCalledWith('CmdOrCtrl+Shift+J');
    });

    it('should return error on exception', async () => {
      vi.mocked(globalShortcut.isRegistered).mockImplementation(() => {
        throw new Error('Test error');
      });

      const { setupHotkeyHandlers } = await import('../ipc/hotkey');
      setupHotkeyHandlers();

      const handlerCall = vi.mocked(ipcMain.handle).mock.calls.find(
        (call) => call[0] === 'hotkey:get-status'
      );
      const handler = handlerCall![1];

      const result = await handler({} as any);

      expect(result).toEqual({
        success: false,
        error: 'Test error',
      });
    });
  });
});
