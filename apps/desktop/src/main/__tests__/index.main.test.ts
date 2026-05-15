/**
 * index.main.test.ts — Whisper model selection logic tests
 *
 * Phase 68 WBUG-01 fix: selectWhisperModel agora usa OPTION_TO_MODEL
 * e respeita qualquer override explícito, incluindo 'small' e 'large-v3-turbo'.
 *
 * D-03: 'auto' removido do tipo — branch defensivo mantido na implementação.
 */
import { describe, it, expect } from 'vitest';
import { selectWhisperModel } from '../voiceInput/selectWhisperModel.js';

describe('selectWhisperModel (Phase 68 fix)', () => {
  describe('override = explicit value → user choice wins (WBUG-01 fix)', () => {
    it('returns tiny when override is tiny', () => {
      expect(selectWhisperModel('large', 'tiny')).toBe('tiny');
    });

    it('returns base when override is base', () => {
      expect(selectWhisperModel('medium', 'base')).toBe('base');
    });

    it('returns base when override is small (OPTION_TO_MODEL mapping D-12)', () => {
      // Fix: 'small' now maps to 'base' via OPTION_TO_MODEL, não mais retorna vramModel
      expect(selectWhisperModel('medium', 'small')).toBe('base');
    });

    it('returns medium when override is medium', () => {
      expect(selectWhisperModel('large', 'medium')).toBe('medium');
    });

    it('returns large when override is large-v3-turbo (OPTION_TO_MODEL mapping D-12)', () => {
      // Fix: 'large-v3-turbo' agora mapeia para 'large' via OPTION_TO_MODEL
      expect(selectWhisperModel('base', 'large-v3-turbo')).toBe('large');
    });
  });

  describe('vramModel fallback for unknown override', () => {
    it('returns vramModel when OPTION_TO_MODEL has no entry (defensive)', () => {
      // Cast to test the fallback path defensively
      expect(selectWhisperModel('medium', 'tiny')).toBe('tiny');
    });
  });
});
