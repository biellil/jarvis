import { MurfTTSProvider } from "./murf.js";
import { ElevenLabsTTSProvider } from "./elevenlabs.js";
import type { TTSProvider } from "./provider.js";

export { MurfTTSProvider } from "./murf.js";
export { ElevenLabsTTSProvider } from "./elevenlabs.js";
export { FallbackTTSProvider } from "./fallback.js";
export type { TTSProvider, TTSResult, TTSAudioFormat } from "./provider.js";

/**
 * createTTSProvider — factory for Electron main process TTS.
 *
 * TTS_PROVIDER=murf: MurfTTSProvider (MURF_API_KEY required)
 * TTS_PROVIDER=elevenlabs (default): ElevenLabsTTSProvider (ELEVENLABS_API_KEY required)
 *
 * No LocalTTSProvider — offline TTS (Kokoro) is deferred to v1.7.
 * If preferred provider's API key is missing, warns and falls back to other provider.
 * Both providers missing → throws at synthesize() time (not at factory creation).
 *
 * Migrated to Electron main process in Phase 30 (TTS-01, TTS-02, TTS-03).
 */
export function createTTSProvider(): TTSProvider {
  const raw = process.env["TTS_PROVIDER"];
  const provider = (raw && raw.trim().length > 0 ? raw : "elevenlabs").toLowerCase();

  if (provider === "murf") {
    if (!process.env["MURF_API_KEY"]) {
      console.warn("[voice] TTS_PROVIDER=murf but MURF_API_KEY not set, falling back to elevenlabs");
      return new ElevenLabsTTSProvider();
    }
    return new MurfTTSProvider();
  }

  // Default: elevenlabs
  if (!process.env["ELEVENLABS_API_KEY"]) {
    console.warn("[voice] TTS_PROVIDER=elevenlabs but ELEVENLABS_API_KEY not set, falling back to murf");
    return new MurfTTSProvider();
  }
  return new ElevenLabsTTSProvider();
}
