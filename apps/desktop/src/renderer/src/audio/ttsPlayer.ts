/**
 * TTS Player — Phase 19.5, Plan 03 + Phase 22 Plan 04
 *
 * Playback de áudio TTS retornado pelo backend via Web Audio API.
 * - AudioContext singleton lazy (criado no primeiro uso, reusado).
 * - Cancela áudio anterior IMEDIATAMENTE antes de decodar o novo.
 * - `onended` limpa `currentSource` só se ainda for o mesmo source.
 *
 * Decisão Q1/Q2 do CONTEXT.md — renderer decodifica MP3/WAV nativo via
 * `AudioContext.decodeAudioData`; main process só repassa base64.
 *
 * Phase 22 Plan 04 (WAKE self-trigger mitigation):
 * - `registerTTSHooks` expõe beforePlay/afterPlay para o useWakeWord hook
 *   suspender o WakeWordEngine durante TTS playback e resumir 300ms depois
 *   do final (belt-and-braces contra TTS self-trigger — o gate de OrbContext
 *   já cobre o caminho normal, mas o TTS wrap é camada extra).
 */

// Phase 53 Plan 02 (STTS-01): AudioContext extracted into shared singleton —
// soak-test leak vector mandate. Streaming TTS uses the SAME instance.
import {
  getAudioContext,
  __resetAudioContextForTest,
} from './audioContextSingleton';

/** Hooks de ciclo de vida do TTS — registrados pelo useWakeWord. */
export type TTSLifecycleHooks = {
  beforePlay?: () => Promise<void> | void;
  afterPlay?: () => Promise<void> | void;
};

let ttsHooks: TTSLifecycleHooks = {};

/**
 * Registra hooks beforePlay/afterPlay executados respectivamente antes do
 * `source.start()` e 300ms após o `source.onended`. Chamar com `{}` limpa
 * qualquer hook previamente registrado.
 */
export function registerTTSHooks(h: TTSLifecycleHooks): void {
  ttsHooks = h;
}

let currentSource: AudioBufferSourceNode | null = null;

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
    // Phase 22 Plan 04: 300ms tail antes de resumir o wake word engine.
    // Por quê 300ms? O AudioContext do renderer pode ter um buffer de saída
    // residual após o `onended` disparar, e o mic pode captar o "rabo" do
    // TTS. 300ms é o mínimo seguro empírico (research §Pattern 5).
    setTimeout(() => {
      void ttsHooks.afterPlay?.();
    }, 300);
  };

  // Phase 22 Plan 04: beforePlay roda ANTES do source.start() — dá chance
  // ao wake word engine de suspender o AudioContext e soltar CPU enquanto
  // o TTS toca.
  await ttsHooks.beforePlay?.();

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
  __resetAudioContextForTest();
  ttsHooks = {};
}
