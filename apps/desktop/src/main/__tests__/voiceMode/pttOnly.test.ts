/**
 * pttOnly.test.ts — PttOnlyStrategy main coordinator tests
 *
 * Phase 43 — PTT-only + Integration (VPTT-01, VPTT-02)
 *
 * Wave 0 (Plan 43-01): este arquivo é stub — todos os it() são it.todo() até
 * Plan 43-02 implementar PttOnlyStrategy. Os describe blocks já estão na
 * forma final para evitar revisão de estrutura na Wave 1.
 *
 * OQ-4 RESOLVED (Plan 01): wake word pause é feito via canal existente
 * `wakeWord:pause-toggle` (broadcastPauseToggle de ipc/settings.ts) — NÃO
 * criar canal `ptt-only:active`. Renderer useWakeWord.ts:397 já consome.
 *
 * OQ-1 OUT OF SCOPE (Plan 01): VPTT-03 main-side é o escopo desta phase.
 * Renderer-side wiring (hook React `useAlwaysListening` consumindo IPC
 * `ALWAYS_LISTENING_FORCE_FLUSH`) declarado fora de scope — follow-up note
 * no SUMMARY do plan 43-03. Assertion aqui cobre webContents.send only.
 *
 * OQ-2 OUT OF SCOPE (Plan 01): API exata force-flush em vad-web é problema
 * do hook futuro. Strategy main-side só comanda via IPC.
 */
import { describe, it, vi, beforeEach } from 'vitest';

// Mock electron — capturamos webContents.send + ipcMain methods
interface IpcListenerEntry { channel: string; handler: (...args: unknown[]) => unknown; }
const { ipcListeners, sendCalls } = vi.hoisted(() => ({
  ipcListeners: [] as IpcListenerEntry[],
  sendCalls: [] as Array<{ channel: string; args: unknown[] }>,
}));

vi.mock('electron', () => ({
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
  },
  BrowserWindow: vi.fn(() => ({
    isDestroyed: () => false,
    webContents: { send: vi.fn((channel: string, ...args: unknown[]) => {
      sendCalls.push({ channel, args });
    }) },
  })),
  globalShortcut: { register: vi.fn(() => true), unregister: vi.fn() },
}));

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

describe('PttOnlyStrategy (Phase 43, VPTT-01)', () => {
  beforeEach(() => {
    ipcListeners.length = 0;
    sendCalls.length = 0;
  });

  describe('VPTT-01 — lifecycle', () => {
    it.todo('start() pausa wake word via broadcastPauseToggle(true)');
    it.todo('start() subscribe pttHotkeyEmitter "toggle" listener');
    it.todo('start() é idempotente — chamada dupla não duplica listener');
    it.todo('start() seta status para "capturing"');
    it.todo('stop() remove pttHotkeyEmitter "toggle" listener (mesma referência)');
    it.todo('stop() chama broadcastPauseToggle(false) para reativar wake word');
    it.todo('stop() seta status para "idle"');
    it.todo('dispose() é idempotente — chamada dupla não vaza');
    it.todo('dispose() chama stop() internamente (cleanup canônico)');
  });

  describe('VPTT-01 — wake word silenciado durante PTT-only', () => {
    it.todo('webContents.send é invocado com "wakeWord:pause-toggle" e payload true em start()');
    it.todo('webContents.send é invocado com "wakeWord:pause-toggle" e payload false em stop()');
  });

  describe('VPTT-02 — reuso da hotkey v1.7', () => {
    it.todo('PttOnlyStrategy NÃO chama globalShortcut.register (D-03)');
    it.todo('PttOnlyStrategy NÃO chama setPttHotkey/getPttHotkey diretamente');
  });

  describe('Listener leak guard (T-43-LEAK)', () => {
    it.todo('5 cycles de start/stop deixam pttHotkeyEmitter.listenerCount("toggle") === 0');
  });
});
