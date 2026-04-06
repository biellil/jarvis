/**
 * Security Configuration Tests
 *
 * These tests verify that security settings are correctly configured
 * in the BrowserWindow. They don't launch Electron - they assert on
 * the configuration object that would be passed to BrowserWindow.
 *
 * DESK-01: contextIsolation: true, nodeIntegration: false
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createMockBrowserWindow } from '../../../test/helpers';

// We need to test the actual configuration values, not the mocked behavior.
// The approach: import the main module and verify the config it uses.
// Since main has side effects (app.whenReady), we mock electron first.

describe('BrowserWindow Security Configuration', () => {
  let capturedConfig: Record<string, unknown> | null = null;

  beforeEach(() => {
    capturedConfig = null;

    // Mock electron module before importing main
    vi.doMock('electron', () => ({
      app: {
        isPackaged: false,
        whenReady: vi.fn(() => Promise.resolve()),
        on: vi.fn(),
        quit: vi.fn(),
      },
      BrowserWindow: vi.fn((config: Record<string, unknown>) => {
        capturedConfig = config;
        return createMockBrowserWindow();
      }),
    }));
  });

  test('contextIsolation must be true', async () => {
    // Import after mocking
    const { default: createWindow } = await import('../index');

    // The actual assertion - if this fails, DESK-01 is violated
    expect(capturedConfig?.webPreferences).toBeDefined();
    const webPrefs = capturedConfig?.webPreferences as Record<string, unknown>;
    expect(webPrefs.contextIsolation).toBe(true);
  });

  test('nodeIntegration must be false', async () => {
    const { default: createWindow } = await import('../index');

    const webPrefs = capturedConfig?.webPreferences as Record<string, unknown>;
    expect(webPrefs.nodeIntegration).toBe(false);
  });

  test('sandbox must be true', async () => {
    const { default: createWindow } = await import('../index');

    const webPrefs = capturedConfig?.webPreferences as Record<string, unknown>;
    expect(webPrefs.sandbox).toBe(true);
  });

  test('webSecurity must be true', async () => {
    const { default: createWindow } = await import('../index');

    const webPrefs = capturedConfig?.webPreferences as Record<string, unknown>;
    expect(webPrefs.webSecurity).toBe(true);
  });

  test('allowRunningInsecureContent must be false', async () => {
    const { default: createWindow } = await import('../index');

    const webPrefs = capturedConfig?.webPreferences as Record<string, unknown>;
    expect(webPrefs.allowRunningInsecureContent).toBe(false);
  });

  test('preload script path is configured', async () => {
    const { default: createWindow } = await import('../index');

    const webPrefs = capturedConfig?.webPreferences as Record<string, unknown>;
    expect(webPrefs.preload).toBeDefined();
    expect(typeof webPrefs.preload).toBe('string');
    expect(webPrefs.preload).toContain('preload');
  });

  test('show is false to prevent white flash', async () => {
    const { default: createWindow } = await import('../index');

    expect(capturedConfig?.show).toBe(false);
  });

  test('backgroundColor matches UI-SPEC slate-900', async () => {
    const { default: createWindow } = await import('../index');

    expect(capturedConfig?.backgroundColor).toBe('#0F172A');
  });
});

describe('IPC Channel Whitelist', () => {
  test('only known channels are registered', async () => {
    const registeredChannels: string[] = [];

    vi.doMock('electron', () => ({
      ipcMain: {
        handle: vi.fn((channel: string) => {
          registeredChannels.push(channel);
        }),
      },
    }));

    // Import IPC setup
    const { setupIpcHandlers } = await import('../ipc');
    setupIpcHandlers();

    // Verify only expected channels
    expect(registeredChannels).toContain('chat:send-text');
    // Should not contain arbitrary channels
    expect(registeredChannels.length).toBe(1); // Only chat:send-text in Phase 9
  });
});
