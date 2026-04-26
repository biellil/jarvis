/**
 * alwaysListening.test.ts — AlwaysListeningStrategy main coordinator tests
 *
 * Phase 40 — Always-Listening + Intent Classifier (Plan 40-05)
 *
 * Cobertura:
 *  - VLISTEN-01 — lifecycle do strategy (start/stop/dispose, IPC START/STOP)
 *  - VLISTEN-04 — IPC handler para slider VAD threshold + Settings field
 *  - D-01 — IPC pub/sub renderer ↔ main para always-listening:utterance
 *  - D-04 — lazy lifecycle: handlers só ficam registrados durante captura
 *  - D-15 — pre-download background do modelo classifier
 *  - D-16 — falha de download não trava startup (degraded event)
 *
 * Threat coverage:
 *  - T-40-VAD (Tampering): clamp [300, 800] no IPC handler
 *  - T-40-DEGRADE (DoS): start fail → onDegraded callback (sem stuck mode)
 *  - T-40-MIC (DoS): handlers removidos em stop() — sem fantasmas
 *  - T-40-MODEL-DL (DoS): DL fail → degraded event, não trava app
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================
// Mock electron — capturamos ipcMain methods + BrowserWindow
// vi.hoisted: vi.mock é içado para o topo, então qualquer estado capturado
// pelo factory precisa ser declarado em vi.hoisted (também içado).
// ============================================

interface IpcListenerEntry {
  channel: string;
  handler: (...args: unknown[]) => unknown;
}

const { ipcListeners, ipcInvokeHandlers, ipcOnceListeners } = vi.hoisted(() => ({
  ipcListeners: [] as IpcListenerEntry[],
  ipcInvokeHandlers: new Map<string, (...args: unknown[]) => unknown>(),
  ipcOnceListeners: [] as IpcListenerEntry[],
}));

vi.mock('electron', () => {
  return {
    ipcMain: {
      on: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        ipcListeners.push({ channel, handler });
      }),
      off: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        const idx = ipcListeners.findIndex(
          (l) => l.channel === channel && l.handler === handler,
        );
        if (idx >= 0) ipcListeners.splice(idx, 1);
      }),
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        ipcInvokeHandlers.set(channel, handler);
      }),
      removeHandler: vi.fn((channel: string) => {
        ipcInvokeHandlers.delete(channel);
      }),
      once: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        ipcOnceListeners.push({ channel, handler });
      }),
    },
  };
});

// ============================================
// Mock electron-store
// ============================================

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
      static __resetStore() {
        mockStore = {};
      }
      static __getBackingStore() {
        return mockStore;
      }
    },
  };
});

// ============================================
// Mock voiceHandler — capturamos chamadas ao handleAudio
// vi.hoisted: necessário porque vi.mock é içado antes das declarações de top-level.
// ============================================

const { handleAudioMock } = vi.hoisted(() => ({
  handleAudioMock: vi.fn(),
}));

vi.mock('../../voiceInput/voiceHandler.js', () => ({
  handleAudio: handleAudioMock,
  initializeTTSProvider: vi.fn(),
  reinitializeTTS: vi.fn(),
}));

// ============================================
// Imports after mocks
// ============================================

import { ipcMain } from 'electron';
import Store from 'electron-store';
import {
  AlwaysListeningStrategy,
  scheduleModelPreDownload,
  type AlwaysListeningStrategyDeps,
} from '../../voiceMode/strategies/alwaysListening';
import { IPC_CHANNELS, type VoiceModeDegradedEvent } from '../../../shared/ipc-types';
import type { VoiceHandlerDeps } from '../../voiceInput/voiceHandler.js';
import type { BackendConfig } from '../../backend-client.js';

// ============================================
// Helpers
// ============================================

function makeMainWindow() {
  return {
    webContents: {
      send: vi.fn(),
    },
    isDestroyed: vi.fn().mockReturnValue(false),
  };
}

function makeVoiceHandlerDeps(): VoiceHandlerDeps {
  const config: BackendConfig = {
    backendUrl: 'http://localhost:8001',
    apiKey: 'test-key',
  };
  return {
    config,
    selectedModel: 'base' as const,
    ttsProvider: {
      name: 'test-tts' as never,
      synthesize: vi.fn().mockResolvedValue({ audio: Buffer.from([]), format: 'mp3' }),
    },
  };
}

function makeStrategyDeps(
  overrides: Partial<AlwaysListeningStrategyDeps> = {},
): AlwaysListeningStrategyDeps {
  return {
    mainWindow: (overrides.mainWindow ?? makeMainWindow()) as never,
    voiceHandlerDeps: overrides.voiceHandlerDeps ?? makeVoiceHandlerDeps(),
    onDegraded: overrides.onDegraded ?? vi.fn(),
  };
}

beforeEach(() => {
  ipcListeners.length = 0;
  ipcInvokeHandlers.clear();
  ipcOnceListeners.length = 0;
  handleAudioMock.mockReset();
  handleAudioMock.mockResolvedValue({ success: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Store as any).__resetStore();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ============================================
// Tests — VoiceCaptureStrategy interface compliance
// ============================================

describe('AlwaysListeningStrategy — main coordinator (VLISTEN-01, D-01)', () => {
  describe('VoiceCaptureStrategy interface compliance', () => {
    it('implements start() → sends ALWAYS_LISTENING_START IPC to renderer', async () => {
      const mainWindow = makeMainWindow();
      const strategy = new AlwaysListeningStrategy(makeStrategyDeps({ mainWindow: mainWindow as never }));

      await strategy.start();

      expect(mainWindow.webContents.send).toHaveBeenCalledWith(
        IPC_CHANNELS.ALWAYS_LISTENING_START,
        expect.objectContaining({
          negativeFramesToClose: expect.any(Number),
          vadThresholdMs: expect.any(Number),
        }),
      );
    });

    it('implements stop() → sends ALWAYS_LISTENING_STOP IPC to renderer', async () => {
      const mainWindow = makeMainWindow();
      const strategy = new AlwaysListeningStrategy(makeStrategyDeps({ mainWindow: mainWindow as never }));

      await strategy.start();
      mainWindow.webContents.send.mockClear();
      await strategy.stop();

      expect(mainWindow.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.ALWAYS_LISTENING_STOP);
    });

    it('implements dispose() → stops + cleans up IPC listeners', async () => {
      const strategy = new AlwaysListeningStrategy(makeStrategyDeps());
      await strategy.start();

      // Antes do dispose: handlers registrados
      expect(ipcListeners.some((l) => l.channel === IPC_CHANNELS.ALWAYS_LISTENING_UTTERANCE)).toBe(true);
      expect(ipcInvokeHandlers.has(IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD)).toBe(true);

      await strategy.dispose();

      // Depois do dispose: handlers limpos (T-40-MIC: sem fantasmas)
      expect(ipcListeners.some((l) => l.channel === IPC_CHANNELS.ALWAYS_LISTENING_UTTERANCE)).toBe(false);
      expect(ipcInvokeHandlers.has(IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD)).toBe(false);
    });

    it('getStatus() returns idle initially', () => {
      const strategy = new AlwaysListeningStrategy(makeStrategyDeps());
      expect(strategy.getStatus()).toBe('idle');
    });

    it('getStatus() returns capturing after start() succeeds', async () => {
      const strategy = new AlwaysListeningStrategy(makeStrategyDeps());
      await strategy.start();
      expect(strategy.getStatus()).toBe('capturing');
    });

    it('getStatus() returns idle after stop()', async () => {
      const strategy = new AlwaysListeningStrategy(makeStrategyDeps());
      await strategy.start();
      await strategy.stop();
      expect(strategy.getStatus()).toBe('idle');
    });
  });

  // ============================================
  // IPC lifecycle (D-01, D-04)
  // ============================================

  describe('IPC lifecycle (D-01, D-04)', () => {
    it('registers ipcMain handler for ALWAYS_LISTENING_UTTERANCE on start()', async () => {
      const strategy = new AlwaysListeningStrategy(makeStrategyDeps());
      await strategy.start();

      expect(ipcMain.on).toHaveBeenCalledWith(
        IPC_CHANNELS.ALWAYS_LISTENING_UTTERANCE,
        expect.any(Function),
      );
      expect(ipcListeners.some((l) => l.channel === IPC_CHANNELS.ALWAYS_LISTENING_UTTERANCE)).toBe(true);
    });

    it('removes ipcMain handler for ALWAYS_LISTENING_UTTERANCE on dispose()', async () => {
      const strategy = new AlwaysListeningStrategy(makeStrategyDeps());
      await strategy.start();
      await strategy.dispose();

      expect(ipcMain.off).toHaveBeenCalledWith(
        IPC_CHANNELS.ALWAYS_LISTENING_UTTERANCE,
        expect.any(Function),
      );
      expect(ipcListeners.some((l) => l.channel === IPC_CHANNELS.ALWAYS_LISTENING_UTTERANCE)).toBe(false);
    });

    it('always-listening:utterance payload dispatched to voiceHandler.handleAudio pipeline', async () => {
      const voiceHandlerDeps = makeVoiceHandlerDeps();
      const strategy = new AlwaysListeningStrategy(makeStrategyDeps({ voiceHandlerDeps }));
      await strategy.start();

      // Emula evento IPC que o renderer dispara
      const utteranceListener = ipcListeners.find(
        (l) => l.channel === IPC_CHANNELS.ALWAYS_LISTENING_UTTERANCE,
      );
      expect(utteranceListener).toBeDefined();

      const wavBytes = new Uint8Array([1, 2, 3, 4, 5]);
      utteranceListener!.handler({} as Electron.IpcMainEvent, {
        wavBuffer: wavBytes,
        timestamp: Date.now(),
      });

      // Aguarda o microtask do `void this.processUtterance(...)` propagar
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handleAudioMock).toHaveBeenCalledTimes(1);
      // Conversão Uint8Array → Buffer com mesmos bytes
      const [bufferArg, depsArg] = handleAudioMock.mock.calls[0]!;
      expect(Buffer.isBuffer(bufferArg)).toBe(true);
      expect((bufferArg as Buffer).length).toBe(wavBytes.length);
      expect(depsArg).toBe(voiceHandlerDeps);
    });
  });
});

// ============================================
// IPC handler: VAD threshold (VLISTEN-04, T-40-VAD)
// ============================================

describe('IPC handler: always-listening:vad-threshold (VLISTEN-04, T-40-VAD)', () => {
  it('registers ipcMain.handle for ALWAYS_LISTENING_VAD_THRESHOLD', async () => {
    const strategy = new AlwaysListeningStrategy(makeStrategyDeps());
    await strategy.start();

    expect(ipcMain.handle).toHaveBeenCalledWith(
      IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD,
      expect.any(Function),
    );
    expect(ipcInvokeHandlers.has(IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD)).toBe(true);
  });

  it('clamps incoming ms to range [300, 800] — values below 300 become 300', async () => {
    const strategy = new AlwaysListeningStrategy(makeStrategyDeps());
    await strategy.start();

    const handler = ipcInvokeHandlers.get(IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD)!;
    const result = (await handler({} as Electron.IpcMainInvokeEvent, 100)) as {
      success: boolean;
      clampedMs: number;
    };

    expect(result.clampedMs).toBe(300);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backing = (Store as any).__getBackingStore();
    expect(backing['vadSilenceThresholdMs']).toBe(300);
  });

  it('clamps incoming ms to range [300, 800] — values above 800 become 800', async () => {
    const strategy = new AlwaysListeningStrategy(makeStrategyDeps());
    await strategy.start();

    const handler = ipcInvokeHandlers.get(IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD)!;
    const result = (await handler({} as Electron.IpcMainInvokeEvent, 9999)) as {
      success: boolean;
      clampedMs: number;
    };

    expect(result.clampedMs).toBe(800);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backing = (Store as any).__getBackingStore();
    expect(backing['vadSilenceThresholdMs']).toBe(800);
  });

  it('saves clamped value to store via setVadSilenceThresholdMs', async () => {
    const strategy = new AlwaysListeningStrategy(makeStrategyDeps());
    await strategy.start();

    const handler = ipcInvokeHandlers.get(IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD)!;
    await handler({} as Electron.IpcMainInvokeEvent, 600);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backing = (Store as any).__getBackingStore();
    expect(backing['vadSilenceThresholdMs']).toBe(600);
  });

  it('sends ALWAYS_LISTENING_VAD_THRESHOLD broadcast to mainWindow after clamp', async () => {
    const mainWindow = makeMainWindow();
    const strategy = new AlwaysListeningStrategy(makeStrategyDeps({ mainWindow: mainWindow as never }));
    await strategy.start();

    mainWindow.webContents.send.mockClear();
    const handler = ipcInvokeHandlers.get(IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD)!;
    await handler({} as Electron.IpcMainInvokeEvent, 700);

    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD,
      700,
    );
  });

  it('handler is a no-op when always-listening is not active (does not crash)', async () => {
    const strategy = new AlwaysListeningStrategy(makeStrategyDeps());
    await strategy.start();
    const handler = ipcInvokeHandlers.get(IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD)!;
    await strategy.stop();

    // Após stop(), o handler foi removido — chamar diretamente apenas ainda
    // assim não pode crashar. Validamos via ipcInvokeHandlers que o handler
    // foi de fato removido (sem rodar handler em si).
    expect(ipcInvokeHandlers.has(IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD)).toBe(false);

    // E o handler salvo localmente, se chamado fora do lifecycle, não joga.
    await expect(handler({} as Electron.IpcMainInvokeEvent, 500)).resolves.toMatchObject({
      success: true,
    });
  });
});

// ============================================
// IPC handler: settings:get — vadSilenceThresholdMs field (VLISTEN-04)
// ============================================

describe('IPC handler: settings:get — vadSilenceThresholdMs field (VLISTEN-04)', () => {
  beforeEach(async () => {
    // Carrega settings handlers no contexto isolado (sem dependência da strategy)
    vi.resetModules();
  });

  it('settings:get response includes vadSilenceThresholdMs field', async () => {
    const { setupSettingsHandlers } = await import('../../ipc/settings');
    const mainWindow = makeMainWindow() as never as Electron.BrowserWindow;
    setupSettingsHandlers(mainWindow);

    const handler = ipcInvokeHandlers.get(IPC_CHANNELS.SETTINGS_GET);
    expect(handler).toBeDefined();
    const data = (await handler!()) as { vadSilenceThresholdMs?: number };
    expect(data).toHaveProperty('vadSilenceThresholdMs');
    expect(typeof data.vadSilenceThresholdMs).toBe('number');
  });

  it('vadSilenceThresholdMs defaults to 500 when store has no value (v1.8 upgrade path)', async () => {
    const { setupSettingsHandlers } = await import('../../ipc/settings');
    const mainWindow = makeMainWindow() as never as Electron.BrowserWindow;
    setupSettingsHandlers(mainWindow);

    const handler = ipcInvokeHandlers.get(IPC_CHANNELS.SETTINGS_GET)!;
    const data = (await handler()) as { vadSilenceThresholdMs: number };
    expect(data.vadSilenceThresholdMs).toBe(500);
  });

  it('vadSilenceThresholdMs reflects stored value when set', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backing = (Store as any).__getBackingStore();
    backing['vadSilenceThresholdMs'] = 650;

    const { setupSettingsHandlers } = await import('../../ipc/settings');
    const mainWindow = makeMainWindow() as never as Electron.BrowserWindow;
    setupSettingsHandlers(mainWindow);

    const handler = ipcInvokeHandlers.get(IPC_CHANNELS.SETTINGS_GET)!;
    const data = (await handler()) as { vadSilenceThresholdMs: number };
    expect(data.vadSilenceThresholdMs).toBe(650);
  });
});

// ============================================
// Pre-download background (D-15, T-40-MODEL-DL, D-16)
// ============================================

describe('Pre-download background (D-15, T-40-MODEL-DL)', () => {
  it('scheduleModelPreDownload() sends preload signal to renderer after delay', () => {
    vi.useFakeTimers();
    const mainWindow = makeMainWindow();
    const onFail = vi.fn();

    scheduleModelPreDownload(mainWindow as never, onFail);

    // Antes do delay: nenhum send
    expect(mainWindow.webContents.send).not.toHaveBeenCalled();

    // Avança o timer
    vi.advanceTimersByTime(5_000);

    expect(mainWindow.webContents.send).toHaveBeenCalledWith('always-listening:preload-model');
  });

  it('download failure does NOT throw — emits voiceMode:degraded with reason: classifier-download-fail (D-16)', () => {
    vi.useFakeTimers();
    const mainWindow = makeMainWindow();
    const onFail = vi.fn();

    scheduleModelPreDownload(mainWindow as never, onFail);
    vi.advanceTimersByTime(5_000);

    // Encontra o once listener registrado e dispara
    const failListener = ipcOnceListeners.find(
      (l) => l.channel === 'always-listening:model-download-failed',
    );
    expect(failListener).toBeDefined();

    failListener!.handler({} as Electron.IpcMainEvent);

    expect(onFail).toHaveBeenCalledTimes(1);
    const event = onFail.mock.calls[0]![0] as VoiceModeDegradedEvent;
    expect(event.attemptedMode).toBe('always-listening');
    expect(event.reason).toBe('classifier-download-fail');
    expect(typeof event.message).toBe('string');
    expect(event.message.length).toBeGreaterThan(0);
  });

  it('download success does NOT emit any event (silent success)', () => {
    vi.useFakeTimers();
    const mainWindow = makeMainWindow();
    const onFail = vi.fn();

    scheduleModelPreDownload(mainWindow as never, onFail);
    vi.advanceTimersByTime(5_000);

    // Renderer não envia mensagem de falha — caller nunca recebe degraded.
    expect(onFail).not.toHaveBeenCalled();
  });

  it('does nothing if mainWindow is destroyed before delay elapses', () => {
    vi.useFakeTimers();
    const mainWindow = makeMainWindow();
    mainWindow.isDestroyed.mockReturnValue(true);
    const onFail = vi.fn();

    scheduleModelPreDownload(mainWindow as never, onFail);
    vi.advanceTimersByTime(5_000);

    expect(mainWindow.webContents.send).not.toHaveBeenCalled();
  });
});
