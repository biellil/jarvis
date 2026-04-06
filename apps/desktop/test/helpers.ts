/**
 * Test Helpers - Mocks for Electron APIs
 *
 * Unit tests mock Electron APIs to avoid launching full Electron process.
 * These mocks are deterministic and fast.
 */
import { vi } from 'vitest';

// Mock BrowserWindow constructor and instance
export function createMockBrowserWindow() {
  const mockWebContents = {
    openDevTools: vi.fn(),
  };

  const mockWindow = {
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    show: vi.fn(),
    once: vi.fn((event: string, callback: () => void) => {
      if (event === 'ready-to-show') {
        // Simulate ready-to-show immediately for tests
        callback();
      }
    }),
    on: vi.fn(),
    webContents: mockWebContents,
  };

  return mockWindow;
}

// Mock ipcMain for handler tests
export function createMockIpcMain() {
  const handlers = new Map<string, Function>();

  return {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers.set(channel, handler);
    }),
    // Helper to invoke a registered handler in tests
    __invokeHandler: async (channel: string, ...args: unknown[]) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`No handler for channel: ${channel}`);
      return handler({}, ...args);
    },
  };
}

// Mock contextBridge for preload tests
export function createMockContextBridge() {
  const exposed = new Map<string, unknown>();

  return {
    exposeInMainWorld: vi.fn((key: string, api: unknown) => {
      exposed.set(key, api);
    }),
    // Helper to get exposed API in tests
    __getExposed: (key: string) => exposed.get(key),
  };
}

// Mock ipcRenderer for preload tests
export function createMockIpcRenderer() {
  return {
    invoke: vi.fn(),
  };
}
