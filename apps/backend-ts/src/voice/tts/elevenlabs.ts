// TTS-03 (Phase 30): ElevenLabsTTSProvider migrated to Electron main. Endpoint removal in Phase 32.
import type { TTSProvider, TTSResult } from "./provider.js";

export class ElevenLabsTTSProvider implements TTSProvider {
  readonly name = "elevenlabs";
  async synthesize(_text: string): Promise<TTSResult> {
    throw new Error(
      "ElevenLabsTTSProvider: migrated to Electron main in Phase 30. Endpoint /chat/audio removed in Phase 32.",
    );
  }
}
