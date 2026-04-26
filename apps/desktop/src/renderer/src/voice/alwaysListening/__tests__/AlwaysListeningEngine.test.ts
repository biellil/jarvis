/**
 * AlwaysListeningEngine.test.ts — Wave 0 (Nyquist) scaffold
 *
 * Phase 40 — Always-Listening + Intent Classifier
 * Requisitos:
 *  - VLISTEN-01 — VAD detecta speech-end e captura utterance completa
 *  - VLISTEN-03 — Pre-roll de 500ms (8000 samples @ 16kHz) prepended
 *
 * Threat coverage:
 *  - T-40-VAD (Tampering): VAD threshold reconfigurável testado em
 *    reconfigureVadThreshold() para garantir que slider Settings (D-04)
 *    propaga sem corromper sessão ativa.
 *  - T-40-RING (Information Disclosure): dispose() limpa ring buffer ⇒
 *    nenhum áudio persistido fora do utterance.
 *
 * Status: Wave 0 scaffold (it.todo). Implementação real chega na Wave 2
 * (plan 40-04). Import do módulo AlwaysListeningEngine ficará comentado
 * até Wave 2.
 */
import { describe, it } from 'vitest';

// Wave 2 vai descomentar:
// import { AlwaysListeningEngine } from '../AlwaysListeningEngine';
// import type { AlwaysListeningEngineOptions } from '../AlwaysListeningEngine';

describe('AlwaysListeningEngine (VLISTEN-01, VLISTEN-03, T-40-VAD, T-40-RING)', () => {
  describe('start() + VAD integration (VLISTEN-01)', () => {
    it.todo('start(stream) initializes AudioContext and VAD session');
    it.todo('VAD onSpeechEnd callback fires after negativeFramesToClose frames of silence');
    it.todo('VAD onVoiceStart resets utteranceChunks and records speechStartedAt');
    it.todo('utterances < minUtteranceDurationMs (200ms) are discarded without sending');
  });

  describe('pre-roll concatenation (VLISTEN-03)', () => {
    it.todo('handleSpeechEnd() prepends ring buffer snapshot to utterance chunks');
    it.todo('ring buffer is cleared after each utterance capture');
    it.todo('resulting wavBuffer starts with pre-roll audio (not silenced leading edge)');
  });

  describe('onUtteranceReady callback', () => {
    it.todo('onUtteranceReady called with Uint8Array (valid WAV buffer) after speech-end');
    it.todo('onUtteranceReady NOT called for utterances below minUtteranceDurationMs');
  });

  describe('reconfigureVadThreshold() (VLISTEN-04)', () => {
    it.todo('reconfigureVadThreshold(n) updates negativeFramesToClose in active VAD session');
    it.todo('reconfigureVadThreshold() before start() does not throw');
  });

  describe('stop() + dispose() lifecycle (T-40-RING, D-04 lazy lifecycle)', () => {
    it.todo('stop() ends VAD session and stops all mic stream tracks');
    it.todo('dispose() calls stop() then unloads classifier and clears ring buffer');
    it.todo('dispose() called twice does not throw (idempotent)');
  });
});
