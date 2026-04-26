/**
 * strategyFactoryMocks.ts — test doubles compartilhados para VoiceCaptureStrategy
 *
 * Phase 43 Plan 01 (Wave 0): centraliza mocks usados por voiceMode.test.ts,
 * voiceMode.race.test.ts e voiceMode/pttOnly.test.ts. Evita duplicação de
 * boilerplate `vi.fn().mockResolvedValue(undefined)` em cada test file.
 *
 * Pattern source: apps/desktop/src/main/__tests__/voiceMode.test.ts:30-37
 * (helper `makeStrategy` original) — esta versão estende com factories.
 */
import { vi, type MockedFunction } from 'vitest';
import type { VoiceCaptureStrategy } from '../../voiceMode/index.js';

export interface MockStrategy {
  start: MockedFunction<() => Promise<void>>;
  stop: MockedFunction<() => Promise<void>>;
  dispose: MockedFunction<() => Promise<void>>;
  getStatus: MockedFunction<() => 'idle' | 'capturing' | 'processing'>;
}

/**
 * makeMockStrategy — cria uma strategy mock que satisfaz VoiceCaptureStrategy.
 *
 * @param status valor inicial retornado por getStatus() (default: 'idle')
 */
export function makeMockStrategy(
  status: 'idle' | 'capturing' | 'processing' = 'idle',
): MockStrategy {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue(status),
  };
}

/**
 * makeFailingFactory — factory que lança Error nas primeiras N chamadas e
 * depois retorna strategies normais (D-04 plano B test cenário 3).
 *
 * @param failuresBeforeSuccess número de chamadas que devem lançar antes da factory passar a retornar mocks
 * @param errorMessage mensagem do Error (default: 'Strategy factory failure')
 */
export function makeFailingFactory(
  failuresBeforeSuccess: number,
  errorMessage = 'Strategy factory failure',
): MockedFunction<() => VoiceCaptureStrategy> {
  let callCount = 0;
  return vi.fn().mockImplementation(() => {
    callCount += 1;
    if (callCount <= failuresBeforeSuccess) {
      throw new Error(errorMessage);
    }
    return makeMockStrategy();
  }) as MockedFunction<() => VoiceCaptureStrategy>;
}

/**
 * makeSequentialFactory — factory que retorna strategies em sequência
 * pré-determinada (1ª chamada → strategies[0], 2ª → strategies[1] ...).
 * Útil para testes de recovery (D-04 cenário 3) onde queremos distinguir
 * entre instância "init" e instância "recovered".
 */
export function makeSequentialFactory(
  strategies: MockStrategy[],
): MockedFunction<() => VoiceCaptureStrategy> {
  let callCount = 0;
  return vi.fn().mockImplementation(() => {
    const s = strategies[callCount];
    callCount += 1;
    if (!s) throw new Error(`makeSequentialFactory: no strategy for call ${callCount}`);
    return s;
  }) as MockedFunction<() => VoiceCaptureStrategy>;
}
