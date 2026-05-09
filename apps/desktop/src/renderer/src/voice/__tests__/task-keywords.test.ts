import { describe, it, expect } from 'vitest';
import {
  CONFIRM_KEYWORDS,
  CANCEL_KEYWORDS,
  EDIT_PREFIXES,
  matchTaskKeyword,
} from '../task-keywords.js';

describe('matchTaskKeyword (renderer mirror)', () => {
  it('renderer matchTaskKeyword has IDENTICAL behavior to backend agent/keywords.ts (snapshot test)', async () => {
    // Read backend keywords.ts at test time — fails build on drift (T-66-04-04)
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    // CWD during vitest is apps/desktop; backend is 1 level up (sibling apps/backend-ts)
    const backendPath = path.resolve(
      process.cwd(),
      '../backend-ts/src/agent/keywords.ts',
    );
    const txt = await fs.readFile(backendPath, 'utf8');

    // Parse CONFIRM_KEYWORDS list
    const confirmMatch = txt.match(/CONFIRM_KEYWORDS\s*=\s*\[([\s\S]+?)\]/);
    expect(confirmMatch, 'Could not find CONFIRM_KEYWORDS in backend keywords.ts').toBeTruthy();
    const backendConfirm = (confirmMatch![1].match(/'([^']+)'/g) ?? []).map((s) => s.slice(1, -1));
    expect(backendConfirm).toEqual([...CONFIRM_KEYWORDS]);

    // Parse CANCEL_KEYWORDS list
    const cancelMatch = txt.match(/CANCEL_KEYWORDS\s*=\s*\[([\s\S]+?)\]/);
    expect(cancelMatch, 'Could not find CANCEL_KEYWORDS in backend keywords.ts').toBeTruthy();
    const backendCancel = (cancelMatch![1].match(/'([^']+)'/g) ?? []).map((s) => s.slice(1, -1));
    expect(backendCancel).toEqual([...CANCEL_KEYWORDS]);

    // Parse EDIT_PREFIXES list
    const editMatch = txt.match(/EDIT_PREFIXES\s*=\s*\[([\s\S]+?)\]/);
    expect(editMatch, 'Could not find EDIT_PREFIXES in backend keywords.ts').toBeTruthy();
    const backendEdit = (editMatch![1].match(/'([^']+)'/g) ?? []).map((s) => s.slice(1, -1));
    expect(backendEdit).toEqual([...EDIT_PREFIXES]);
  });

  it('confirm keywords match only during awaiting-confirmation', () => {
    // "vai" is a confirm keyword
    expect(matchTaskKeyword('vai', 'awaiting-confirmation')).toEqual({ kind: 'confirm' });
    expect(matchTaskKeyword('sim', 'awaiting-confirmation')).toEqual({ kind: 'confirm' });
    expect(matchTaskKeyword('confirma', 'awaiting-confirmation')).toEqual({ kind: 'confirm' });
    // confirm does NOT match during executing
    expect(matchTaskKeyword('vai', 'executing')).toBeNull();
    expect(matchTaskKeyword('sim', 'executing')).toBeNull();
  });

  it('cancel keywords match during BOTH awaiting-confirmation AND executing', () => {
    expect(matchTaskKeyword('cancela', 'awaiting-confirmation')).toEqual({ kind: 'cancel' });
    expect(matchTaskKeyword('cancela', 'executing')).toEqual({ kind: 'cancel' });
    expect(matchTaskKeyword('para', 'awaiting-confirmation')).toEqual({ kind: 'cancel' });
    expect(matchTaskKeyword('para', 'executing')).toEqual({ kind: 'cancel' });
    expect(matchTaskKeyword('stop', 'executing')).toEqual({ kind: 'cancel' });
    expect(matchTaskKeyword('cancela isso', 'executing')).toEqual({ kind: 'cancel' });
    expect(matchTaskKeyword('para tudo', 'executing')).toEqual({ kind: 'cancel' });
  });

  it('edit prefix returns feedback after first word', () => {
    expect(matchTaskKeyword('edita o passo 1', 'awaiting-confirmation')).toEqual({
      kind: 'edit',
      feedback: 'o passo 1',
    });
    expect(matchTaskKeyword('muda o terceiro passo', 'awaiting-confirmation')).toEqual({
      kind: 'edit',
      feedback: 'o terceiro passo',
    });
    // bare prefix → open edit mode (empty feedback)
    expect(matchTaskKeyword('edita', 'awaiting-confirmation')).toEqual({
      kind: 'edit',
      feedback: '',
    });
    // edit does NOT match during executing
    expect(matchTaskKeyword('edita o passo 1', 'executing')).toBeNull();
  });

  it('Whisper-style trailing punctuation ("cancela.", "cancela!", "cancela?") all match cancel', () => {
    expect(matchTaskKeyword('cancela.', 'awaiting-confirmation')).toEqual({ kind: 'cancel' });
    expect(matchTaskKeyword('cancela!', 'executing')).toEqual({ kind: 'cancel' });
    expect(matchTaskKeyword('cancela?', 'awaiting-confirmation')).toEqual({ kind: 'cancel' });
    expect(matchTaskKeyword('sim.', 'awaiting-confirmation')).toEqual({ kind: 'confirm' });
  });

  it('non-keyword utterances return null', () => {
    expect(matchTaskKeyword('o tempo está bom hoje', 'awaiting-confirmation')).toBeNull();
    expect(matchTaskKeyword('o tempo está bom hoje', 'executing')).toBeNull();
    expect(matchTaskKeyword('', 'awaiting-confirmation')).toBeNull();
    expect(matchTaskKeyword('   ', 'executing')).toBeNull();
  });
});
