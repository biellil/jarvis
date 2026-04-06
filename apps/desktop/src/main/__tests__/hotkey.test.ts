/**
 * Hotkey Module Tests
 *
 * Tests for global hotkey registration, persistence, and management
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { globalShortcut, BrowserWindow } from 'electron';

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

// Mock electron globalShortcut module
vi.mock('electron', () => ({
  globalShortcut: {
    register: vi.fn(() => true),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
  },
  BrowserWindow: vi.fn(),
}));

describe('Hotkey Module', () => {
  let mockWindow: any;

  beforeEach(async () => {
    // Reset module cache to get fresh imports
    vi.resetModules();
    // Reset mock store
    const Store = (await import('electron-store')).default;
    (Store as any).__resetStore();

    // Reset globalShortcut mocks
    vi.mocked(globalShortcut.register).mockClear();
    vi.mocked(globalShortcut.register).mockReturnValue(true);
    vi.mocked(globalShortcut.unregister).mockClear();
    vi.mocked(globalShortcut.unregisterAll).mockClear();

    // Create mock window
    mockWindow = {
      show: vi.fn(),
      hide: vi.fn(),
      isVisible: vi.fn(() => false),
    };
  });

  describe('registerHotkey', () => {
    it('should return true when registration succeeds', async () => {
      const { registerHotkey } = await import('../hotkey');
      const result = registerHotkey(mockWindow);

      expect(result).toBe(true);
      expect(globalShortcut.register).toHaveBeenCalled();
    });

    it('should return false when hotkey is already taken', async () => {
      // Mock registration failure
      vi.mocked(globalShortcut.register).mockReturnValue(false);

      const { registerHotkey } = await import('../hotkey');
      const result = registerHotkey(mockWindow);

      expect(result).toBe(false);
    });

    it('should use default hotkey CmdOrCtrl+Shift+J when no stored preference', async () => {
      const { registerHotkey } = await import('../hotkey');
      registerHotkey(mockWindow);

      expect(globalShortcut.register).toHaveBeenCalledWith(
        'CmdOrCtrl+Shift+J',
        expect.any(Function)
      );
    });

    it('should toggle window visibility when hotkey is pressed', async () => {
      let hotkeyCallback: (() => void) | undefined;
      vi.mocked(globalShortcut.register).mockImplementation((accelerator, callback) => {
        hotkeyCallback = callback;
        return true;
      });

      const { registerHotkey } = await import('../hotkey');
      registerHotkey(mockWindow);

      // Window is hidden initially
      mockWindow.isVisible.mockReturnValue(false);
      hotkeyCallback?.();
      expect(mockWindow.show).toHaveBeenCalled();

      // Window is visible after show
      mockWindow.isVisible.mockReturnValue(true);
      hotkeyCallback?.();
      expect(mockWindow.hide).toHaveBeenCalled();
    });
  });

  describe('changeHotkey', () => {
    it('should unregister old hotkey and register new one', async () => {
      const { registerHotkey, changeHotkey } = await import('../hotkey');

      // Register initial hotkey
      registerHotkey(mockWindow);
      expect(globalShortcut.register).toHaveBeenCalledWith(
        'CmdOrCtrl+Shift+J',
        expect.any(Function)
      );

      // Change to new hotkey
      vi.mocked(globalShortcut.register).mockClear();
      const result = changeHotkey('CmdOrCtrl+Alt+J', mockWindow);

      expect(globalShortcut.unregister).toHaveBeenCalledWith('CmdOrCtrl+Shift+J');
      expect(globalShortcut.register).toHaveBeenCalledWith(
        'CmdOrCtrl+Alt+J',
        expect.any(Function)
      );
      expect(result).toBe(true);
    });

    it('should return false if new hotkey registration fails', async () => {
      const { registerHotkey, changeHotkey } = await import('../hotkey');

      registerHotkey(mockWindow);

      // Mock new registration failure
      vi.mocked(globalShortcut.register).mockReturnValue(false);
      const result = changeHotkey('CmdOrCtrl+Alt+J', mockWindow);

      expect(result).toBe(false);
    });
  });

  describe('persistence', () => {
    it('should save hotkey preference to store when changed', async () => {
      const Store = (await import('electron-store')).default;
      const storeInstance = new Store();

      const { changeHotkey } = await import('../hotkey');
      changeHotkey('CmdOrCtrl+Alt+J', mockWindow);

      const saved = storeInstance.get('hotkey') as { accelerator: string };
      expect(saved).toEqual({ accelerator: 'CmdOrCtrl+Alt+J' });
    });

    it('should restore saved hotkey on next registration', async () => {
      const Store = (await import('electron-store')).default;
      const storeInstance = new Store();
      storeInstance.set('hotkey', { accelerator: 'CmdOrCtrl+Shift+Space' });

      const { registerHotkey } = await import('../hotkey');
      registerHotkey(mockWindow);

      expect(globalShortcut.register).toHaveBeenCalledWith(
        'CmdOrCtrl+Shift+Space',
        expect.any(Function)
      );
    });
  });

  describe('unregisterAll', () => {
    it('should unregister all hotkeys', async () => {
      const { registerHotkey, unregisterAll } = await import('../hotkey');

      registerHotkey(mockWindow);
      unregisterAll();

      expect(globalShortcut.unregisterAll).toHaveBeenCalled();
    });
  });
});
