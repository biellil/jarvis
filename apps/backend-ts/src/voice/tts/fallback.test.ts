// TTS-03 (Phase 30): FallbackTTSProvider migrated to Electron main.
// Tests for FallbackTTSProvider now live in:
//   apps/desktop/src/main/voiceInput/tts/__tests__/tts-providers.test.ts
import { describe, it, expect } from "vitest";
import { FallbackTTSProvider } from "./fallback.js";
import type { TTSProvider, TTSResult } from "./provider.js";

describe("FallbackTTSProvider (backend-ts stub — migrated to Electron main in Phase 30)", () => {
  it("stub throws migration error at synthesize time", async () => {
    const stubProvider: TTSProvider = {
      name: "stub",
      async synthesize(_text: string): Promise<TTSResult> {
        return { audio: Buffer.from(""), format: "mp3" };
      },
    };
    const provider = new FallbackTTSProvider(stubProvider, stubProvider);
    await expect(provider.synthesize("hello")).rejects.toThrow(
      "migrated to Electron main",
    );
  });
});
