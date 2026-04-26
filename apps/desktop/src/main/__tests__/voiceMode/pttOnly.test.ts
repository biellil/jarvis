/**
 * pttOnly.test.ts — PttOnlyStrategy main coordinator tests
 *
 * Phase 43 — VPTT-01 (lifecycle + wake word silenciado), VPTT-02 (hotkey reuso)
 *
 * OQ-4 RESOLVED (Plan 01): wake word pause via canal `wakeWord:pause-toggle`
 * (broadcastPauseToggle de ipc/settings.ts) — NÃO criar canal `ptt-only:active`.
 * Renderer useWakeWord.ts:397 já consome.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron-store
vi.mock('electron-store', () => {
  let mockStore: Record<string, unknown> = {};
  return {
    default: class Store {
      get(key: string) { return mockStore[key]; }
      set(key: string, value: unknown) { mockStore[key] = value; }
      static __resetStore() { mockStore = {}; }
    },
  };
});

// Mock electron — minimal
vi.mock('electron', () => ({
  ipcMain: { on: vi.fn(), off: vi.fn(), once: vi.fn() },
  BrowserWindow: vi.fn(() => ({
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
  })),
  globalShortcut: { register: vi.fn(() => true), unregister: vi.fn() },
}));

// Mock store + ipc/settings — capturamos chamadas de pause
const { setWakeWordPausedMock, broadcastPauseToggleMock } = vi.hoisted(() => ({
  setWakeWordPausedMock: vi.fn(),
  broadcastPauseToggleMock: vi.fn(),
}));

vi.mock('../../store.js', () => ({
  setWakeWordPaused: setWakeWordPausedMock,
  getWakeWordPaused: vi.fn(() => false),
}));

vi.mock('../../ipc/settings.js', () => ({
  broadcastPauseToggle: broadcastPauseToggleMock,
}));

import { PttOnlyStrategy, createPttOnlyFactory } from '../../voiceMode/strategies/pttOnly';
import { pttHotkeyEmitter, __resetPttHotkeyEmitterForTests } from '../../ptt-hotkey';
import type { BrowserWindow } from 'electron';

function makeMainWindow(): BrowserWindow {
  return {
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
  } as unknown as BrowserWindow;
}

describe('PttOnlyStrategy (Phase 43, VPTT-01)', () => {
  beforeEach(() => {
    __resetPttHotkeyEmitterForTests();
    setWakeWordPausedMock.mockClear();
    broadcastPauseToggleMock.mockClear();
  });

  describe('VPTT-01 — lifecycle', () => {
    it('start() pausa wake word via setWakeWordPaused(true) + broadcastPauseToggle(true)', async () => {
      const strategy = new PttOnlyStrategy({ mainWindow: makeMainWindow() });
      await strategy.start();
      expect(setWakeWordPausedMock).toHaveBeenCalledWith(true);
      expect(broadcastPauseToggleMock).toHaveBeenCalledWith(true);
    });

    it('start() subscreve pttHotkeyEmitter "toggle" — listenerCount === 1', async () => {
      const strategy = new PttOnlyStrategy({ mainWindow: makeMainWindow() });
      expect(pttHotkeyEmitter.listenerCount('toggle')).toBe(0);
      await strategy.start();
      expect(pttHotkeyEmitter.listenerCount('toggle')).toBe(1);
    });

    it('start() é idempotente — start() duplicado mantém apenas 1 listener', async () => {
      const strategy = new PttOnlyStrategy({ mainWindow: makeMainWindow() });
      await strategy.start();
      await strategy.start(); // duplo
      expect(pttHotkeyEmitter.listenerCount('toggle')).toBe(1);
      // setWakeWordPaused não é chamado de novo (start cedo via status check)
      expect(setWakeWordPausedMock).toHaveBeenCalledTimes(1);
    });

    it('start() seta status para "capturing"', async () => {
      const strategy = new PttOnlyStrategy({ mainWindow: makeMainWindow() });
      expect(strategy.getStatus()).toBe('idle');
      await strategy.start();
      expect(strategy.getStatus()).toBe('capturing');
    });

    it('stop() remove pttHotkeyEmitter "toggle" listener', async () => {
      const strategy = new PttOnlyStrategy({ mainWindow: makeMainWindow() });
      await strategy.start();
      expect(pttHotkeyEmitter.listenerCount('toggle')).toBe(1);
      await strategy.stop();
      expect(pttHotkeyEmitter.listenerCount('toggle')).toBe(0);
    });

    it('stop() chama broadcastPauseToggle(false) + setWakeWordPaused(false) — wake word reativado', async () => {
      const strategy = new PttOnlyStrategy({ mainWindow: makeMainWindow() });
      await strategy.start();
      setWakeWordPausedMock.mockClear();
      broadcastPauseToggleMock.mockClear();
      await strategy.stop();
      expect(setWakeWordPausedMock).toHaveBeenCalledWith(false);
      expect(broadcastPauseToggleMock).toHaveBeenCalledWith(false);
    });

    it('stop() seta status para "idle"', async () => {
      const strategy = new PttOnlyStrategy({ mainWindow: makeMainWindow() });
      await strategy.start();
      expect(strategy.getStatus()).toBe('capturing');
      await strategy.stop();
      expect(strategy.getStatus()).toBe('idle');
    });

    it('dispose() é idempotente — chamada dupla não vaza, listenerCount permanece 0', async () => {
      const strategy = new PttOnlyStrategy({ mainWindow: makeMainWindow() });
      await strategy.start();
      await strategy.dispose();
      await strategy.dispose(); // duplo
      expect(pttHotkeyEmitter.listenerCount('toggle')).toBe(0);
    });

    it('dispose() chama stop() internamente — broadcastPauseToggle(false) é emitido', async () => {
      const strategy = new PttOnlyStrategy({ mainWindow: makeMainWindow() });
      await strategy.start();
      broadcastPauseToggleMock.mockClear();
      await strategy.dispose();
      expect(broadcastPauseToggleMock).toHaveBeenCalledWith(false);
    });
  });

  describe('VPTT-02 — reuso da hotkey v1.7 (D-03 ownership)', () => {
    it('PttOnlyStrategy NÃO chama globalShortcut.register em nenhum momento', async () => {
      const { globalShortcut } = await import('electron');
      const strategy = new PttOnlyStrategy({ mainWindow: makeMainWindow() });
      await strategy.start();
      await strategy.stop();
      await strategy.dispose();
      expect(globalShortcut.register).not.toHaveBeenCalled();
      expect(globalShortcut.unregister).not.toHaveBeenCalled();
    });
  });

  describe('Listener leak guard (T-43-LEAK)', () => {
    it('5 cycles de start/stop deixam pttHotkeyEmitter.listenerCount("toggle") === 0', async () => {
      const strategy = new PttOnlyStrategy({ mainWindow: makeMainWindow() });
      for (let i = 0; i < 5; i++) {
        await strategy.start();
        await strategy.stop();
      }
      expect(pttHotkeyEmitter.listenerCount('toggle')).toBe(0);
    });

    it('createPttOnlyFactory retorna () => PttOnlyStrategy compatível com VoiceCaptureStrategy', () => {
      const factory = createPttOnlyFactory({ mainWindow: makeMainWindow() });
      const instance = factory();
      expect(instance).toBeInstanceOf(PttOnlyStrategy);
      expect(typeof instance.start).toBe('function');
      expect(typeof instance.stop).toBe('function');
      expect(typeof instance.dispose).toBe('function');
      expect(typeof instance.getStatus).toBe('function');
    });
  });
});
