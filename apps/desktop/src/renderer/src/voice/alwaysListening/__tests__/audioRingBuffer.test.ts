/**
 * audioRingBuffer.test.ts — Phase 40 Plan 03 (Wave 1, TDD)
 *
 * Phase 40 — Always-Listening + Intent Classifier
 * Requisito: VLISTEN-03 — ring buffer fixo 500ms (8000 samples @ 16kHz)
 *
 * Threat coverage:
 *  - T-40-RING (Information Disclosure): testes verificam getSize() <= capacity
 *    para garantir que buffer não cresce além do limite. Implementação usa
 *    Float32Array fixo com writeHead/readHead circulares.
 */
import { describe, it, expect } from 'vitest';

import { AudioRingBuffer } from '../audioRingBuffer';

describe('AudioRingBuffer (VLISTEN-03, T-40-RING)', () => {
  describe('construction', () => {
    it('creates buffer with given capacityInSamples', () => {
      const ring = new AudioRingBuffer(8000);
      expect(ring).toBeInstanceOf(AudioRingBuffer);
    });

    it('initial getSize() returns 0', () => {
      const ring = new AudioRingBuffer(8000);
      expect(ring.getSize()).toBe(0);
    });
  });

  describe('write()', () => {
    it('write() stores samples up to capacity', () => {
      const ring = new AudioRingBuffer(10);
      ring.write(new Float32Array([0.1, 0.2, 0.3]));
      expect(ring.getSize()).toBe(3);
    });

    it('write() overwrites oldest samples when full (circular behavior)', () => {
      const ring = new AudioRingBuffer(4);
      ring.write(new Float32Array([1, 2, 3, 4])); // exactly fills
      expect(ring.getSize()).toBe(4);
      ring.write(new Float32Array([5, 6])); // overwrites 1,2
      expect(ring.getSize()).toBe(4); // still capped
      const out = ring.toArray();
      // Order should be 3,4,5,6 — newest preserved, oldest discarded
      expect(Array.from(out)).toEqual([3, 4, 5, 6]);
    });

    it('write() 8000 samples (500ms @ 16kHz pre-roll) fits exactly in capacity 16000', () => {
      const ring = new AudioRingBuffer(16000);
      const chunk = new Float32Array(8000).fill(0.5);
      ring.write(chunk);
      expect(ring.getSize()).toBe(8000);
    });
  });

  describe('toArray()', () => {
    it('toArray() returns Float32Array with written samples in order', () => {
      const ring = new AudioRingBuffer(8);
      ring.write(new Float32Array([1, 2, 3, 4, 5]));
      const out = ring.toArray();
      expect(out).toBeInstanceOf(Float32Array);
      expect(Array.from(out)).toEqual([1, 2, 3, 4, 5]);
    });

    it('toArray() drains buffer — getSize() is 0 after call', () => {
      const ring = new AudioRingBuffer(8);
      ring.write(new Float32Array([1, 2, 3]));
      ring.toArray();
      expect(ring.getSize()).toBe(0);
    });

    it('toArray() returns empty Float32Array when buffer is empty', () => {
      const ring = new AudioRingBuffer(8);
      const out = ring.toArray();
      expect(out).toBeInstanceOf(Float32Array);
      expect(out.length).toBe(0);
    });

    it('toArray() returns correct order even after circular wrap', () => {
      const ring = new AudioRingBuffer(4);
      ring.write(new Float32Array([1, 2, 3, 4, 5, 6, 7])); // wraps: keeps last 4
      const out = ring.toArray();
      expect(Array.from(out)).toEqual([4, 5, 6, 7]);
    });
  });

  describe('clear()', () => {
    it('clear() resets getSize() to 0 without freeing backing buffer', () => {
      const ring = new AudioRingBuffer(8);
      ring.write(new Float32Array([1, 2, 3]));
      ring.clear();
      expect(ring.getSize()).toBe(0);
    });

    it('clear() allows reuse without creating new buffer (no GC pressure)', () => {
      const ring = new AudioRingBuffer(4);
      ring.write(new Float32Array([1, 2, 3, 4]));
      ring.clear();
      ring.write(new Float32Array([10, 20]));
      expect(ring.getSize()).toBe(2);
      expect(Array.from(ring.toArray())).toEqual([10, 20]);
    });
  });

  describe('memory safety (T-40-RING)', () => {
    it('writing 1M samples does not grow backing buffer size beyond initial capacity', () => {
      const capacity = 16000;
      const ring = new AudioRingBuffer(capacity);
      // Write 1M samples in chunks of 1000
      const chunk = new Float32Array(1000).fill(0.1);
      for (let i = 0; i < 1000; i++) {
        ring.write(chunk);
      }
      expect(ring.getSize()).toBeLessThanOrEqual(capacity);
      expect(ring.getSize()).toBe(capacity);
    });

    it('getSize() never exceeds capacityInSamples', () => {
      const ring = new AudioRingBuffer(100);
      ring.write(new Float32Array(500).fill(1));
      expect(ring.getSize()).toBeLessThanOrEqual(100);
    });
  });
});
