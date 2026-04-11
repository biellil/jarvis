/**
 * VoiceInputManager — Single writer sobre o microfone no renderer
 *
 * Phase 22 Plan 01 (WAKE-07): Arbitragem entre PTT e WakeWord.
 *   - PTT sempre ganha (preempta wakeword se ativo)
 *   - WakeWord é rejeitado enquanto PTT está ativo (BUSY)
 *   - acquire() idempotente pela mesma source (no-op se já é owner)
 *   - release() é NO-OP se source !== currentSource (evita PTT matar wakeword
 *     por acidente quando o callback do PTT chegar tarde)
 *
 * Este módulo NÃO é IPC — vive 100% no renderer. Só existem dois callers em
 * potencial: o handler de 'ptt:action' no ChatInput (Plan 01) e o wake word
 * engine que chega no Plan 02+. Este refactor é precondição absoluta para
 * mitigar PITFALL #3 (double MediaRecorder race condition).
 */

export type InputSource = 'ptt' | 'wakeword' | null;

export interface VoiceInputGrant {
  source: 'ptt' | 'wakeword';
  releasedPreviousSource: InputSource;
  startedAt: number;
}

export interface VoiceInputManager {
  /**
   * Tenta adquirir o mic para um source.
   * - PTT preempta wakeword: se currentSource==='wakeword' e caller==='ptt',
   *   notifica listeners (release automático do wakeword) e concede 'ptt'.
   * - WakeWord é rejeitado se currentSource === 'ptt': retorna { error: 'BUSY' }.
   * - Mesma source tentando adquirir 2x seguidas é idempotente: retorna grant
   *   existente, NÃO preempta a si mesma e NÃO notifica listeners.
   */
  acquire(source: 'ptt' | 'wakeword'): VoiceInputGrant | { error: 'BUSY' };

  /**
   * Libera o mic. No-op se source !== currentSource (evita PTT matar wakeword
   * por acidente). Dispara listeners com null quando libera de fato.
   */
  release(source: 'ptt' | 'wakeword'): void;

  /** Estado atual, para observers. */
  getCurrentSource(): InputSource;

  /** Subscribe para transitions. Retorna unsubscribe. */
  subscribe(listener: (source: InputSource) => void): () => void;
}

// ----------------------------------------------------------------------------
// Closure-based singleton state
// ----------------------------------------------------------------------------

let currentSource: InputSource = null;
let grantStartedAt = 0;
const listeners = new Set<(source: InputSource) => void>();

function notify(src: InputSource): void {
  listeners.forEach((l) => l(src));
}

function acquire(
  source: 'ptt' | 'wakeword'
): VoiceInputGrant | { error: 'BUSY' } {
  // Idempotência: mesma source tentando adquirir de novo → no-op, retorna
  // grant existente sem notificar.
  if (currentSource === source) {
    return {
      source,
      releasedPreviousSource: null,
      startedAt: grantStartedAt,
    };
  }

  // WakeWord rejeitado enquanto PTT está ativo
  if (source === 'wakeword' && currentSource === 'ptt') {
    return { error: 'BUSY' as const };
  }

  // Preempção ou aquisição limpa
  const releasedPreviousSource: InputSource = currentSource;
  currentSource = source;
  grantStartedAt = Date.now();
  notify(source);

  return {
    source,
    releasedPreviousSource,
    startedAt: grantStartedAt,
  };
}

function release(source: 'ptt' | 'wakeword'): void {
  if (source !== currentSource) {
    // NO-OP: source não é o owner atual. Evita bug clássico onde callback
    // atrasado do PTT tenta release() depois que o wakeword já adquiriu.
    return;
  }
  currentSource = null;
  grantStartedAt = 0;
  notify(null);
}

function getCurrentSource(): InputSource {
  return currentSource;
}

function subscribe(listener: (source: InputSource) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const voiceInputManager: VoiceInputManager = {
  acquire,
  release,
  getCurrentSource,
  subscribe,
};

/**
 * Test helper — reseta state do singleton. NÃO usar em produção.
 * Exportado apenas para o suite de testes (`vitest`).
 */
export function __resetVoiceInputManagerForTests(): void {
  currentSource = null;
  grantStartedAt = 0;
  listeners.clear();
}
