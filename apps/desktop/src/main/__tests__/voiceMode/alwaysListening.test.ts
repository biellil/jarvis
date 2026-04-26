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
// Mock ptt-hotkey — Phase 43 VPTT-03
// EventEmitter local controlado pelos testes; reset em beforeEach.
// ============================================

const { mockPttHotkeyEmitter } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter: EE } = require('events') as typeof import('events');
  const emitter = new EE();
  emitter.setMaxListeners(20);
  return { mockPttHotkeyEmitter: emitter };
});

vi.mock('../../ptt-hotkey.js', () => ({
  pttHotkeyEmitter: mockPttHotkeyEmitter,
  __resetPttHotkeyEmitterForTests: () => {
    mockPttHotkeyEmitter.removeAllListeners();
  },
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
  // Phase 43 VPTT-03: reset pttHotkeyEmitter entre testes
  mockPttHotkeyEmitter.removeAllListeners();
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

      // Antes do dispose: handler de utterance registrado.
      // NOTA Plan 06: handler ALWAYS_LISTENING_VAD_THRESHOLD agora vive em
      // ipc/settings.ts (registrado na app boot, sempre disponível) — não é
      // responsabilidade da strategy registrar/remover.
      expect(ipcListeners.some((l) => l.channel === IPC_CHANNELS.ALWAYS_LISTENING_UTTERANCE)).toBe(true);

      await strategy.dispose();

      // Depois do dispose: handler de utterance limpo (T-40-MIC: sem fantasmas).
      expect(ipcListeners.some((l) => l.channel === IPC_CHANNELS.ALWAYS_LISTENING_UTTERANCE)).toBe(false);
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
//
// NOTA Phase 40 Plan 06: O handler ALWAYS_LISTENING_VAD_THRESHOLD foi MOVIDO
// para `apps/desktop/src/main/ipc/settings.ts` (sempre disponível, mesmo fora
// de always-listening). A strategy não registra mais este handler — o slider
// de Settings opera independente do modo ativo.
//
// Cobertura do handler vive agora em
// `apps/desktop/src/main/ipc/__tests__/settings.test.ts` (suite Phase 40 Plan 06).
//
describe('IPC handler: always-listening:vad-threshold — moved to ipc/settings.ts (Plan 06)', () => {
  it('strategy.start() does NOT register VAD threshold handler (moved to settings.ts)', async () => {
    const strategy = new AlwaysListeningStrategy(makeStrategyDeps());
    await strategy.start();

    // Strategy não registra mais este handler; é responsabilidade de
    // setupSettingsHandlers em ipc/settings.ts (chamado em app boot).
    expect(ipcInvokeHandlers.has(IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD)).toBe(false);
  });

  it('strategy.stop() does NOT remove VAD threshold handler (not its responsibility)', async () => {
    const strategy = new AlwaysListeningStrategy(makeStrategyDeps());
    await strategy.start();
    await strategy.stop();

    // Mesmo após stop, qualquer handler externamente registrado não foi tocado
    // pela strategy — handler de settings.ts continua vivo entre mode switches.
    expect(ipcMain.removeHandler).not.toHaveBeenCalledWith(
      IPC_CHANNELS.ALWAYS_LISTENING_VAD_THRESHOLD,
    );
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

// ============================================================
// Phase 43 — VPTT-03 force-flush + pttHotkeyEmitter listener
// ============================================================
describe('VPTT-03 — force-flush behavior (Phase 43)', () => {
  beforeEach(() => {
    mockPttHotkeyEmitter.removeAllListeners();
  });

  describe('forceFlush() comportamento por estado (D-02)', () => {
    it('status="idle" → no-op silencioso (zero webContents.send chamadas)', async () => {
      const deps = makeStrategyDeps();
      const strategy = new AlwaysListeningStrategy(deps);
      // Sem start(), status === 'idle'
      strategy.forceFlush();
      // Verifica que NÃO foi chamado com FORCE_FLUSH (outros sends como
      // start/stop também são zero porque não start() foi chamado).
      const sendMock = deps.mainWindow.webContents.send as ReturnType<typeof vi.fn>;
      const forceFlushCalls = sendMock.mock.calls.filter(
        (args: unknown[]) => args[0] === 'always-listening:force-flush'
      );
      expect(forceFlushCalls).toHaveLength(0);
    });

    it('status="capturing" + inFlight=false → envia IPC always-listening:force-flush', async () => {
      const deps = makeStrategyDeps();
      const strategy = new AlwaysListeningStrategy(deps);
      await strategy.start(); // status -> 'capturing'
      const sendMock = deps.mainWindow.webContents.send as ReturnType<typeof vi.fn>;
      sendMock.mockClear(); // limpa o send do START

      strategy.forceFlush();

      expect(sendMock).toHaveBeenCalledWith('always-listening:force-flush');
    });

    it('status="capturing" + inFlight=true → no-op silencioso', async () => {
      const deps = makeStrategyDeps();
      const strategy = new AlwaysListeningStrategy(deps);
      await strategy.start();
      // Força inFlight=true via reflexão — utterance entra em processUtterance
      // e fica pendente. Não precisamos invocar processUtterance real;
      // basta setar a flag.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (strategy as any).inFlight = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (strategy as any).status = 'processing';

      const sendMock = deps.mainWindow.webContents.send as ReturnType<typeof vi.fn>;
      sendMock.mockClear();

      strategy.forceFlush();

      const forceFlushCalls = sendMock.mock.calls.filter(
        (args: unknown[]) => args[0] === 'always-listening:force-flush'
      );
      expect(forceFlushCalls).toHaveLength(0);
    });

    it('mainWindow.isDestroyed() === true → no-op (sem crash)', async () => {
      const deps = makeStrategyDeps();
      (deps.mainWindow as unknown as { isDestroyed: () => boolean }).isDestroyed = () => true;
      const strategy = new AlwaysListeningStrategy(deps);
      await strategy.start();
      // Sem throw
      expect(() => strategy.forceFlush()).not.toThrow();
    });
  });

  describe('pttHotkeyEmitter listener lifecycle (T-43-LEAK)', () => {
    it('start() subscreve pttHotkeyEmitter "toggle" → listenerCount === 1', async () => {
      const strategy = new AlwaysListeningStrategy(makeStrategyDeps());
      expect(mockPttHotkeyEmitter.listenerCount('toggle')).toBe(0);
      await strategy.start();
      expect(mockPttHotkeyEmitter.listenerCount('toggle')).toBe(1);
    });

    it('stop() remove listener → listenerCount === 0', async () => {
      const strategy = new AlwaysListeningStrategy(makeStrategyDeps());
      await strategy.start();
      await strategy.stop();
      expect(mockPttHotkeyEmitter.listenerCount('toggle')).toBe(0);
    });

    it('dispose() chama stop() → listenerCount === 0', async () => {
      const strategy = new AlwaysListeningStrategy(makeStrategyDeps());
      await strategy.start();
      await strategy.dispose();
      expect(mockPttHotkeyEmitter.listenerCount('toggle')).toBe(0);
    });

    it('5 cycles de start/stop → listenerCount === 0 ao final', async () => {
      const strategy = new AlwaysListeningStrategy(makeStrategyDeps());
      for (let i = 0; i < 5; i++) {
        await strategy.start();
        await strategy.stop();
      }
      expect(mockPttHotkeyEmitter.listenerCount('toggle')).toBe(0);
    });

    it('emit "toggle" no pttHotkeyEmitter durante capturing dispara forceFlush IPC', async () => {
      const deps = makeStrategyDeps();
      const strategy = new AlwaysListeningStrategy(deps);
      await strategy.start();
      const sendMock = deps.mainWindow.webContents.send as ReturnType<typeof vi.fn>;
      sendMock.mockClear();

      mockPttHotkeyEmitter.emit('toggle', 'toggle');

      expect(sendMock).toHaveBeenCalledWith('always-listening:force-flush');
    });

    it('emit "toggle" após stop() é no-op (listener já removido)', async () => {
      const deps = makeStrategyDeps();
      const strategy = new AlwaysListeningStrategy(deps);
      await strategy.start();
      await strategy.stop();
      const sendMock = deps.mainWindow.webContents.send as ReturnType<typeof vi.fn>;
      sendMock.mockClear();

      mockPttHotkeyEmitter.emit('toggle', 'toggle');

      const forceFlushCalls = sendMock.mock.calls.filter(
        (args: unknown[]) => args[0] === 'always-listening:force-flush'
      );
      expect(forceFlushCalls).toHaveLength(0);
    });
  });
});
