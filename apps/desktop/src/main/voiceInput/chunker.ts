/**
 * SentenceChunker — pure sentence segmenter for streaming TTS pipeline.
 *
 * Phase 53 Plan 01 (STTS-01).
 *
 * Splits a token stream on sentence-terminator boundaries `[.!?]\s+`,
 * accumulating partial input across feed() calls until a full sentence
 * (terminator + whitespace) is observed. flush() returns any residual
 * non-empty buffer as a final sentence so token streams without trailing
 * punctuation still get synthesized (D-04).
 *
 * Pure: no I/O, no Electron import, no network. Trivially unit-testable.
 *
 * Decision D-02: regex literal `/[.!?]\s+/`, NO abbreviation exceptions.
 * Adding "Dr." / "Mr." / etc. exceptions is OUT OF SCOPE — keep it dumb,
 * fast, and predictable. If a sentence cuts mid-abbreviation, downstream
 * graceful-degrade in streamingTurn.synthAndSend handles it.
 *
 * Decision D-04: flush() returns the residual buffer as a sentence (after
 * trim) so a final TTS chunk is emitted for replies that end without
 * terminating punctuation.
 */
export class SentenceChunker {
  private buffer = '';

  /**
   * Append `text` to the internal buffer and extract every complete sentence
   * (terminator + at least one whitespace char). Returns the trimmed sentences
   * in order. Trailing partial sentence remains in the buffer for the next
   * feed() / flush().
   */
  feed(text: string): string[] {
    this.buffer += text;
    const out: string[] = [];
    let match: RegExpExecArray | null;
    // Use a fresh regex per iteration to avoid `lastIndex` pitfalls — the
    // buffer mutates inside the loop and a stateful /g regex would skip
    // characters. Performance is fine: per-token volume is tiny.
    while ((match = /[.!?]\s+/.exec(this.buffer)) !== null) {
      const end = match.index + match[0].length;
      const sentence = this.buffer.slice(0, end).trim();
      if (sentence.length > 0) out.push(sentence);
      this.buffer = this.buffer.slice(end);
    }
    return out;
  }

  /**
   * Return the residual buffer as a single sentence (trimmed) if it has
   * non-whitespace content, otherwise []. Always clears the buffer.
   * Per D-04 — guarantees the last partial sentence reaches TTS.
   */
  flush(): string[] {
    const trimmed = this.buffer.trim();
    this.buffer = '';
    return trimmed.length > 0 ? [trimmed] : [];
  }
}
