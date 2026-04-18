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
import {
  getWakeWordPaused,
  setWakeWordPaused,
  getTtsProvider,
  setTtsProvider,
  getTtsApiKey,
  setTtsApiKey,
  getWhisperModelOverride,
  setWhisperModelOverride,
} from '../store';

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

// ============================================================
// Phase 34 Settings UI — store.ts new fields
// ============================================================

describe('store.ts — Phase 34 Settings fields', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Store as any).__resetStore();
  });

  describe('getTtsProvider / setTtsProvider', () => {
    it("getTtsProvider() returns 'elevenlabs' when not set (default)", () => {
      expect(getTtsProvider()).toBe('elevenlabs');
    });

    it("setTtsProvider('murf') → getTtsProvider() returns 'murf'", () => {
      setTtsProvider('murf');
      expect(getTtsProvider()).toBe('murf');
    });

    it("setTtsProvider writes { name: 'murf' } to store key 'ttsProvider'", () => {
      setTtsProvider('murf');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const backing = (Store as any).__getBackingStore();
      expect(backing).toHaveProperty('ttsProvider', { name: 'murf' });
    });
  });

  describe('getTtsApiKey / setTtsApiKey', () => {
    it("getTtsApiKey() returns '' when not set", () => {
      expect(getTtsApiKey()).toBe('');
    });

    it("setTtsApiKey('my-key') → getTtsApiKey() returns 'my-key'", () => {
      setTtsApiKey('my-key');
      expect(getTtsApiKey()).toBe('my-key');
    });

    it("setTtsApiKey writes { key: 'my-key' } to store key 'ttsApiKey'", () => {
      setTtsApiKey('my-key');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const backing = (Store as any).__getBackingStore();
      expect(backing).toHaveProperty('ttsApiKey', { key: 'my-key' });
    });
  });

  describe('getWhisperModelOverride / setWhisperModelOverride', () => {
    it("getWhisperModelOverride() returns 'auto' when not set", () => {
      expect(getWhisperModelOverride()).toBe('auto');
    });

    it("setWhisperModelOverride('tiny') → getWhisperModelOverride() returns 'tiny'", () => {
      setWhisperModelOverride('tiny');
      expect(getWhisperModelOverride()).toBe('tiny');
    });

    it("setWhisperModelOverride writes { model: 'tiny' } to store key 'whisperModelOverride'", () => {
      setWhisperModelOverride('tiny');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const backing = (Store as any).__getBackingStore();
      expect(backing).toHaveProperty('whisperModelOverride', { model: 'tiny' });
    });
  });
});
