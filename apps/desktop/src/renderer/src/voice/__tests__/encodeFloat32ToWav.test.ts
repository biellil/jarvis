/**
 * encodeFloat32ToWav — Phase 24 Plan 04 (Task 1)
 *
 * Unit tests for the browser-safe WAV encoder. Mirrors the backend
 * `wav-encoder.test.ts` shape, but uses DataView/Uint8Array (no Buffer).
 *
 * Covers the 13 behaviors listed in 24-04-PLAN.md §Task 1 <behavior>:
 *   1. output is a Uint8Array
 *   2. first 4 bytes are ASCII "RIFF"
 *   3. bytes 8-11 are ASCII "WAVE"
 *   4. bytes 12-15 are ASCII "fmt "
 *   5. bytes 36-39 are ASCII "data"
 *   6. sample rate field (bytes 24-27, u32 LE) equals input sampleRate
 *   7. numChannels field (byte 22-23, u16 LE) equals 1 (mono)
 *   8. bitsPerSample (byte 34-35, u16 LE) equals 16
 *   9. dataSize field (bytes 40-43, u32 LE) equals samples.length * 2
 *  10. total buffer length = 44 + samples.length * 2
 *  11. [0, 1, -1, 0.5] encodes to Int16 [0, 32767, -32768, 16384]
 *  12. samples > 1.0 clip to Int16 32767
 *  13. samples < -1.0 clip to Int16 -32768
 *  14. empty Float32Array → 44-byte header only
 */
import { describe, it, expect } from 'vitest';
import { encodeFloat32ToWav } from '../encodeFloat32ToWav';

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) {
    s += String.fromCharCode(bytes[offset + i]!);
  }
  return s;
}

describe('encodeFloat32ToWav', () => {
  it('output is a Uint8Array', () => {
    const out = encodeFloat32ToWav(new Float32Array([0, 0.5]), 16000);
    expect(out).toBeInstanceOf(Uint8Array);
  });

  it('first 4 bytes are ASCII "RIFF"', () => {
    const out = encodeFloat32ToWav(new Float32Array([0]), 16000);
    expect(ascii(out, 0, 4)).toBe('RIFF');
  });

  it('bytes 8-11 are ASCII "WAVE"', () => {
    const out = encodeFloat32ToWav(new Float32Array([0]), 16000);
    expect(ascii(out, 8, 4)).toBe('WAVE');
  });

  it('bytes 12-15 are ASCII "fmt "', () => {
    const out = encodeFloat32ToWav(new Float32Array([0]), 16000);
    expect(ascii(out, 12, 4)).toBe('fmt ');
  });

  it('bytes 36-39 are ASCII "data"', () => {
    const out = encodeFloat32ToWav(new Float32Array([0]), 16000);
    expect(ascii(out, 36, 4)).toBe('data');
  });

  it('sample rate field (bytes 24-27, u32 LE) equals input sampleRate', () => {
    const out = encodeFloat32ToWav(new Float32Array([0]), 16000);
    expect(viewOf(out).getUint32(24, true)).toBe(16000);
  });

  it('sample rate field respects a different sampleRate (48000)', () => {
    const out = encodeFloat32ToWav(new Float32Array([0]), 48000);
    expect(viewOf(out).getUint32(24, true)).toBe(48000);
  });

  it('numChannels field (bytes 22-23, u16 LE) equals 1 (mono)', () => {
    const out = encodeFloat32ToWav(new Float32Array([0]), 16000);
    expect(viewOf(out).getUint16(22, true)).toBe(1);
  });

  it('bitsPerSample (bytes 34-35, u16 LE) equals 16', () => {
    const out = encodeFloat32ToWav(new Float32Array([0]), 16000);
    expect(viewOf(out).getUint16(34, true)).toBe(16);
  });

  it('dataSize field (bytes 40-43, u32 LE) equals samples.length * 2', () => {
    const samples = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
    const out = encodeFloat32ToWav(samples, 16000);
    expect(viewOf(out).getUint32(40, true)).toBe(samples.length * 2);
  });

  it('total buffer length equals 44 + samples.length * 2', () => {
    const samples = new Float32Array(128);
    const out = encodeFloat32ToWav(samples, 16000);
    expect(out.byteLength).toBe(44 + samples.length * 2);
  });

  it('input [0, 1, -1, 0.5] encodes to PCM Int16 [0, 32767, -32768, 16384] at offset 44', () => {
    const out = encodeFloat32ToWav(new Float32Array([0, 1, -1, 0.5]), 16000);
    const view = viewOf(out);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32768);
    expect(view.getInt16(50, true)).toBe(16384);
  });

  it('clips samples > 1.0 to Int16 32767', () => {
    const out = encodeFloat32ToWav(new Float32Array([2.5]), 16000);
    expect(viewOf(out).getInt16(44, true)).toBe(32767);
  });

  it('clips samples < -1.0 to Int16 -32768', () => {
    const out = encodeFloat32ToWav(new Float32Array([-2.5]), 16000);
    expect(viewOf(out).getInt16(44, true)).toBe(-32768);
  });

  it('empty Float32Array returns 44-byte header only', () => {
    const out = encodeFloat32ToWav(new Float32Array(0), 16000);
    expect(out.byteLength).toBe(44);
    expect(viewOf(out).getUint32(40, true)).toBe(0);
    // RIFF size = 36 + 0
    expect(viewOf(out).getUint32(4, true)).toBe(36);
  });
});
