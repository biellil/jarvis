// TTS-03 (Phase 30): LocalTTSProvider stub — TTS migrated to Electron main. Endpoint removal in Phase 32.
import type { TTSProvider, TTSResult } from "./provider.js";

export class LocalTTSProvider implements TTSProvider {
  readonly name = "local";
  async synthesize(_text: string): Promise<TTSResult> {
    throw new Error(
      "LocalTTSProvider: TTS migrated to Electron main in Phase 30. Offline TTS (Kokoro) deferred to v1.7.",
    );
  }
}
