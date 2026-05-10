/**
 * quiet-hours.ts — Phase 67 (D-10)
 *
 * Funções utilitárias para verificar se o momento atual está dentro da
 * janela de quiet hours e calcular quando ela termina.
 *
 * Algoritmo validado para janela cross-midnight (ex: 22:00 → 08:00)
 * e janela same-day (ex: 12:00 → 14:00).
 */

/**
 * Verifica se `now` está dentro da janela de quiet hours definida por
 * `startHHMM` e `endHHMM`.
 *
 * Suporta janelas cross-midnight (ex: "22:00" → "08:00"): quando
 * startMin > endMin, testa OU (>= start OU < end).
 * Janelas same-day (ex: "12:00" → "14:00"): testa E (>= start E < end).
 */
export function isInQuietHours(
  now: Date,
  startHHMM: string, // "22:00"
  endHHMM: string,   // "08:00"
): boolean {
  const [startH, startM] = startHHMM.split(':').map(Number);
  const [endH, endM] = endHHMM.split(':').map(Number);

  const startMin = (startH ?? 22) * 60 + (startM ?? 0);
  const endMin = (endH ?? 8) * 60 + (endM ?? 0);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  if (startMin > endMin) {
    // Janela cross-midnight: 22:00 → 08:00
    return nowMin >= startMin || nowMin < endMin;
  } else {
    // Janela same-day: 12:00 → 14:00
    return nowMin >= startMin && nowMin < endMin;
  }
}

/**
 * Calcula o próximo momento em que o quiet hours termina.
 *
 * Exemplos com endHHMM = "08:00":
 * - Agora 23:30 → retorna hoje às 08:00 (se 08:00 ainda não passou hoje)
 *   Na verdade: 08:00 de hoje JÁ passou às 23:30, então retorna amanhã às 08:00
 * - Agora 07:30 → retorna hoje às 08:00 (ainda não chegou)
 * - Agora 09:00 → retorna amanhã às 08:00 (o quiet já encerrou hoje)
 */
export function nextQuietEnd(now: Date, endHHMM: string): Date {
  const [h, m] = endHHMM.split(':').map(Number);

  const candidate = new Date(now);
  candidate.setHours(h ?? 8, m ?? 0, 0, 0);

  if (candidate > now) {
    // O horário de fim ainda não chegou hoje
    return candidate;
  } else {
    // O horário de fim já passou hoje — retorna amanhã
    candidate.setDate(candidate.getDate() + 1);
    return candidate;
  }
}
