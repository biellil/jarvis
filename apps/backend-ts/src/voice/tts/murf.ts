// TTS-03 (Phase 30): MurfTTSProvider migrated to Electron main. Endpoint removal in Phase 32.
import type { TTSProvider, TTSResult } from "./provider.js";

export class MurfTTSProvider implements TTSProvider {
  readonly name = "murf";
  async synthesize(_text: string): Promise<TTSResult> {
    throw new Error(
      "MurfTTSProvider: migrated to Electron main in Phase 30. Endpoint /chat/audio removed in Phase 32.",
    );
  }
}
