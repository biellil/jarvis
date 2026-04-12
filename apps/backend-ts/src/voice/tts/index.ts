import { ElevenLabsTTSProvider } from "./elevenlabs.js";
import { LocalTTSProvider } from "./local.js";
import { FallbackTTSProvider } from "./fallback.js";
import { MurfTTSProvider } from "./murf.js";
import type { TTSProvider } from "./provider.js";

export type { TTSProvider, TTSResult, TTSAudioFormat } from "./provider.js";
export { ElevenLabsTTSProvider } from "./elevenlabs.js";
export { LocalTTSProvider } from "./local.js";
export { FallbackTTSProvider } from "./fallback.js";
export { MurfTTSProvider } from "./murf.js";

/**
 * createTTSProvider — factory que lê TTS_PROVIDER env var.
 *
 * - `elevenlabs` (default): FallbackTTSProvider(ElevenLabs, Local). Se
 *   ELEVENLABS_API_KEY ausente, loga warning e retorna LocalTTSProvider direto.
 * - `murf` (Phase 24): MurfTTSProvider direto (não wrapped em Fallback — por
 *   D-04, providers são siblings independentes). Se MURF_API_KEY ausente, loga
 *   warning e retorna LocalTTSProvider.
 * - `local`: LocalTTSProvider sem fallback.
 * - valor desconhecido: warning + LocalTTSProvider.
 */
export function createTTSProvider(): TTSProvider {
  const raw = process.env.TTS_PROVIDER;
  const provider = (raw && raw.trim().length > 0 ? raw : "elevenlabs").toLowerCase();

  if (provider === "local") {
    return new LocalTTSProvider();
  }

  if (provider === "elevenlabs") {
    if (!process.env.ELEVENLABS_API_KEY) {
      console.warn(
        "[voice] TTS_PROVIDER=elevenlabs but ELEVENLABS_API_KEY not set, using local only",
      );
      return new LocalTTSProvider();
    }
    return new FallbackTTSProvider(
      new ElevenLabsTTSProvider(),
      new LocalTTSProvider(),
    );
  }

  if (provider === "murf") {
    if (!process.env.MURF_API_KEY) {
      console.warn(
        "[voice] TTS_PROVIDER=murf but MURF_API_KEY not set, using local only",
      );
      return new LocalTTSProvider();
    }
    return new MurfTTSProvider();
  }

  console.warn(
    `[voice] Unknown TTS_PROVIDER="${provider}", falling back to local`,
  );
  return new LocalTTSProvider();
}
