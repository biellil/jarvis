/**
 * PTT Hotkey refactor tests (Phase 22 Plan 01, Wave 0)
 *
 * Cobre as 3 regiões de callback que emitiam 'start'/'stop':
 *   - registerPttHotkey (região 1)
 *   - changePttHotkey success branch (região 2)
 *   - changePttHotkey fallback re-register branch (região 3)
 *
 * Pós-refactor: todas emitem 'ptt:action', 'toggle'. O arquivo não contém
 * mais `let isRecording` nem nenhuma referência a isRecording — o estado
 * foi extraído para o VoiceInputManager no renderer.
 *
 * PATCH-01 (Phase 45): guard de voice mode adicionado. Tests de callback
 * existentes injetam um mockManager em modo 'ptt-only' para preservar o
 * comportamento original do happy path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globalShortcut } from 'electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock electron-store (via store.ts) — reutiliza padrão do hotkey.test.ts
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
    },
  };
});

// Mock electron
vi.mock('electron', () => ({
  globalShortcut: {
    register: vi.fn(() => true),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
  },
  BrowserWindow: vi.fn(),
}));

describe('ptt-hotkey refactor (Phase 22 Plan 01)', () => {
  let mockWindow: any;
  // PATCH-01: mock manager in 'ptt-only' mode for existing happy-path tests
  const pttOnlyManager = { getMode: () => 'ptt-only' as const };

  beforeEach(async () => {
    vi.resetModules();
    const Store = (await import('electron-store')).default;
    (Store as any).__resetStore();

    vi.mocked(globalShortcut.register).mockClear();
    vi.mocked(globalShortcut.register).mockReturnValue(true);
    vi.mocked(globalShortcut.unregister).mockClear();

    mockWindow = {
      webContents: {
        send: vi.fn(),
      },
    };
  });

  describe('source file invariants (isRecording removed)', () => {
    const sourcePath = resolve(__dirname, '../ptt-hotkey.ts');

    it('não contém `let isRecording` em escopo de módulo', () => {
      const src = readFileSync(sourcePath, 'utf8');
      expect(src).not.toMatch(/^let isRecording/m);
    });

    it('não contém NENHUMA referência a isRecording (cobre as 3 regiões + cleanups)', () => {
      const src = readFileSync(sourcePath, 'utf8');
      expect(src).not.toMatch(/isRecording/);
    });

    it('usa createPttToggleCallback como factory centralizada (PATCH-01)', () => {
      const src = readFileSync(sourcePath, 'utf8');
      // A factory centraliza os emits — deve existir pelo menos uma ocorrência
      expect(src).toMatch(/createPttToggleCallback/);
      // ptt:action deve aparecer dentro da factory (não duplicado em cada callsite)
      const toggleEmits = src.match(/ptt:action[^\n]*toggle/g) || [];
      expect(toggleEmits.length).toBeGreaterThanOrEqual(1);
    });

    it('não contém mais payload antigo start/stop em ptt:action sends', () => {
      const src = readFileSync(sourcePath, 'utf8');
      // Captura apenas linhas que enviam ptt:action
      const pttActionLines =
        src.split('\n').filter((l) => l.includes('ptt:action'));
      for (const line of pttActionLines) {
        expect(line).not.toMatch(/'start'|'stop'/);
      }
    });
  });

  describe('registerPttHotkey', () => {
    it('retorna true quando globalShortcut.register retorna true', async () => {
      const { registerPttHotkey } = await import('../ptt-hotkey');
      const result = registerPttHotkey(mockWindow);
      expect(result).toBe(true);
      expect(globalShortcut.register).toHaveBeenCalled();
    });

    it("invoca webContents.send('ptt:action', 'toggle') na primeira call do callback", async () => {
      let cb: (() => void) | undefined;
      vi.mocked(globalShortcut.register).mockImplementation(
        (_accel, callback) => {
          cb = callback as () => void;
          return true;
        }
      );
      const { registerPttHotkey, setVoiceModeManager } = await import('../ptt-hotkey');
      registerPttHotkey(mockWindow);
      // PATCH-01: inject ptt-only manager so the guard passes
      setVoiceModeManager(pttOnlyManager as any);

      cb?.();
      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'ptt:action',
        'toggle'
      );
    });

    it("invoca webContents.send('ptt:action', 'toggle') na segunda call do callback (toggle resolvido no renderer)", async () => {
      let cb: (() => void) | undefined;
      vi.mocked(globalShortcut.register).mockImplementation(
        (_accel, callback) => {
          cb = callback as () => void;
          return true;
        }
      );
      const { registerPttHotkey, setVoiceModeManager } = await import('../ptt-hotkey');
      registerPttHotkey(mockWindow);
      // PATCH-01: inject ptt-only manager so the guard passes
      setVoiceModeManager(pttOnlyManager as any);

      cb?.();
      cb?.();

      expect(mockWindow.webContents.send).toHaveBeenCalledTimes(2);
      expect(mockWindow.webContents.send).toHaveBeenNthCalledWith(
        1,
        'ptt:action',
        'toggle'
      );
      expect(mockWindow.webContents.send).toHaveBeenNthCalledWith(
        2,
        'ptt:action',
        'toggle'
      );
    });
  });

  describe('changePttHotkey', () => {
    it('success branch emite "ptt:action", "toggle" no callback novo', async () => {
      let capturedCb: (() => void) | undefined;
      vi.mocked(globalShortcut.register).mockImplementation(
        (_accel, callback) => {
          capturedCb = callback as () => void;
          return true;
        }
      );

      const { registerPttHotkey, changePttHotkey, setVoiceModeManager } = await import(
        '../ptt-hotkey'
      );
      registerPttHotkey(mockWindow);

      // Novo register — captura o novo callback
      changePttHotkey('CmdOrCtrl+Alt+Space', mockWindow);
      // PATCH-01: inject ptt-only manager so the guard passes
      setVoiceModeManager(pttOnlyManager as any);

      mockWindow.webContents.send.mockClear();
      capturedCb?.();
      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'ptt:action',
        'toggle'
      );
    });

    it('fallback branch (primeiro register falha, fallback re-register sucede) emite "ptt:action", "toggle"', async () => {
      let callCount = 0;
      let fallbackCb: (() => void) | undefined;
      vi.mocked(globalShortcut.register).mockImplementation(
        (_accel, callback) => {
          callCount++;
          // Primeira call: registerPttHotkey inicial → sucede
          // Segunda call: changePttHotkey tenta novo accelerator → FALHA
          // Terceira call: fallback re-register do accelerator antigo → sucede
          if (callCount === 2) return false;
          fallbackCb = callback as () => void;
          return true;
        }
      );

      const { registerPttHotkey, changePttHotkey, setVoiceModeManager } = await import(
        '../ptt-hotkey'
      );
      registerPttHotkey(mockWindow);

      const result = changePttHotkey('CmdOrCtrl+Alt+Space', mockWindow);
      expect(result).toBe(false);
      expect(callCount).toBe(3);

      // PATCH-01: inject ptt-only manager so the guard passes
      setVoiceModeManager(pttOnlyManager as any);

      mockWindow.webContents.send.mockClear();
      fallbackCb?.();
      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'ptt:action',
        'toggle'
      );
    });
  });

  describe('unregisterPttHotkey', () => {
    it('chama globalShortcut.unregister com o accelerator registrado', async () => {
      const { registerPttHotkey, unregisterPttHotkey } = await import(
        '../ptt-hotkey'
      );
      registerPttHotkey(mockWindow);
      unregisterPttHotkey();
      expect(globalShortcut.unregister).toHaveBeenCalledWith(
        'CmdOrCtrl+Space'
      );
    });
  });

  describe('voice mode guard (PATCH-01)', () => {
    let mockManager: { getMode: ReturnType<typeof vi.fn> };
    let capturedCb: (() => void) | undefined;

    beforeEach(async () => {
      vi.resetModules();
      const Store = (await import('electron-store')).default;
      (Store as any).__resetStore();
      vi.mocked(globalShortcut.register).mockClear();
      vi.mocked(globalShortcut.register).mockImplementation((_accel, callback) => {
        capturedCb = callback as () => void;
        return true;
      });
      mockWindow = { webContents: { send: vi.fn() } };
      mockManager = { getMode: vi.fn() };
    });

    it('blocks webContents.send when mode is wake-word', async () => {
      const { registerPttHotkey, setVoiceModeManager } = await import('../ptt-hotkey');
      registerPttHotkey(mockWindow);
      mockManager.getMode.mockReturnValue('wake-word');
      setVoiceModeManager(mockManager as any);
      capturedCb?.();
      expect(mockWindow.webContents.send).not.toHaveBeenCalled();
    });

    it('blocks webContents.send when mode is always-listening', async () => {
      const { registerPttHotkey, setVoiceModeManager } = await import('../ptt-hotkey');
      registerPttHotkey(mockWindow);
      mockManager.getMode.mockReturnValue('always-listening');
      setVoiceModeManager(mockManager as any);
      capturedCb?.();
      expect(mockWindow.webContents.send).not.toHaveBeenCalled();
    });

    it('allows webContents.send when mode is ptt-only', async () => {
      const { registerPttHotkey, setVoiceModeManager } = await import('../ptt-hotkey');
      registerPttHotkey(mockWindow);
      mockManager.getMode.mockReturnValue('ptt-only');
      setVoiceModeManager(mockManager as any);
      capturedCb?.();
      expect(mockWindow.webContents.send).toHaveBeenCalledWith('ptt:action', 'toggle');
    });

    it('blocks when voiceModeManager is null (not injected)', async () => {
      const { registerPttHotkey } = await import('../ptt-hotkey');
      // Do NOT call setVoiceModeManager — module starts with null
      registerPttHotkey(mockWindow);
      capturedCb?.();
      expect(mockWindow.webContents.send).not.toHaveBeenCalled();
    });

    it('changePttHotkey callback also respects guard (silent in wake-word mode)', async () => {
      const { registerPttHotkey, changePttHotkey, setVoiceModeManager } = await import('../ptt-hotkey');
      registerPttHotkey(mockWindow);
      changePttHotkey('CmdOrCtrl+Alt+Space', mockWindow);
      mockManager.getMode.mockReturnValue('wake-word');
      setVoiceModeManager(mockManager as any);
      mockWindow.webContents.send.mockClear();
      capturedCb?.();
      expect(mockWindow.webContents.send).not.toHaveBeenCalled();
    });
  });
});
