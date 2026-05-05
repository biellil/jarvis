import { describe, it, expect } from 'vitest';
import { SentenceChunker } from '../chunker.js';

describe('SentenceChunker', () => {
  it('Test 1: feed("Hello world. ") returns ["Hello world."]', () => {
    const c = new SentenceChunker();
    expect(c.feed('Hello world. ')).toEqual(['Hello world.']);
    expect(c.flush()).toEqual([]);
  });

  it('Test 2: split-token across feed calls coalesces into a single sentence', () => {
    const c = new SentenceChunker();
    expect(c.feed('Hello')).toEqual([]);
    expect(c.feed(' world. Next')).toEqual(['Hello world.']);
    expect(c.flush()).toEqual(['Next']);
  });

  it('Test 3: multi-sentence in single feed yields all complete sentences, residual flushed', () => {
    const c = new SentenceChunker();
    expect(c.feed('Done. Now this. And')).toEqual(['Done.', 'Now this.']);
    expect(c.flush()).toEqual(['And']);
  });

  it('Test 4: boundary chars [.!?] all trigger sentences', () => {
    const c = new SentenceChunker();
    expect(c.feed('Wait! Sure? Done. ')).toEqual(['Wait!', 'Sure?', 'Done.']);
  });

  it('Test 5: flush on empty/whitespace-only buffer returns []', () => {
    const c1 = new SentenceChunker();
    expect(c1.flush()).toEqual([]);

    const c2 = new SentenceChunker();
    expect(c2.feed('   ')).toEqual([]);
    expect(c2.flush()).toEqual([]);
  });

  it('Test 6 (D-04): residual flush returns the partial sentence', () => {
    const c = new SentenceChunker();
    expect(c.feed('partial reply')).toEqual([]);
    expect(c.flush()).toEqual(['partial reply']);
  });

  it('does NOT contain abbreviation handling (D-02 locked) — "Dr. Smith arrived." still splits at "Dr."', () => {
    const c = new SentenceChunker();
    // Per D-02: regex literal /[.!?]\s+/, no abbreviations exception
    expect(c.feed('Dr. Smith arrived. ')).toEqual(['Dr.', 'Smith arrived.']);
  });
});
