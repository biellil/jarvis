/**
 * AudioContext Singleton — Phase 53 Plan 02 (STTS-01)
 *
 * Pitfall mandate (STATE.md, Phase 53 v2.2 architecture notes):
 *   "AudioContext deve ser singleton — acumular AudioContexts é o principal
 *    vetor de leak em soak test."
 *
 * This module is the ONE place where `new AudioContext()` is called in the
 * renderer. Both legacy `ttsPlayer.ts` (single-shot playback) and the new
 * `streamingTtsPlayer.ts` (gapless chunk queue) MUST go through getAudioContext().
 */

let audioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

/** Test-only reset hook — DO NOT call from production code. */
export function __resetAudioContextForTest(): void {
  audioContext = null;
}
