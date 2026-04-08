import { describe, it, expect } from 'vitest';
import { embedText, EMBEDDING_DIM } from './embeddings.js';

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // inputs are L2-normalized, so dot == cosine similarity
}

function l2Norm(v: Float32Array): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

describe('embeddings', () => {
  it('returns a 384-dim normalized Float32Array', async () => {
    const v = await embedText('hello world');
    expect(v).toBeInstanceOf(Float32Array);
    expect(v.length).toBe(EMBEDDING_DIM);
    const norm = l2Norm(v);
    expect(Math.abs(norm - 1.0)).toBeLessThan(1e-4);
  }, 120_000);

  it('is deterministic for identical inputs', async () => {
    const a = await embedText('hello world');
    const b = await embedText('hello world');
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).toBeCloseTo(b[i], 6);
    }
  }, 120_000);

  it('produces distinct vectors for different inputs', async () => {
    const foo = await embedText('foo');
    const bar = await embedText('bar');
    const sim = cosine(foo, bar);
    expect(sim).toBeLessThan(0.99);
  }, 120_000);
});
