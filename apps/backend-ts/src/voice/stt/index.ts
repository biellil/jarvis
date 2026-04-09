/**
 * STT factory — lê env var STT_PROVIDER (default 'local').
 * Quando 'cloud' (ou desconhecido) é pedido, loga warning e cai pra local
 * (CloudSTTProvider ainda não implementado — ver Fase 19.x).
 */

import { LocalSTTProvider } from './local.js';
import type { STTProvider } from './provider.js';

export type { STTProvider, STTTranscribeOptions } from './provider.js';
export { LocalSTTProvider } from './local.js';

export function createSTTProvider(): STTProvider {
  const requested = (process.env.STT_PROVIDER ?? 'local').toLowerCase();
  if (requested !== 'local') {
    console.warn(
      `[voice] STT provider '${requested}' not implemented, falling back to local`,
    );
  }
  return new LocalSTTProvider();
}
