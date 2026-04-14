// TTS-03 (Phase 30): TTS factory migrated to Electron main. See apps/desktop/src/main/voiceInput/tts/index.ts
import type { TTSProvider } from "./provider.js";

export type { TTSProvider, TTSResult, TTSAudioFormat } from "./provider.js";
export { MurfTTSProvider } from "./murf.js";
export { ElevenLabsTTSProvider } from "./elevenlabs.js";
export { FallbackTTSProvider } from "./fallback.js";
export { LocalTTSProvider } from "./local.js";

export function createTTSProvider(): TTSProvider {
  throw new Error(
    "createTTSProvider: TTS migrated to Electron main (Phase 30, TTS-03). Endpoint removed in Phase 32.",
  );
}
