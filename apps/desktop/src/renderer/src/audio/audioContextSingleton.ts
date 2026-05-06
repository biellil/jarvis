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
    // Phase 56 (QA-01): expose count for diagnostics bridge (window.__audioContextCount)
    (window as any).__audioContextCount = 1;
  }
  return audioContext;
}

/**
 * Returns the count of active AudioContext instances managed by this singleton.
 * Used by Phase 56 IPC diagnostics bridge (QA-01). Should always return 1 after
 * first audio play, or 0 if audio has never been used in this session.
 */
export function getAudioContextCount(): number {
  return audioContext !== null ? 1 : 0;
}

/** Test-only reset hook — DO NOT call from production code. */
export function __resetAudioContextForTest(): void {
  audioContext = null;
  if (typeof window !== 'undefined') {
    (window as any).__audioContextCount = 0;
  }
}
