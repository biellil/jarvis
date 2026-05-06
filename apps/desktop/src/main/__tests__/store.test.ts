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
  getVoiceMode,
  setVoiceMode,
  getVadSilenceThresholdMs,
  setVadSilenceThresholdMs,
  getTtsVoiceId,
  setTtsVoiceId,
  getStreamingTtsEnabled,
  setStreamingTtsEnabled,
  getGeminiApiKey,
  setGeminiApiKey,
  getOpenaiApiKey,
  setOpenaiApiKey,
  getAnthropicApiKey,
  setAnthropicApiKey,
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

// ============================================================
// QUICK-260427-tjc — getTtsVoiceId / setTtsVoiceId per-provider
// ============================================================

describe('store.ts — getTtsVoiceId / setTtsVoiceId (QUICK-260427-tjc)', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Store as any).__resetStore();
  });

  it("getTtsVoiceId('murf') returns '' when store is empty", () => {
    expect(getTtsVoiceId('murf')).toBe('');
  });

  it("getTtsVoiceId('elevenlabs') returns '' when store is empty", () => {
    expect(getTtsVoiceId('elevenlabs')).toBe('');
  });

  it("setTtsVoiceId('murf', 'pt-BR-gustavo') → getTtsVoiceId('murf') returns 'pt-BR-gustavo'", () => {
    setTtsVoiceId('murf', 'pt-BR-gustavo');
    expect(getTtsVoiceId('murf')).toBe('pt-BR-gustavo');
  });

  it("setTtsVoiceId on one provider does NOT affect the other (isolation)", () => {
    setTtsVoiceId('murf', 'pt-BR-gustavo');
    setTtsVoiceId('elevenlabs', 'EXAVITQu4vr4xnSDxMaL');
    expect(getTtsVoiceId('murf')).toBe('pt-BR-gustavo');
    expect(getTtsVoiceId('elevenlabs')).toBe('EXAVITQu4vr4xnSDxMaL');
  });

  it("setTtsVoiceId persists under store key 'ttsVoiceIds' as { murf?, elevenlabs? }", () => {
    setTtsVoiceId('murf', 'pt-BR-yago');
    setTtsVoiceId('elevenlabs', 'voice-id-123');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backing = (Store as any).__getBackingStore();
    expect(backing).toHaveProperty('ttsVoiceIds');
    expect(backing.ttsVoiceIds).toEqual({ murf: 'pt-BR-yago', elevenlabs: 'voice-id-123' });
  });

  it('setTtsVoiceId silently rejects non-string input (defensive guard)', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setTtsVoiceId('murf', 123 as any);
    expect(getTtsVoiceId('murf')).toBe('');
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// ============================================================
// Phase 39 Voice Mode — store.ts voiceMode accessors
// ============================================================

describe('store.ts — Voice Mode accessors (Phase 39)', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Store as any).__resetStore();
  });

  it("getVoiceMode() returns 'wake-word' when not set (D-07 migration default)", () => {
    expect(getVoiceMode()).toBe('wake-word');
  });

  it("setVoiceMode('always-listening') → getVoiceMode() returns 'always-listening'", () => {
    setVoiceMode('always-listening');
    expect(getVoiceMode()).toBe('always-listening');
  });

  it("setVoiceMode('ptt-only') → getVoiceMode() returns 'ptt-only'", () => {
    setVoiceMode('ptt-only');
    expect(getVoiceMode()).toBe('ptt-only');
  });

  it("setVoiceMode writes value directly to store key 'voiceMode'", () => {
    setVoiceMode('always-listening');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backing = (Store as any).__getBackingStore();
    expect(backing).toHaveProperty('voiceMode', 'always-listening');
  });

  it("getVoiceMode() returns 'wake-word' when store contains invalid value (T-39-01 mitigation)", () => {
    // Simula edição manual do JSON do electron-store
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backing = (Store as any).__getBackingStore();
    backing['voiceMode'] = 'invalid-mode';
    expect(getVoiceMode()).toBe('wake-word');
  });
});

// ============================================================
// Phase 40 Always-Listening — VAD Silence Threshold accessors (VLISTEN-04, T-40-VAD)
// ============================================================

describe('VAD Silence Threshold accessors (Phase 40 — VLISTEN-04, T-40-VAD)', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Store as any).__resetStore();
  });

  it('getVadSilenceThresholdMs() returns 500 when not set (D-07 upgrade default)', () => {
    expect(getVadSilenceThresholdMs()).toBe(500);
  });

  it('setVadSilenceThresholdMs(600) → getVadSilenceThresholdMs() returns 600', () => {
    setVadSilenceThresholdMs(600);
    expect(getVadSilenceThresholdMs()).toBe(600);
  });

  it('setVadSilenceThresholdMs(100) clamps to 300 (T-40-VAD min boundary)', () => {
    setVadSilenceThresholdMs(100);
    expect(getVadSilenceThresholdMs()).toBe(300);
  });

  it('setVadSilenceThresholdMs(1000) clamps to 800 (T-40-VAD max boundary)', () => {
    setVadSilenceThresholdMs(1000);
    expect(getVadSilenceThresholdMs()).toBe(800);
  });

  it('getVadSilenceThresholdMs() returns 500 when store contains value below 300 (corruption guard)', () => {
    // Simula corrupção direta do JSON do electron-store (usuário editou manualmente)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backing = (Store as any).__getBackingStore();
    backing['vadSilenceThresholdMs'] = 50;
    expect(getVadSilenceThresholdMs()).toBe(500);
  });
});

// ============================================================
// Phase 44 (VHARD-01): Migration v1.8 → v1.9 (D-11, D-12, D-13)
// ============================================================

describe('store.ts — Migration v1.8 → v1.9 (Phase 44, D-11/D-12/D-13)', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Store as any).__resetStore();
  });

  it('D-12: getVoiceMode() retorna wake-word quando store tem campos v1.8 mas voiceMode ausente', () => {
    // Simula estado de um store v1.8: tem outros campos configurados pelo usuário,
    // mas voiceMode ainda não existe (campo foi introduzido na v1.9)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backing = (Store as any).__getBackingStore();
    backing['wakeWordPaused'] = false;
    backing['hotkey'] = 'CommandOrControl+Shift+J';
    // voiceMode NÃO está no backing — simula store v1.8 real

    expect(getVoiceMode()).toBe('wake-word');
  });

  it('D-12: getVoiceMode() não lança exceção quando voiceMode ausente (upgrade sem crash)', () => {
    expect(() => getVoiceMode()).not.toThrow();
  });

  it('D-13: não existe função de migration separada em store.ts — lógica está em getVoiceMode()', () => {
    // D-13: getVoiceMode() é a implementação canônica — sem runMigration(), migrateStore() etc.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const path = require('path') as typeof import('path');
    const storeSource = fs.readFileSync(
      path.join(__dirname, '..', 'store.ts'),
      'utf-8',
    );
    expect(storeSource).not.toContain('migrateStore');
    expect(storeSource).not.toContain('runMigration');
    expect(storeSource).toContain('getVoiceMode');
    expect(storeSource).toContain("'wake-word'");
  });
});

// ============================================================
// Phase 53 Plan 03 — Streaming TTS feature flag (STTS-02, D-10, D-11)
// ============================================================

describe('store.ts — Streaming TTS flag (Phase 53 Plan 03)', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Store as any).__resetStore();
  });

  it('getStreamingTtsEnabled() returns false when not set (D-10 default)', () => {
    expect(getStreamingTtsEnabled()).toBe(false);
  });

  it('setStreamingTtsEnabled(true) → getStreamingTtsEnabled() returns true', () => {
    setStreamingTtsEnabled(true);
    expect(getStreamingTtsEnabled()).toBe(true);
  });

  it('setStreamingTtsEnabled(false) → getStreamingTtsEnabled() returns false', () => {
    setStreamingTtsEnabled(true);
    setStreamingTtsEnabled(false);
    expect(getStreamingTtsEnabled()).toBe(false);
  });

  it("uses 'streamingTtsEnabled' as the store key", () => {
    setStreamingTtsEnabled(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backing = (Store as any).__getBackingStore();
    expect(backing).toHaveProperty('streamingTtsEnabled', true);
  });

  it('setStreamingTtsEnabled with non-boolean is silently rejected (typeof guard)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setStreamingTtsEnabled('yes' as any);
    expect(getStreamingTtsEnabled()).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setStreamingTtsEnabled(1 as any);
    expect(getStreamingTtsEnabled()).toBe(false);
  });

  it('getStreamingTtsEnabled() falls back to false when store contains non-boolean (corruption guard)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backing = (Store as any).__getBackingStore();
    backing['streamingTtsEnabled'] = 'truthy-but-not-boolean';
    expect(getStreamingTtsEnabled()).toBe(false);
  });
});

// ============================================================
// Phase 57 — Cloud LLM API key accessors (LLM-PROV-01)
// ============================================================

describe('Cloud LLM API key accessors (Phase 57)', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Store as any).__resetStore();
  });

  it('getGeminiApiKey returns empty string when not set', () => {
    expect(getGeminiApiKey()).toBe('');
  });

  it('setGeminiApiKey and getGeminiApiKey round-trip', () => {
    setGeminiApiKey('AIzaSy-test');
    expect(getGeminiApiKey()).toBe('AIzaSy-test');
  });

  it('getOpenaiApiKey returns empty string when not set', () => {
    expect(getOpenaiApiKey()).toBe('');
  });

  it('setOpenaiApiKey and getOpenaiApiKey round-trip', () => {
    setOpenaiApiKey('sk-proj-test');
    expect(getOpenaiApiKey()).toBe('sk-proj-test');
  });

  it('getAnthropicApiKey returns empty string when not set', () => {
    expect(getAnthropicApiKey()).toBe('');
  });

  it('setAnthropicApiKey and getAnthropicApiKey round-trip', () => {
    setAnthropicApiKey('sk-ant-test');
    expect(getAnthropicApiKey()).toBe('sk-ant-test');
  });
});
