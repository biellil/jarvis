import { describe, it, expect } from 'vitest';
import { matchTaskKeyword, CONFIRM_KEYWORDS, CANCEL_KEYWORDS, EDIT_PREFIXES } from '../keywords.js';

describe('keyword constants', () => {
  it('CONFIRM_KEYWORDS has 11 entries (UI-SPEC line 366)', () => {
    expect(CONFIRM_KEYWORDS).toHaveLength(11);
  });
  it('CANCEL_KEYWORDS has 11 entries (UI-SPEC line 369)', () => {
    expect(CANCEL_KEYWORDS).toHaveLength(11);
  });
  it('EDIT_PREFIXES has 12 entries (UI-SPEC line 372)', () => {
    expect(EDIT_PREFIXES).toHaveLength(12);
  });
});

describe('matchTaskKeyword', () => {
  describe('confirm during awaiting-confirmation', () => {
    it('matches "vai" → confirm', () => {
      expect(matchTaskKeyword('vai', 'awaiting-confirmation')).toEqual({ kind: 'confirm' });
    });
    it('matches "Sim." (case + trailing period) → confirm', () => {
      expect(matchTaskKeyword('Sim.', 'awaiting-confirmation')).toEqual({ kind: 'confirm' });
    });
    it('does NOT match "vai" during executing', () => {
      expect(matchTaskKeyword('vai', 'executing')).toBeNull();
    });
  });

  describe('cancel during BOTH states', () => {
    it('matches "cancela" during awaiting-confirmation', () => {
      expect(matchTaskKeyword('cancela', 'awaiting-confirmation')).toEqual({ kind: 'cancel' });
    });
    it('matches "para" during executing', () => {
      expect(matchTaskKeyword('para', 'executing')).toEqual({ kind: 'cancel' });
    });
  });

  describe('edit prefix matching during awaiting-confirmation', () => {
    it('matches "edita" alone → kind:edit, feedback:""', () => {
      expect(matchTaskKeyword('edita', 'awaiting-confirmation')).toEqual({ kind: 'edit', feedback: '' });
    });
    it('matches "muda o passo 3 para X" → kind:edit, feedback:"o passo 3 para X"', () => {
      expect(matchTaskKeyword('muda o passo 3 para X', 'awaiting-confirmation'))
        .toEqual({ kind: 'edit', feedback: 'o passo 3 para X' });
    });
    it('does NOT match edit during executing', () => {
      expect(matchTaskKeyword('edita', 'executing')).toBeNull();
    });
  });

  it('returns null for empty/whitespace input', () => {
    expect(matchTaskKeyword('   ', 'awaiting-confirmation')).toBeNull();
  });

  it.todo('handles utterances with leading filler "uh/eh/é" (deferred — UI-SPEC notes ±leading filler)');
});
