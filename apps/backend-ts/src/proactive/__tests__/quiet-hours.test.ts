import { describe, it, expect } from 'vitest';
import { isInQuietHours, nextQuietEnd } from '../quiet-hours.js';

/**
 * Helpers para criar datas de teste com hora/minuto específicos.
 * Evita dependências de timezone usando setHours/setMinutes locais.
 */
function makeTime(hours: number, minutes: number): Date {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

describe('isInQuietHours', () => {
  it('same-day window: returns true when now is inside window', () => {
    // 12:00 → 14:00, agora 13:00
    expect(isInQuietHours(makeTime(13, 0), '12:00', '14:00')).toBe(true);
  });

  it('same-day window: returns false when now is outside window', () => {
    // 12:00 → 14:00, agora 11:00 (antes) e 15:00 (depois)
    expect(isInQuietHours(makeTime(11, 0), '12:00', '14:00')).toBe(false);
    expect(isInQuietHours(makeTime(15, 0), '12:00', '14:00')).toBe(false);
  });

  it('cross-midnight window (22:00-08:00): returns true at 23:30', () => {
    expect(isInQuietHours(makeTime(23, 30), '22:00', '08:00')).toBe(true);
  });

  it('cross-midnight window (22:00-08:00): returns true at 07:00', () => {
    // Madrugada, ainda em quiet
    expect(isInQuietHours(makeTime(7, 0), '22:00', '08:00')).toBe(true);
  });

  it('cross-midnight window (22:00-08:00): returns false at 09:00', () => {
    // Depois do fim do quiet (08:00), já saiu
    expect(isInQuietHours(makeTime(9, 0), '22:00', '08:00')).toBe(false);
  });

  it('boundary: exactly at start time returns true', () => {
    // 22:00 exato = início do quiet → deve retornar true
    expect(isInQuietHours(makeTime(22, 0), '22:00', '08:00')).toBe(true);
  });

  it('boundary: exactly at end time returns false', () => {
    // 08:00 exato = fim do quiet → deve retornar false (fim exclusivo)
    expect(isInQuietHours(makeTime(8, 0), '22:00', '08:00')).toBe(false);
  });

  it('same-day window: returns false at exact end time (exclusive end)', () => {
    // 14:00 exato no window 12:00→14:00 → false (fim exclusivo)
    expect(isInQuietHours(makeTime(14, 0), '12:00', '14:00')).toBe(false);
  });

  it('same-day window: returns true at exact start time (inclusive start)', () => {
    // 12:00 exato no window 12:00→14:00 → true (início inclusivo)
    expect(isInQuietHours(makeTime(12, 0), '12:00', '14:00')).toBe(true);
  });
});

describe('nextQuietEnd', () => {
  it('returns today end time when quiet has not ended yet today', () => {
    // Agora 07:00, quiet ends 08:00 → retorna HOJE às 08:00
    const now = makeTime(7, 0);
    const result = nextQuietEnd(now, '08:00');

    expect(result.getHours()).toBe(8);
    expect(result.getMinutes()).toBe(0);
    // Deve ser no mesmo dia
    expect(result.getDate()).toBe(now.getDate());
  });

  it('returns tomorrow end time when quiet already ended today', () => {
    // Agora 09:00, quiet ends 08:00 → 08:00 de hoje já passou → retorna AMANHÃ
    const now = makeTime(9, 0);
    const result = nextQuietEnd(now, '08:00');

    expect(result.getHours()).toBe(8);
    expect(result.getMinutes()).toBe(0);
    // Deve ser amanhã
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(result.getDate()).toBe(tomorrow.getDate());
  });

  it('returns tomorrow when called at cross-midnight (23:30, end 08:00)', () => {
    // 23:30 → o horário de fim 08:00 já passou hoje → retorna amanhã
    const now = makeTime(23, 30);
    const result = nextQuietEnd(now, '08:00');

    expect(result.getHours()).toBe(8);
    expect(result.getMinutes()).toBe(0);
    // 08:00 de hoje já passou às 23:30 → amanhã
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(result.getDate()).toBe(tomorrow.getDate());
  });
});
