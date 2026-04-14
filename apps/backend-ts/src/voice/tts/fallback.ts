// TTS-03 (Phase 30): FallbackTTSProvider migrated to Electron main. Endpoint removal in Phase 32.
import type { TTSProvider, TTSResult } from "./provider.js";

export class FallbackTTSProvider implements TTSProvider {
  readonly name: string;
  constructor(
    private readonly primary: TTSProvider,
    private readonly secondary: TTSProvider,
  ) {
    this.name = `${primary.name}+${secondary.name}`;
  }
  async synthesize(_text: string): Promise<TTSResult> {
    throw new Error(
      "FallbackTTSProvider: migrated to Electron main in Phase 30. Endpoint /chat/audio removed in Phase 32.",
    );
  }
}
