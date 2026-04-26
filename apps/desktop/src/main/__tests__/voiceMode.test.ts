/**
 * voiceMode.test.ts — VoiceModeManager state machine tests
 *
 * Phase 39: VMODE-01 (exclusividade), VMODE-02 (persistence), VMODE-03 (EventEmitter)
 * Cobre todas as decisões D-01 a D-08.
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

    it("setMode() blocked when active strategy status is 'capturing' — returns false (D-01 + D-02)", async () => {
      const capturingStrategy = makeStrategy('capturing');
      const manager = new VoiceModeManager({ 'wake-word': () => capturingStrategy });
      await manager.init();
      const result = await manager.setMode('ptt-only');
      expect(result).toBe(false);
      expect(manager.getMode()).toBe('wake-word');
    });

    it("setMode() blocked when active strategy status is 'processing' — returns false (D-01 + D-02)", async () => {
      const processingStrategy = makeStrategy('processing');
      const manager = new VoiceModeManager({ 'wake-word': () => processingStrategy });
      await manager.init();
      const result = await manager.setMode('always-listening');
      expect(result).toBe(false);
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

  // ---- Race condition guard ----

  describe('Race condition guard (transitioning flag)', () => {
    it('concurrent setMode() calls: second call returns false while first is in progress', async () => {
      let resolveTransition: (() => void) | undefined;
      const startPending = new Promise<void>((r) => { resolveTransition = r; });
      const slowAl = {
        start: vi.fn().mockImplementation(() => startPending),
        stop: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn().mockResolvedValue(undefined),
        getStatus: vi.fn().mockReturnValue('idle' as const),
      };
      const ww = makeStrategy('idle');
      const manager = new VoiceModeManager({
        'wake-word': () => ww,
        'always-listening': () => slowAl,
      });
      await manager.init();

      // Inicia primeira transição (vai bloquear em start() do slowAl).
      const first = manager.setMode('always-listening');
      // Aguarda microtasks para que o setMode interno chegue ao await activeStrategy.start()
      // (passou pelo dispose do ww e pela construção do slowAl).
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      // Segunda transição deve ser rejeitada enquanto primeira ainda está ativa.
      const second = manager.setMode('ptt-only');
      // Libera a primeira transição.
      resolveTransition!();
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
