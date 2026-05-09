import { describe, it } from 'vitest';

describe('matchTaskKeyword (renderer mirror)', () => {
  it.todo('renderer matchTaskKeyword has IDENTICAL behavior to backend agent/keywords.ts (snapshot test)');
  it.todo('confirm keywords match only during awaiting-confirmation');
  it.todo('cancel keywords match during BOTH awaiting-confirmation AND executing');
  it.todo('edit prefix returns feedback after first word');
  it.todo('Whisper-style trailing punctuation ("cancela.", "cancela!", "cancela?") all match cancel');
});
