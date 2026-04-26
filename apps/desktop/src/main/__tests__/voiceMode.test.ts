/**
 * voiceMode.test.ts — VoiceModeManager state machine tests
 *
 * Phase 39: VMODE-01 (exclusividade), VMODE-02 (persistence), VMODE-03 (EventEmitter)
 * Cobre todas as decisões D-01 a D-08.
 *
 * Gap closure (Phase 41 Plan 03): D-02 status guard removido — capturing/processing
 * NÃO bloqueia mais transição. Apenas o guard re-entrante `transitioning` permanece.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron — necessário porque voiceMode/index.ts re-exporta AlwaysListeningStrategy
// e PttOnlyStrategy (Phase 43), que importam from 'electron' em runtime.
// VoiceModeManager em si não usa electron — os mocks são stub no-ops.
vi.mock('electron', () => ({
  ipcMain: { on: vi.fn(), off: vi.fn(), once: vi.fn(), handle: vi.fn(), removeHandler: vi.fn() },
  BrowserWindow: vi.fn(() => ({
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
  })),
  globalShortcut: { register: vi.fn(() => true), unregister: vi.fn() },
}));

// Mock electron-store — idêntico ao padrão em store.test.ts
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

import Store from 'electron-store';
import { VoiceModeManager, WakeWordStrategy } from '../voiceMode/index';
import type { VoiceModeChangeEvent } from '../../shared/ipc-types';

// Helper: cria uma Strategy mock com status configurável
function makeStrategy(status: 'idle' | 'capturing' | 'processing' = 'idle') {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue(status),
  };
}

describe('VoiceModeManager — state machine (Phase 39)', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Store as any).__resetStore();
  });

  // ---- VMODE-02: Persistence ----

  describe('VMODE-02: persistence via electron-store', () => {
    it("getMode() returns 'wake-word' when store is empty (D-07 migration default)", () => {
      const manager = new VoiceModeManager({ 'wake-word': () => makeStrategy() });
      expect(manager.getMode()).toBe('wake-word');
    });

    it('getMode() returns stored mode on construction', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const backing = (Store as any).__getBackingStore();
      backing['voiceMode'] = 'ptt-only';
      const pttFactory = vi.fn().mockReturnValue(makeStrategy());
      const manager = new VoiceModeManager({ 'ptt-only': pttFactory });
      expect(manager.getMode()).toBe('ptt-only');
    });

    it('setMode() persists new mode to store (VMODE-02)', async () => {
      const ww = makeStrategy();
      const al = makeStrategy();
      const manager = new VoiceModeManager({
        'wake-word': () => ww,
        'always-listening': () => al,
      });
      await manager.setMode('always-listening');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const backing = (Store as any).__getBackingStore();
      expect(backing['voiceMode']).toBe('always-listening');
    });
  });

  // ---- VMODE-01: Exclusividade / Guards ----

  describe('VMODE-01: transition guards (D-01, D-02)', () => {
    it('setMode() for same mode returns false (no-op)', async () => {
      const manager = new VoiceModeManager({ 'wake-word': () => makeStrategy() });
      const result = await manager.setMode('wake-word');
      expect(result).toBe(false);
    });

    it("setMode() succeeds when active strategy is 'capturing' — old strategy is disposed (gap closure 41-03)", async () => {
      const capturingStrategy = makeStrategy('capturing');
      const idlePtt = makeStrategy('idle');
      const manager = new VoiceModeManager({
        'wake-word': () => capturingStrategy,
        'ptt-only': () => idlePtt,
      });
      await manager.init();
      const result = await manager.setMode('ptt-only');
      expect(result).toBe(true);
      expect(manager.getMode()).toBe('ptt-only');
      expect(capturingStrategy.dispose).toHaveBeenCalledOnce();
    });

    it("setMode() succeeds when active strategy is 'processing' — old strategy is disposed (gap closure 41-03)", async () => {
      const processingStrategy = makeStrategy('processing');
      const idleAl = makeStrategy('idle');
      const manager = new VoiceModeManager({
        'wake-word': () => processingStrategy,
        'always-listening': () => idleAl,
      });
      await manager.init();
      const result = await manager.setMode('always-listening');
      expect(result).toBe(true);
      expect(manager.getMode()).toBe('always-listening');
      expect(processingStrategy.dispose).toHaveBeenCalledOnce();
    });

    it('setMode() returns true and updates getMode() when strategy is idle', async () => {
      const ww = makeStrategy('idle');
      const al = makeStrategy('idle');
      const manager = new VoiceModeManager({
        'wake-word': () => ww,
        'always-listening': () => al,
      });
      await manager.init();
      const result = await manager.setMode('always-listening');
      expect(result).toBe(true);
      expect(manager.getMode()).toBe('always-listening');
    });
  });

  // ---- VMODE-03: EventEmitter pub/sub (D-05) ----

  describe('VMODE-03: EventEmitter mode change events (D-05)', () => {
    it("setMode() emits 'voiceMode:change' with rich payload (D-05)", async () => {
      const ww = makeStrategy('idle');
      const al = makeStrategy('idle');
      const manager = new VoiceModeManager({
        'wake-word': () => ww,
        'always-listening': () => al,
      });
      await manager.init();

      const events: VoiceModeChangeEvent[] = [];
      manager.on('voiceMode:change', (e: VoiceModeChangeEvent) => events.push(e));

      const before = Date.now();
      await manager.setMode('always-listening', 'user');
      const after = Date.now();

      expect(events).toHaveLength(1);
      expect(events[0].oldMode).toBe('wake-word');
      expect(events[0].newMode).toBe('always-listening');
      expect(events[0].reason).toBe('user');
      expect(events[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(events[0].timestamp).toBeLessThanOrEqual(after);
    });

    it("init() does NOT emit 'voiceMode:change' (D-08 silent startup)", async () => {
      const ww = makeStrategy('idle');
      const manager = new VoiceModeManager({ 'wake-word': () => ww });
      const events: VoiceModeChangeEvent[] = [];
      manager.on('voiceMode:change', (e: VoiceModeChangeEvent) => events.push(e));
      await manager.init();
      expect(events).toHaveLength(0);
    });
  });

  // ---- D-04: Strategy lifecycle lazy ----

  describe('D-04: lazy Strategy lifecycle', () => {
    it('dispose() is called on old strategy during mode switch', async () => {
      const ww = makeStrategy('idle');
      const al = makeStrategy('idle');
      const manager = new VoiceModeManager({
        'wake-word': () => ww,
        'always-listening': () => al,
      });
      await manager.init();
      await manager.setMode('always-listening');
      expect(ww.dispose).toHaveBeenCalledOnce();
    });

    it('new strategy start() is called after mode switch', async () => {
      const ww = makeStrategy('idle');
      const al = makeStrategy('idle');
      const manager = new VoiceModeManager({
        'wake-word': () => ww,
        'always-listening': () => al,
      });
      await manager.init();
      await manager.setMode('always-listening');
      expect(al.start).toHaveBeenCalledOnce();
    });
  });

  // ---- WR-02: init() idempotency ----

  describe('WR-02: init() is idempotent (no Strategy leak on double-call)', () => {
    it('second init() call does not construct a new Strategy', async () => {
      const wwFactory = vi.fn().mockReturnValue(makeStrategy('idle'));
      const manager = new VoiceModeManager({ 'wake-word': wwFactory });

      await manager.init();
      await manager.init(); // segunda chamada deve ser no-op

      expect(wwFactory).toHaveBeenCalledTimes(1);
    });

    it('init() can be re-run after dispose()', async () => {
      const wwFactory = vi.fn().mockReturnValue(makeStrategy('idle'));
      const manager = new VoiceModeManager({ 'wake-word': wwFactory });

      await manager.init();
      await manager.dispose();
      await manager.init(); // após dispose, init deve funcionar de novo

      expect(wwFactory).toHaveBeenCalledTimes(2);
    });
  });

  // ---- WR-01: state desync guard ----

  describe('WR-01: setMode() does not persist when new Strategy fails to start (with D-04 plano B Phase 43)', () => {
    it('factory throws → result false, mode unchanged, store untouched, no event — D-04 recovery re-instances old', async () => {
      const ww = makeStrategy('idle');
      const throwingAlFactory = vi.fn().mockImplementation(() => {
        throw new Error('AlwaysListeningStrategy not yet implemented');
      });
      const manager = new VoiceModeManager({
        'wake-word': () => ww,
        'always-listening': throwingAlFactory,
      });
      await manager.init();

      const events: VoiceModeChangeEvent[] = [];
      manager.on('voiceMode:change', (e: VoiceModeChangeEvent) => events.push(e));

      const result = await manager.setMode('always-listening');

      expect(result).toBe(false);
      expect(manager.getMode()).toBe('wake-word');
      // Store deve permanecer intocada (sem chave 'voiceMode' setada para always-listening)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const backing = (Store as any).__getBackingStore();
      expect(backing['voiceMode']).not.toBe('always-listening');
      // Nenhum event deve ter sido emitido
      expect(events).toHaveLength(0);
      // D-04 plano B: dispose foi chamado uma vez (pré-recovery), start chamado 2x (init + recovery)
      expect(ww.dispose).toHaveBeenCalledTimes(1);
      expect(ww.start).toHaveBeenCalledTimes(2);
    });

    it('start() rejects after construction → result false, D-04 recovery re-instances old', async () => {
      const ww = makeStrategy('idle');
      const failingAl = {
        start: vi.fn().mockRejectedValue(new Error('audio device busy')),
        stop: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn().mockResolvedValue(undefined),
        getStatus: vi.fn().mockReturnValue('idle' as const),
      };
      const manager = new VoiceModeManager({
        'wake-word': () => ww,
        'always-listening': () => failingAl,
      });
      await manager.init();

      const result = await manager.setMode('always-listening');

      expect(result).toBe(false);
      expect(manager.getMode()).toBe('wake-word');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const backing = (Store as any).__getBackingStore();
      expect(backing['voiceMode']).not.toBe('always-listening');
      // D-04: ww.start chamada na init + recovery
      expect(ww.start).toHaveBeenCalledTimes(2);
    });
  });

  // ---- Race condition guard ----

  describe('Race condition guard (transitioning flag)', () => {
    it('concurrent setMode() calls: second call returns false while first is in progress', async () => {
      // WR-04: sincroniza no evento observável `ww.dispose` chamado em vez de
      // contar microtasks com `await Promise.resolve()` x3. Isso pin a
      // sincronização ao primeiro await dentro de setMode() (dispose da
      // Strategy antiga), garantindo que a segunda chamada acontece com
      // `transitioning=true` independente de quantos awaits o setMode tenha.
      let resolveDispose: (() => void) | undefined;
      const disposePending = new Promise<void>((r) => { resolveDispose = r; });
      const ww = {
        ...makeStrategy('idle'),
        dispose: vi.fn().mockImplementation(() => disposePending),
      };
      const slowAl = makeStrategy('idle'); // start agora é instantâneo — sync vem do dispose pendente
      const manager = new VoiceModeManager({
        'wake-word': () => ww,
        'always-listening': () => slowAl,
      });
      await manager.init();

      // Inicia primeira transição — vai bloquear no await activeStrategy.dispose()
      const first = manager.setMode('always-listening');
      // Aguarda observavelmente até o dispose da Strategy antiga ser invocado.
      // Esse é o ponto onde transitioning=true e a segunda chamada deve ser rejeitada.
      await vi.waitFor(() => expect(ww.dispose).toHaveBeenCalled());
      // Segunda transição: deve ser rejeitada pelo guard de transitioning.
      const second = manager.setMode('ptt-only');
      // Libera a primeira transição.
      resolveDispose!();
      const [firstResult, secondResult] = await Promise.all([first, second]);
      expect(firstResult).toBe(true);
      expect(secondResult).toBe(false);
    });
  });
});

// ============================================================
// Phase 43 — D-04 Plano B (recovery em catch da nova factory)
// ============================================================
describe('VoiceModeManager — D-04 plano B (Phase 43)', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Store as any).__resetStore();
  });

  it('D-04 sucesso: factory antiga é re-instanciada quando nova falha', async () => {
    const ww = makeStrategy('idle');
    const ptt = makeStrategy('idle');
    let pttCallCount = 0;
    const failingPttFactory = vi.fn().mockImplementation(() => {
      pttCallCount += 1;
      if (pttCallCount === 1) throw new Error('PttOnlyStrategy not ready');
      return ptt;
    });

    const manager = new VoiceModeManager({
      'wake-word': () => ww,
      'ptt-only': failingPttFactory,
    });
    await manager.init();

    const result = await manager.setMode('ptt-only');

    expect(result).toBe(false);
    expect(manager.getMode()).toBe('wake-word');
    // ww.dispose chamado uma vez (no início), start chamado 2x (init + recovery)
    expect(ww.dispose).toHaveBeenCalledTimes(1);
    expect(ww.start).toHaveBeenCalledTimes(2);
  });

  it('D-04 fallback: recovery TAMBÉM falha → currentMode = null + activeStrategy = null', async () => {
    // Factory wake-word falha NA RECOVERY (segunda chamada)
    let wwCallCount = 0;
    const wwFactory = vi.fn().mockImplementation(() => {
      wwCallCount += 1;
      if (wwCallCount === 1) {
        return makeStrategy('idle'); // init OK
      }
      throw new Error('wake-word also failed in recovery');
    });
    const failingPttFactory = vi.fn().mockImplementation(() => {
      throw new Error('PttOnlyStrategy not ready');
    });

    const manager = new VoiceModeManager({
      'wake-word': wwFactory,
      'ptt-only': failingPttFactory,
    });
    await manager.init();

    const result = await manager.setMode('ptt-only');

    expect(result).toBe(false);
    // FALLBACK: currentMode = null
    expect(manager.getMode()).toBeNull();
  });

  it('D-04 não emite voiceMode:change durante recovery (silencioso)', async () => {
    const ww = makeStrategy('idle');
    const failingPttFactory = vi.fn().mockImplementation(() => {
      throw new Error('PttOnlyStrategy not ready');
    });
    const manager = new VoiceModeManager({
      'wake-word': () => ww,
      'ptt-only': failingPttFactory,
    });
    await manager.init();

    const events: VoiceModeChangeEvent[] = [];
    manager.on('voiceMode:change', (e) => events.push(e));

    await manager.setMode('ptt-only');

    expect(events).toHaveLength(0);
  });

  it('D-04 atomicidade: transitioning permanece true durante recovery (concurrent setMode rejeitado)', async () => {
    let resolveDispose!: () => void;
    const disposePending = new Promise<void>((r) => { resolveDispose = r; });
    const ww = {
      ...makeStrategy('idle'),
      dispose: vi.fn().mockImplementation(() => disposePending),
    };
    const failingPttFactory = vi.fn().mockImplementation(() => {
      throw new Error('PttOnlyStrategy not ready');
    });
    const manager = new VoiceModeManager({
      'wake-word': () => ww,
      'ptt-only': failingPttFactory,
    });
    await manager.init();

    const first = manager.setMode('ptt-only'); // vai bloquear no dispose
    await vi.waitFor(() => expect(ww.dispose).toHaveBeenCalled());
    // Durante o setMode (dispose pending → recovery), transitioning está true.
    const second = manager.setMode('ptt-only');
    resolveDispose();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toBe(false); // PTT factory falhou
    expect(secondResult).toBe(false); // Rejeitado por transitioning
  });

  it('D-04 oldMode null edge case: setMode após estado degradado tenta entrar', async () => {
    // Setup: força estado degradado
    let wwFailed = false;
    const wwFactory = vi.fn().mockImplementation(() => {
      if (wwFailed) throw new Error('wake-word recovery failed');
      return makeStrategy('idle');
    });
    const failingPttFactory = vi.fn().mockImplementation(() => {
      throw new Error('ptt failed');
    });
    const al = makeStrategy('idle');
    const manager = new VoiceModeManager({
      'wake-word': wwFactory,
      'ptt-only': failingPttFactory,
      'always-listening': () => al,
    });
    await manager.init();

    wwFailed = true; // próxima chamada wakeword vai falhar
    await manager.setMode('ptt-only'); // ptt fail + ww recovery fail → null state

    expect(manager.getMode()).toBeNull();

    // Nova tentativa de modo válido sai do estado degradado
    wwFailed = false;
    const result = await manager.setMode('always-listening');
    expect(result).toBe(true);
    expect(manager.getMode()).toBe('always-listening');
  });
});

// ---- WakeWordStrategy stub ----

describe('WakeWordStrategy stub (Phase 39)', () => {
  it("getStatus() returns 'idle' (stub safe default)", () => {
    const strategy = new WakeWordStrategy();
    expect(strategy.getStatus()).toBe('idle');
  });

  it('start(), stop(), dispose() resolve without throwing', async () => {
    const strategy = new WakeWordStrategy();
    await expect(strategy.start()).resolves.toBeUndefined();
    await expect(strategy.stop()).resolves.toBeUndefined();
    await expect(strategy.dispose()).resolves.toBeUndefined();
  });
});
