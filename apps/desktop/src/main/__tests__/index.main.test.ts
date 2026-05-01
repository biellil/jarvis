/**
 * index.main.test.ts — Whisper model selection logic tests (PATCH-02)
 *
 * Tests the selectWhisperModel helper that will be used in main/index.ts
 * to apply user override after VRAM detection.
 *
 * Covers all branches from RESEARCH.md § Whisper Model Selection Pattern.
 */
import { describe, it, expect } from 'vitest';
import { selectWhisperModel } from '../voiceInput/selectWhisperModel.js';

describe('selectWhisperModel (PATCH-02)', () => {
  describe('override = auto → VRAM selection wins', () => {
    it('returns large when override is auto and VRAM selected large', () => {
      expect(selectWhisperModel('large', 'auto')).toBe('large');
    });

    it('returns base when override is auto and VRAM selected base', () => {
      expect(selectWhisperModel('base', 'auto')).toBe('base');
    });

    it('returns medium when override is auto and VRAM selected medium', () => {
      expect(selectWhisperModel('medium', 'auto')).toBe('medium');
    });
  });

  describe('override = supported value → user choice wins', () => {
    it('returns medium when override is medium (user downgrade from large)', () => {
      expect(selectWhisperModel('large', 'medium')).toBe('medium');
    });

    it('returns tiny when override is tiny', () => {
      expect(selectWhisperModel('large', 'tiny')).toBe('tiny');
    });

    it('returns medium when override is medium (user upgrade from tiny)', () => {
      expect(selectWhisperModel('tiny', 'medium')).toBe('medium');
    });

    it('returns base when override is base', () => {
      expect(selectWhisperModel('medium', 'base')).toBe('base');
    });
  });

  describe('override = unsupported value → VRAM selection wins with warning', () => {
    it('returns vramModel when override is small (not in supported list)', () => {
      expect(selectWhisperModel('medium', 'small')).toBe('medium');
    });

    it('returns vramModel when override is large-v3-turbo (not in supported list)', () => {
      expect(selectWhisperModel('base', 'large-v3-turbo')).toBe('base');
    });
  });
});
