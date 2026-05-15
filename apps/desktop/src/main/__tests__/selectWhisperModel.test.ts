/**
 * selectWhisperModel.test.ts — Matriz de regressão 5×3 para WBUG-01.
 *
 * Garante que para qualquer override explícito, selectWhisperModel retorna
 * OPTION_TO_MODEL[override] independente do vramModel recebido (D-10).
 *
 * Matriz: 5 UI options × 3 VRAM scenarios = 15 casos + 1 defensivo (legacy auto).
 *
 * D-09: cobre tiny, base, small, medium, large-v3-turbo contra vramModel:
 *   'tiny' (CPU), 'base' (GPU baixo), 'large' (GPU alto)
 *
 * D-10: asserção crítica — VRAM nunca sobrescreve override explícito do usuário.
 * D-12: small→base, large-v3-turbo→large (mapeados por OPTION_TO_MODEL).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WhisperModelOption } from '../../shared/ipc-types.js';

// Mock electron para evitar Electron-specific imports em testes
vi.mock('electron', () => ({
  app: { isPackaged: false },
}));

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('selectWhisperModel', () => {
  describe('override: tiny — VRAM nunca sobrescreve (D-10)', () => {
    it('vramModel=tiny → tiny', async () => {
      const { selectWhisperModel } = await import('../voiceInput/selectWhisperModel.js');
      expect(selectWhisperModel('tiny', 'tiny')).toBe('tiny');
    });

    it('vramModel=base → tiny', async () => {
      const { selectWhisperModel } = await import('../voiceInput/selectWhisperModel.js');
      expect(selectWhisperModel('base', 'tiny')).toBe('tiny');
    });

    it('vramModel=large → tiny', async () => {
      const { selectWhisperModel } = await import('../voiceInput/selectWhisperModel.js');
      expect(selectWhisperModel('large', 'tiny')).toBe('tiny');
    });
  });

  describe('override: base', () => {
    it('vramModel=tiny → base', async () => {
      const { selectWhisperModel } = await import('../voiceInput/selectWhisperModel.js');
      expect(selectWhisperModel('tiny', 'base')).toBe('base');
    });

    it('vramModel=base → base', async () => {
      const { selectWhisperModel } = await import('../voiceInput/selectWhisperModel.js');
      expect(selectWhisperModel('base', 'base')).toBe('base');
    });

    it('vramModel=large → base', async () => {
      const { selectWhisperModel } = await import('../voiceInput/selectWhisperModel.js');
      expect(selectWhisperModel('large', 'base')).toBe('base');
    });
  });

  describe('override: small (mapeia para base via OPTION_TO_MODEL D-12)', () => {
    it('vramModel=tiny → base', async () => {
      const { selectWhisperModel } = await import('../voiceInput/selectWhisperModel.js');
      expect(selectWhisperModel('tiny', 'small')).toBe('base');
    });

    it('vramModel=base → base', async () => {
      const { selectWhisperModel } = await import('../voiceInput/selectWhisperModel.js');
      expect(selectWhisperModel('base', 'small')).toBe('base');
    });

    it('vramModel=large → base (D-10: GPU alto NÃO sobrescreve small→base)', async () => {
      const { selectWhisperModel } = await import('../voiceInput/selectWhisperModel.js');
      // Este é o caso crítico do bug original: override='small' nunca deve retornar 'large'
      expect(selectWhisperModel('large', 'small')).toBe('base');
    });
  });

  describe('override: medium', () => {
    it('vramModel=tiny → medium', async () => {
      const { selectWhisperModel } = await import('../voiceInput/selectWhisperModel.js');
      expect(selectWhisperModel('tiny', 'medium')).toBe('medium');
    });

    it('vramModel=base → medium', async () => {
      const { selectWhisperModel } = await import('../voiceInput/selectWhisperModel.js');
      expect(selectWhisperModel('base', 'medium')).toBe('medium');
    });

    it('vramModel=large → medium', async () => {
      const { selectWhisperModel } = await import('../voiceInput/selectWhisperModel.js');
      expect(selectWhisperModel('large', 'medium')).toBe('medium');
    });
  });

  describe('override: large-v3-turbo (mapeia para large via OPTION_TO_MODEL D-12)', () => {
    it('vramModel=tiny → large', async () => {
      const { selectWhisperModel } = await import('../voiceInput/selectWhisperModel.js');
      expect(selectWhisperModel('tiny', 'large-v3-turbo')).toBe('large');
    });

    it('vramModel=base → large', async () => {
      const { selectWhisperModel } = await import('../voiceInput/selectWhisperModel.js');
      expect(selectWhisperModel('base', 'large-v3-turbo')).toBe('large');
    });

    it('vramModel=large → large', async () => {
      const { selectWhisperModel } = await import('../voiceInput/selectWhisperModel.js');
      expect(selectWhisperModel('large', 'large-v3-turbo')).toBe('large');
    });
  });

  describe('defensivo: legacy auto override retorna vramModel', () => {
    it('vramModel=medium, override=auto (legado) → medium', async () => {
      const { selectWhisperModel } = await import('../voiceInput/selectWhisperModel.js');
      // Branch defensivo: 'auto' não está mais no tipo WhisperModelOption mas pode
      // existir em stores não migrados. Deve retornar o vramModel passado.
      expect(selectWhisperModel('medium', 'auto' as unknown as WhisperModelOption)).toBe('medium');
    });
  });
});
