/**
 * RmsZeroGuard — sliding window zero-detection tests (Phase 22 Plan 02, Wave 0).
 *
 * Mitiga PITFALL #7 do research: mic stream silenciado (driver morto, hw mute)
 * faz WakeWord rodar feliz mas nunca detectar nada. Guard detecta 63 frames
 * consecutivos com RMS < 1e-8 e dispara callback EXATAMENTE 1 vez, depois
 * fica idempotente até reset().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RmsZeroGuard } from '../rmsZeroGuard';

const FRAME_SIZE = 1280;

function zeroFrame(): Float32Array {
  return new Float32Array(FRAME_SIZE);
}

function nonZeroFrame(): Float32Array {
  const f = new Float32Array(FRAME_SIZE);
  // Um único sample de magnitude 0.5 é suficiente: rms = sqrt(0.25/1280) ≈ 0.014 >> 1e-8.
  f[0] = 0.5;
  return f;
}

describe('RmsZeroGuard', () => {
  let onSilentStream: ReturnType<typeof vi.fn>;
  let guard: RmsZeroGuard;

  beforeEach(() => {
    onSilentStream = vi.fn();
    guard = new RmsZeroGuard({
      windowFrames: 63,
      epsilon: 1e-8,
      onSilentStream,
    });
  });

  it('1. 62 frames zero não dispara callback (abaixo da janela)', () => {
    for (let i = 0; i < 62; i++) guard.observe(zeroFrame());
    expect(onSilentStream).not.toHaveBeenCalled();
  });

  it('2. 63 frames zero dispara callback exatamente 1x', () => {
    for (let i = 0; i < 63; i++) guard.observe(zeroFrame());
    expect(onSilentStream).toHaveBeenCalledTimes(1);
  });

  it('3. 70 frames zero após trip mantém callback em 1x (idempotente)', () => {
    for (let i = 0; i < 70; i++) guard.observe(zeroFrame());
    expect(onSilentStream).toHaveBeenCalledTimes(1);
  });

  it('4. streak reseta em frame não-zero: 50 zeros + 1 nonzero + 63 zeros dispara 1x', () => {
    for (let i = 0; i < 50; i++) guard.observe(zeroFrame());
    expect(onSilentStream).not.toHaveBeenCalled();

    guard.observe(nonZeroFrame());
    expect(onSilentStream).not.toHaveBeenCalled();

    for (let i = 0; i < 63; i++) guard.observe(zeroFrame());
    expect(onSilentStream).toHaveBeenCalledTimes(1);
  });

  it('5. reset() limpa state — 63 zeros pós-reset dispara novamente', () => {
    for (let i = 0; i < 63; i++) guard.observe(zeroFrame());
    expect(onSilentStream).toHaveBeenCalledTimes(1);

    guard.reset();

    for (let i = 0; i < 63; i++) guard.observe(zeroFrame());
    expect(onSilentStream).toHaveBeenCalledTimes(2);
  });

  it('6. frame quase-zero (rms > epsilon) não conta como zero', () => {
    const almostZero = new Float32Array(FRAME_SIZE);
    // rms = sqrt( (1e-3)^2 ) = 1e-3 >> 1e-8
    almostZero[0] = 1e-3;
    for (let i = 0; i < 63; i++) guard.observe(almostZero);
    expect(onSilentStream).not.toHaveBeenCalled();
  });
});
