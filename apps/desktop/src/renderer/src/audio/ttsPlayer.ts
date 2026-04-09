/**
 * TTS Player — Phase 19.5, Plan 03
 *
 * Playback de áudio TTS retornado pelo backend via Web Audio API.
 * - AudioContext singleton lazy (criado no primeiro uso, reusado).
 * - Cancela áudio anterior IMEDIATAMENTE antes de decodar o novo.
 * - `onended` limpa `currentSource` só se ainda for o mesmo source.
 *
 * Decisão Q1/Q2 do CONTEXT.md — renderer decodifica MP3/WAV nativo via
 * `AudioContext.decodeAudioData`; main process só repassa base64.
 */

let audioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

/**
 * Decodifica e toca um áudio TTS em base64.
 * Cancela qualquer playback em curso antes de começar o novo.
 */
export async function playTTSResponse(
  base64: string,
  _format: 'mp3' | 'wav'
): Promise<void> {
  // Cancel previous IMMEDIATELY (even before decode finishes)
  if (currentSource) {
    try {
      currentSource.stop();
    } catch {
      /* already stopped */
    }
    currentSource = null;
  }

  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const buffer = await ctx.decodeAudioData(bytes.buffer);

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.onended = () => {
    if (currentSource === source) currentSource = null;
  };
  source.start();
  currentSource = source;
}

/**
 * Para o playback atual manualmente. Idempotente.
 */
export function stopTTSPlayback(): void {
  if (currentSource) {
    try {
      currentSource.stop();
    } catch {
      /* ignore */
    }
    currentSource = null;
  }
}

/**
 * Reset de module-level state — apenas para testes.
 */
export function __resetForTests(): void {
  currentSource = null;
  audioContext = null;
}
