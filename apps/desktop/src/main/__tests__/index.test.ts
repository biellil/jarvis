/**
 * Startup integration test: voiceHandler deps injection (Phase 31 — ARCH-06).
 *
 * Tests the conditional voiceHandler wiring in index.ts whenReady() block.
 * Does NOT test the full Electron app lifecycle — focused on the deps shape
 * passed to setupIpcHandlers based on USE_WHISPER_CPP env var.
 *
 * Pattern: vi.resetModules() in beforeEach + dynamic import INSIDE each it() body.
 * This is required because:
 *   - index.ts registers app.whenReady().then(...) at module load time
 *   - USE_WHISPER_CPP is read from process.env at module load time
 *   - Each test needs a fresh module to control the env var state
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use top-level vi.mock for electron and other heavy deps to keep them stable
// across dynamic imports. vi.doMock is used per-test to allow override.

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

afterEach(() => {
  delete process.env['USE_WHISPER_CPP'];
  vi.unstubAllGlobals();
});

describe('index.ts startup wiring — voiceHandler injection (ARCH-06)', () => {
  it('USE_WHISPER_CPP=true → setupIpcHandlers receives voiceHandler in deps', async () => {
    process.env['USE_WHISPER_CPP'] = 'true';

    // Capture the whenReady promise resolve
    let resolveWhenReady: () => void;
    const whenReadyPromise = new Promise<void>((resolve) => {
      resolveWhenReady = resolve;
    });

    const mockSetupIpcHandlers = vi.fn();

    vi.doMock('electron', () => ({
      app: {
        whenReady: vi.fn().mockReturnValue(whenReadyPromise),
        isPackaged: false,
        on: vi.fn(),
        exit: vi.fn(),
        quit: vi.fn(),
        getPath: vi.fn().mockReturnValue('/tmp/userData'),
        getAllWindows: vi.fn().mockReturnValue([]),
      },
      BrowserWindow: class MockBrowserWindow {
        loadURL = vi.fn();
        loadFile = vi.fn();
        show = vi.fn();
        once = vi.fn();
        on = vi.fn();
        setIgnoreMouseEvents = vi.fn();
        setPosition = vi.fn();
        isDestroyed = vi.fn().mockReturnValue(false);
        getPosition = vi.fn().mockReturnValue([100, 100]);
        static getAllWindows = vi.fn().mockReturnValue([]);
      },
      ipcMain: { handle: vi.fn(), on: vi.fn() },
      dialog: { showMessageBox: vi.fn() },
      screen: {
        getCursorScreenPoint: vi.fn().mockReturnValue({ x: 100, y: 100 }),
        getPrimaryDisplay: vi.fn().mockReturnValue({ bounds: { width: 1920, height: 1080 } }),
        getAllDisplays: vi.fn().mockReturnValue([{ bounds: { width: 1920, height: 1080, x: 0, y: 0 } }]),
      },
      session: {
        defaultSession: {
          setPermissionRequestHandler: vi.fn(),
          setPermissionCheckHandler: vi.fn(),
        },
      },
      globalShortcut: { register: vi.fn().mockReturnValue(true), unregisterAll: vi.fn() },
    }));

    vi.doMock('../ipc', () => ({ setupIpcHandlers: mockSetupIpcHandlers }));
    vi.doMock('../voiceInput/gpuDetection.js', () => ({
      initializeGpuDetection: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock('../voiceInput/vramDetection.js', () => ({
      detectVramAndSelectModel: vi.fn().mockResolvedValue('base'),
    }));
    vi.doMock('../voiceInput/tts/index.js', () => ({
      createTTSProvider: vi.fn().mockReturnValue({ name: 'murf', synthesize: vi.fn() }),
    }));
    vi.doMock('../backend-client', () => ({
      loadBackendConfig: vi.fn().mockReturnValue({ backendUrl: 'http://localhost:3000', apiKey: 'test-key' }),
      createBackendClient: vi.fn().mockReturnValue({}),
    }));
    vi.doMock('../sse-client', () => ({ openChatStream: vi.fn() }));
    vi.doMock('../action-executor', () => ({
      createActionExecutor: vi.fn().mockReturnValue({
        enqueue: vi.fn(),
        shutdown: vi.fn(async () => {}),
      }),
    }));
    vi.doMock('../actions', () => ({
      ACTION_HANDLERS: {},
      REQUIRES_CONFIRMATION: new Set(),
    }));
    vi.doMock('../position', () => ({
      calculateInitialPosition: vi.fn().mockReturnValue({ x: 0, y: 0 }),
      savePosition: vi.fn(),
    }));
    vi.doMock('../store', () => ({
      getOrbPosition: vi.fn().mockReturnValue(null),
      setOrbPosition: vi.fn(),
    }));
    vi.doMock('../tray', () => ({ createTray: vi.fn(), destroyTray: vi.fn() }));
    vi.doMock('../hotkey', () => ({
      registerHotkey: vi.fn().mockReturnValue(true),
      unregisterAll: vi.fn(),
    }));
    vi.doMock('../ptt-hotkey', () => ({
      registerPttHotkey: vi.fn().mockReturnValue(true),
      unregisterPttHotkey: vi.fn(),
    }));

    // Import index — this registers the whenReady().then() callback
    await import('../index.js');

    // Trigger the whenReady promise to fire the callback
    resolveWhenReady!();
    // Flush microtask queue to let the async callback complete
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(mockSetupIpcHandlers).toHaveBeenCalledTimes(1);
    const callArg = mockSetupIpcHandlers.mock.calls[0]?.[0];
    expect(callArg).toBeDefined();
    expect(callArg.voiceHandler).toBeDefined();
    expect(callArg.voiceHandler.selectedModel).toBe('base');
    expect(callArg.voiceHandler.ttsProvider).toBeDefined();
    expect(callArg.voiceHandler.ttsProvider.name).toBe('murf');
  });

  it('USE_WHISPER_CPP=false → setupIpcHandlers called WITHOUT voiceHandler', async () => {
    delete process.env['USE_WHISPER_CPP'];

    let resolveWhenReady: () => void;
    const whenReadyPromise = new Promise<void>((resolve) => {
      resolveWhenReady = resolve;
    });

    const mockSetupIpcHandlers = vi.fn();

    vi.doMock('electron', () => ({
      app: {
        whenReady: vi.fn().mockReturnValue(whenReadyPromise),
        isPackaged: false,
        on: vi.fn(),
        exit: vi.fn(),
        quit: vi.fn(),
        getPath: vi.fn().mockReturnValue('/tmp/userData'),
        getAllWindows: vi.fn().mockReturnValue([]),
      },
      BrowserWindow: class MockBrowserWindow {
        loadURL = vi.fn();
        loadFile = vi.fn();
        show = vi.fn();
        once = vi.fn();
        on = vi.fn();
        setIgnoreMouseEvents = vi.fn();
        setPosition = vi.fn();
        isDestroyed = vi.fn().mockReturnValue(false);
        getPosition = vi.fn().mockReturnValue([100, 100]);
        static getAllWindows = vi.fn().mockReturnValue([]);
      },
      ipcMain: { handle: vi.fn(), on: vi.fn() },
      dialog: { showMessageBox: vi.fn() },
      screen: {
        getCursorScreenPoint: vi.fn().mockReturnValue({ x: 100, y: 100 }),
        getPrimaryDisplay: vi.fn().mockReturnValue({ bounds: { width: 1920, height: 1080 } }),
        getAllDisplays: vi.fn().mockReturnValue([{ bounds: { width: 1920, height: 1080, x: 0, y: 0 } }]),
      },
      session: {
        defaultSession: {
          setPermissionRequestHandler: vi.fn(),
          setPermissionCheckHandler: vi.fn(),
        },
      },
      globalShortcut: { register: vi.fn().mockReturnValue(true), unregisterAll: vi.fn() },
    }));

    vi.doMock('../ipc', () => ({ setupIpcHandlers: mockSetupIpcHandlers }));
    vi.doMock('../voiceInput/gpuDetection.js', () => ({
      initializeGpuDetection: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock('../voiceInput/vramDetection.js', () => ({
      detectVramAndSelectModel: vi.fn().mockResolvedValue('base'),
    }));
    vi.doMock('../voiceInput/tts/index.js', () => ({
      createTTSProvider: vi.fn().mockReturnValue({ name: 'murf', synthesize: vi.fn() }),
    }));
    vi.doMock('../backend-client', () => ({
      loadBackendConfig: vi.fn().mockReturnValue({ backendUrl: 'http://localhost:3000', apiKey: 'test-key' }),
      createBackendClient: vi.fn().mockReturnValue({}),
    }));
    vi.doMock('../sse-client', () => ({ openChatStream: vi.fn() }));
    vi.doMock('../action-executor', () => ({
      createActionExecutor: vi.fn().mockReturnValue({
        enqueue: vi.fn(),
        shutdown: vi.fn(async () => {}),
      }),
    }));
    vi.doMock('../actions', () => ({
      ACTION_HANDLERS: {},
      REQUIRES_CONFIRMATION: new Set(),
    }));
    vi.doMock('../position', () => ({
      calculateInitialPosition: vi.fn().mockReturnValue({ x: 0, y: 0 }),
      savePosition: vi.fn(),
    }));
    vi.doMock('../store', () => ({
      getOrbPosition: vi.fn().mockReturnValue(null),
      setOrbPosition: vi.fn(),
    }));
    vi.doMock('../tray', () => ({ createTray: vi.fn(), destroyTray: vi.fn() }));
    vi.doMock('../hotkey', () => ({
      registerHotkey: vi.fn().mockReturnValue(true),
      unregisterAll: vi.fn(),
    }));
    vi.doMock('../ptt-hotkey', () => ({
      registerPttHotkey: vi.fn().mockReturnValue(true),
      unregisterPttHotkey: vi.fn(),
    }));

    await import('../index.js');

    // index.ts calls process.loadEnvFile() at module load — undo .env override
    // so the whenReady callback reads USE_WHISPER_CPP as unset (false path)
    delete process.env['USE_WHISPER_CPP'];

    resolveWhenReady!();
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(mockSetupIpcHandlers).toHaveBeenCalledTimes(1);
    const callArg = mockSetupIpcHandlers.mock.calls[0]?.[0];
    expect(callArg).toBeDefined();
    expect(callArg.voiceHandler).toBeUndefined();
  });

  it('VRAM detection throws → continues with base model fallback, no crash', async () => {
    process.env['USE_WHISPER_CPP'] = 'true';

    let resolveWhenReady: () => void;
    const whenReadyPromise = new Promise<void>((resolve) => {
      resolveWhenReady = resolve;
    });

    const mockSetupIpcHandlers = vi.fn();

    vi.doMock('electron', () => ({
      app: {
        whenReady: vi.fn().mockReturnValue(whenReadyPromise),
        isPackaged: false,
        on: vi.fn(),
        exit: vi.fn(),
        quit: vi.fn(),
        getPath: vi.fn().mockReturnValue('/tmp/userData'),
        getAllWindows: vi.fn().mockReturnValue([]),
      },
      BrowserWindow: class MockBrowserWindow {
        loadURL = vi.fn();
        loadFile = vi.fn();
        show = vi.fn();
        once = vi.fn();
        on = vi.fn();
        setIgnoreMouseEvents = vi.fn();
        setPosition = vi.fn();
        isDestroyed = vi.fn().mockReturnValue(false);
        getPosition = vi.fn().mockReturnValue([100, 100]);
        static getAllWindows = vi.fn().mockReturnValue([]);
      },
      ipcMain: { handle: vi.fn(), on: vi.fn() },
      dialog: { showMessageBox: vi.fn() },
      screen: {
        getCursorScreenPoint: vi.fn().mockReturnValue({ x: 100, y: 100 }),
        getPrimaryDisplay: vi.fn().mockReturnValue({ bounds: { width: 1920, height: 1080 } }),
        getAllDisplays: vi.fn().mockReturnValue([{ bounds: { width: 1920, height: 1080, x: 0, y: 0 } }]),
      },
      session: {
        defaultSession: {
          setPermissionRequestHandler: vi.fn(),
          setPermissionCheckHandler: vi.fn(),
        },
      },
      globalShortcut: { register: vi.fn().mockReturnValue(true), unregisterAll: vi.fn() },
    }));

    vi.doMock('../ipc', () => ({ setupIpcHandlers: mockSetupIpcHandlers }));
    vi.doMock('../voiceInput/gpuDetection.js', () => ({
      initializeGpuDetection: vi.fn().mockResolvedValue(undefined),
    }));
    // VRAM detection throws — startup should handle gracefully with base fallback
    vi.doMock('../voiceInput/vramDetection.js', () => ({
      detectVramAndSelectModel: vi.fn().mockRejectedValue(new Error('vram detection failed')),
    }));
    vi.doMock('../voiceInput/tts/index.js', () => ({
      createTTSProvider: vi.fn().mockReturnValue({ name: 'murf', synthesize: vi.fn() }),
    }));
    vi.doMock('../backend-client', () => ({
      loadBackendConfig: vi.fn().mockReturnValue({ backendUrl: 'http://localhost:3000', apiKey: 'test-key' }),
      createBackendClient: vi.fn().mockReturnValue({}),
    }));
    vi.doMock('../sse-client', () => ({ openChatStream: vi.fn() }));
    vi.doMock('../action-executor', () => ({
      createActionExecutor: vi.fn().mockReturnValue({
        enqueue: vi.fn(),
        shutdown: vi.fn(async () => {}),
      }),
    }));
    vi.doMock('../actions', () => ({
      ACTION_HANDLERS: {},
      REQUIRES_CONFIRMATION: new Set(),
    }));
    vi.doMock('../position', () => ({
      calculateInitialPosition: vi.fn().mockReturnValue({ x: 0, y: 0 }),
      savePosition: vi.fn(),
    }));
    vi.doMock('../store', () => ({
      getOrbPosition: vi.fn().mockReturnValue(null),
      setOrbPosition: vi.fn(),
    }));
    vi.doMock('../tray', () => ({ createTray: vi.fn(), destroyTray: vi.fn() }));
    vi.doMock('../hotkey', () => ({
      registerHotkey: vi.fn().mockReturnValue(true),
      unregisterAll: vi.fn(),
    }));
    vi.doMock('../ptt-hotkey', () => ({
      registerPttHotkey: vi.fn().mockReturnValue(true),
      unregisterPttHotkey: vi.fn(),
    }));

    // Import should NOT throw
    await import('../index.js');

    resolveWhenReady!();
    // Give the async callback time to complete (including the VRAM rejection handling)
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    // Startup should continue — setupIpcHandlers called with base model fallback
    expect(mockSetupIpcHandlers).toHaveBeenCalledTimes(1);
    const callArg = mockSetupIpcHandlers.mock.calls[0]?.[0];
    expect(callArg).toBeDefined();
    // With VRAM error, selectedModel falls back to 'base' (see index.ts catch block)
    expect(callArg?.voiceHandler?.selectedModel).toBe('base');
  });
});
