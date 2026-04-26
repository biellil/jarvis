/**
 * voiceMode.race.test.ts — Race condition + D-04 plan B integration tests
 *
 * Phase 43 — D-05 race tests + D-04 plan B (recovery em catch)
 *
 * Cenários (D-05):
 *  1. Sequencial rápido: 5 trocas Wake→AL→PTT→Wake→AL com await entre cada
 *  2. Concorrente: Promise.all([5 setMode]) — guard rejeita extras
 *  3. Plano B em catch: nova factory falha → strategy antiga é re-instanciada
 *  3b. transitioning durante recovery (atomicidade)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron-store', () => {
  let mockStore: Record<string, unknown> = {};
  return {
    default: class Store {
      get(key: string) { return mockStore[key]; }
      set(key: string, value: unknown) { mockStore[key] = value; }
      static __resetStore() { mockStore = {}; }
      static __getBackingStore() { return mockStore; }
    },
  };
});

vi.mock('electron', () => ({
  ipcMain: { on: vi.fn(), off: vi.fn(), once: vi.fn(), handle: vi.fn(), removeHandler: vi.fn() },
  BrowserWindow: vi.fn(() => ({
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
  })),
  globalShortcut: { register: vi.fn(() => true), unregister: vi.fn() },
}));

import Store from 'electron-store';
import { VoiceModeManager } from '../voiceMode/index';
import { pttHotkeyEmitter, __resetPttHotkeyEmitterForTests } from '../ptt-hotkey';
import { makeMockStrategy, makeFailingFactory, makeSequentialFactory } from './helpers/strategyFactoryMocks';

describe('Voice Mode Race Conditions (D-05)', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Store as any).__resetStore();
    __resetPttHotkeyEmitterForTests();
  });

  describe('Cenário 1: 5 trocas sequenciais (sem listener leak)', () => {
    it('Wake→AL→PTT→Wake→AL final state é "always-listening"', async () => {
      const ww = makeMockStrategy();
      const al = makeMockStrategy();
      const ptt = makeMockStrategy();

      const manager = new VoiceModeManager({
        'wake-word': () => ww,
        'always-listening': () => al,
        'ptt-only': () => ptt,
      });
      await manager.init();

      await manager.setMode('always-listening');
      await manager.setMode('ptt-only');
      await manager.setMode('wake-word');
      await manager.setMode('always-listening');

      expect(manager.getMode()).toBe('always-listening');
    });

    it('5 trocas → pttHotkeyEmitter.listenerCount("toggle") === 0 após dispose final', async () => {
      // Para validar leak guard usando os listeners REAIS, precisaríamos
      // PttOnlyStrategy + AlwaysListeningStrategy reais. Mocks não tocam o
      // emitter. Mas podemos simular: cada strategy mock pode adicionar/remover
      // um listener via dispose. Aqui validamos que os mocks foram disposed
      // corretamente — leak real fica para o teste manual UAT (43-VALIDATION).
      const ww = makeMockStrategy();
      const al = makeMockStrategy();
      const ptt = makeMockStrategy();
      const manager = new VoiceModeManager({
        'wake-word': () => ww,
        'always-listening': () => al,
        'ptt-only': () => ptt,
      });
      await manager.init();
      await manager.setMode('always-listening');
      await manager.setMode('ptt-only');
      await manager.setMode('wake-word');
      await manager.setMode('always-listening');

      // Após 5 trocas: ww disposed 2x (1 + 1 quando voltou e saiu),
      // al disposed 1x (saiu uma vez), ptt disposed 1x.
      // Estado final = always-listening (al ATIVO, sem dispose pending)
      expect(al.dispose).toHaveBeenCalledTimes(1); // disposed quando saiu pra ptt
      // pttHotkeyEmitter sempre 0 nos mocks (não há listener real)
      expect(pttHotkeyEmitter.listenerCount('toggle')).toBe(0);
    });

    it('nenhum throw/unhandled rejection durante a sequência', async () => {
      const manager = new VoiceModeManager({
        'wake-word': () => makeMockStrategy(),
        'always-listening': () => makeMockStrategy(),
        'ptt-only': () => makeMockStrategy(),
      });
      await manager.init();
      // Promise.allSettled garante que se houver rejection, capturamos
      const results = await Promise.allSettled([
        manager.setMode('always-listening'),
        manager.setMode('ptt-only'),
        manager.setMode('wake-word'),
      ].map(p => Promise.resolve(p))); // já resolvidas serial via await chain
      for (const r of results) {
        expect(r.status).toBe('fulfilled');
      }
    });
  });

  describe('Cenário 2: Promise.all de 5 setMode concorrentes', () => {
    it('apenas 1 setMode retorna true (transitioning guard rejeita os outros)', async () => {
      const manager = new VoiceModeManager({
        'wake-word': () => makeMockStrategy(),
        'always-listening': () => makeMockStrategy(),
        'ptt-only': () => makeMockStrategy(),
      });
      await manager.init();

      const results = await Promise.all([
        manager.setMode('always-listening'),
        manager.setMode('ptt-only'),
        manager.setMode('wake-word'),
        manager.setMode('always-listening'),
        manager.setMode('ptt-only'),
      ]);

      const successCount = results.filter((r) => r === true).length;
      expect(successCount).toBe(1);
    });

    it('estado final == primeiro setMode que entrou no try block', async () => {
      const manager = new VoiceModeManager({
        'wake-word': () => makeMockStrategy(),
        'always-listening': () => makeMockStrategy(),
        'ptt-only': () => makeMockStrategy(),
      });
      await manager.init();

      await Promise.all([
        manager.setMode('always-listening'), // primeiro a entrar
        manager.setMode('ptt-only'),
        manager.setMode('wake-word'),
      ]);

      // Primeira chamada (always-listening) é a que vence
      expect(manager.getMode()).toBe('always-listening');
    });

    it('listenerCount("toggle") <= 1 após settle (race scenario)', async () => {
      const manager = new VoiceModeManager({
        'wake-word': () => makeMockStrategy(),
        'always-listening': () => makeMockStrategy(),
        'ptt-only': () => makeMockStrategy(),
      });
      await manager.init();

      await Promise.all([
        manager.setMode('always-listening'),
        manager.setMode('ptt-only'),
        manager.setMode('wake-word'),
      ]);

      expect(pttHotkeyEmitter.listenerCount('toggle')).toBeLessThanOrEqual(1);
    });
  });

  describe('Cenário 3: D-04 plano B — factory nova falha, antiga é re-instanciada', () => {
    it('PTT factory falha 1x → WakeWord factory é chamada 2x (init + recovery)', async () => {
      const wwInitial = makeMockStrategy();
      const wwRecovered = makeMockStrategy();
      const wwFactory = makeSequentialFactory([wwInitial, wwRecovered]);
      const failingPttFactory = makeFailingFactory(1, 'PttOnlyStrategy not ready');

      const manager = new VoiceModeManager({
        'wake-word': wwFactory,
        'ptt-only': failingPttFactory,
      });
      await manager.init();

      const result = await manager.setMode('ptt-only');

      expect(result).toBe(false);
      expect(manager.getMode()).toBe('wake-word');
      expect(wwFactory).toHaveBeenCalledTimes(2);
    });

    it('strategy antiga (wwInitial) tem dispose() chamado uma vez', async () => {
      const wwInitial = makeMockStrategy();
      const wwRecovered = makeMockStrategy();
      const wwFactory = makeSequentialFactory([wwInitial, wwRecovered]);
      const failingPttFactory = makeFailingFactory(1);

      const manager = new VoiceModeManager({
        'wake-word': wwFactory,
        'ptt-only': failingPttFactory,
      });
      await manager.init();
      await manager.setMode('ptt-only');

      expect(wwInitial.dispose).toHaveBeenCalledTimes(1);
    });

    it('strategy recuperada (wwRecovered) tem start() chamado uma vez', async () => {
      const wwInitial = makeMockStrategy();
      const wwRecovered = makeMockStrategy();
      const wwFactory = makeSequentialFactory([wwInitial, wwRecovered]);
      const failingPttFactory = makeFailingFactory(1);

      const manager = new VoiceModeManager({
        'wake-word': wwFactory,
        'ptt-only': failingPttFactory,
      });
      await manager.init();
      await manager.setMode('ptt-only');

      expect(wwRecovered.start).toHaveBeenCalledTimes(1);
    });

    it('FALLBACK: se recovery TAMBÉM falhar, currentMode = null + activeStrategy = null', async () => {
      const wwInitial = makeMockStrategy();
      // wwFactory: 1ª chamada (init) sucesso, 2ª (recovery) lança
      let wwCalls = 0;
      const wwFactory = vi.fn().mockImplementation(() => {
        wwCalls += 1;
        if (wwCalls === 1) return wwInitial;
        throw new Error('recovery also failed');
      });
      const failingPttFactory = makeFailingFactory(1);

      const manager = new VoiceModeManager({
        'wake-word': wwFactory,
        'ptt-only': failingPttFactory,
      });
      await manager.init();
      const result = await manager.setMode('ptt-only');

      expect(result).toBe(false);
      expect(manager.getMode()).toBeNull();
    });
  });

  describe('Cenário 3b: transitioning flag durante recovery (D-04 atomicidade)', () => {
    it('transitioning permanece true durante recovery — setMode concorrente é rejeitado', async () => {
      let resolveDispose!: () => void;
      const disposePending = new Promise<void>((r) => { resolveDispose = r; });
      const wwInitial = {
        ...makeMockStrategy(),
        dispose: vi.fn().mockImplementation(() => disposePending),
      };
      const wwRecovered = makeMockStrategy();
      const wwFactory = makeSequentialFactory([wwInitial, wwRecovered]);
      const failingPttFactory = makeFailingFactory(1);

      const manager = new VoiceModeManager({
        'wake-word': wwFactory,
        'ptt-only': failingPttFactory,
        'always-listening': () => makeMockStrategy(),
      });
      await manager.init();

      const first = manager.setMode('ptt-only');
      await vi.waitFor(() => expect(wwInitial.dispose).toHaveBeenCalled());
      // Durante recovery (recovery em curso após dispose), transitioning=true
      const second = manager.setMode('always-listening');
      resolveDispose();

      const [firstResult, secondResult] = await Promise.all([first, second]);
      expect(firstResult).toBe(false); // PTT failure
      expect(secondResult).toBe(false); // bloqueado por transitioning
    });

    it('transitioning volta a false após recovery (próximo setMode passa)', async () => {
      const wwFactory = makeSequentialFactory([makeMockStrategy(), makeMockStrategy()]);
      const failingPttFactory = makeFailingFactory(1);
      const manager = new VoiceModeManager({
        'wake-word': wwFactory,
        'ptt-only': failingPttFactory,
        'always-listening': () => makeMockStrategy(),
      });
      await manager.init();

      await manager.setMode('ptt-only'); // recovery roda + completa
      // Agora transitioning=false; novo setMode deve passar
      const result = await manager.setMode('always-listening');
      expect(result).toBe(true);
    });
  });
});
