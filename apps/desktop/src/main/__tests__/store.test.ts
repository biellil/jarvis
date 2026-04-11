/**
 * store.ts tests — Phase 23 Plan 02
 *
 * Cobre o realinhamento semântico: wakeWordEnabled → wakeWordPaused (D-03, D-04)
 * + defensive boolean check (T-23-02-01 mitigation).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock shared entre todos os testes — replica padrão de hotkey.test.ts
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

// Importar DEPOIS do vi.mock
import Store from 'electron-store';
import { getWakeWordPaused, setWakeWordPaused } from '../store';

describe('store.ts — wake word paused (Phase 23 Plan 02)', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Store as any).__resetStore();
  });

  describe('D-04: default value false', () => {
    it('getWakeWordPaused() returns false on first read (no store entry)', () => {
      expect(getWakeWordPaused()).toBe(false);
    });
  });

  describe('get/set roundtrip', () => {
    it('setWakeWordPaused(true) → getWakeWordPaused() returns true', () => {
      setWakeWordPaused(true);
      expect(getWakeWordPaused()).toBe(true);
    });

    it('setWakeWordPaused(false) → getWakeWordPaused() returns false', () => {
      setWakeWordPaused(true);
      setWakeWordPaused(false);
      expect(getWakeWordPaused()).toBe(false);
    });

    it("uses 'wakeWordPaused' as the store key", () => {
      setWakeWordPaused(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const backing = (Store as any).__getBackingStore();
      expect(backing).toHaveProperty('wakeWordPaused', true);
      expect(backing).not.toHaveProperty('wakeWordEnabled');
    });
  });

  describe('T-23-02-01: defensive boolean check', () => {
    it('setWakeWordPaused with non-boolean is silently rejected', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setWakeWordPaused('yes' as any);
      expect(getWakeWordPaused()).toBe(false);
      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });

    it('setWakeWordPaused with number is silently rejected', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setWakeWordPaused(1 as any);
      expect(getWakeWordPaused()).toBe(false);
      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });
});
