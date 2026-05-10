/**
 * selectWhisperModel.ts — Pure model selection helper (Phase 68 fix).
 *
 * Bug fix (WBUG-01): usa OPTION_TO_MODEL de whisperModelResolver em vez de allowlist
 * desatualizada. Qualquer override explícito retorna o modelo mapeado
 * — nunca o vramModel. vramModel mantido na assinatura por compatibilidade mas
 * ignorado quando override está presente.
 *
 * D-01: surgical fix — mínimo risco, mínima mudança de interface.
 * D-03: 'auto' removido do tipo WhisperModelOption; branch mantido defensivamente.
 */
import type { WhisperModel } from './vramDetection.js';
import type { WhisperModelOption } from '../../shared/ipc-types.js';
import { OPTION_TO_MODEL } from './whisperModelResolver.js';

/**
 * selectWhisperModel — aplica override do usuário.
 *
 * @param vramModel - Modelo detectado por VRAM (ignorado quando override explícito)
 * @param override  - Preferência do usuário em Settings
 * @returns         - Modelo final para inferência STT
 */
export function selectWhisperModel(
  vramModel: WhisperModel,
  override: WhisperModelOption,
): WhisperModel {
  // D-03: branch defensivo caso 'auto' legado chegue (store não migrado)
  if ((override as string) === 'auto') {
    return vramModel;
  }
  return OPTION_TO_MODEL[override] ?? vramModel;
}
