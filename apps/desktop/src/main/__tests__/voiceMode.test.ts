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

  describe('WR-01: setMode() does not persist when new Strategy fails to start', () => {
    it('returns false, leaves currentMode unchanged, and does NOT persist when factory throws', async () => {
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
    });

    it('returns false when start() rejects after construction succeeds', async () => {
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
