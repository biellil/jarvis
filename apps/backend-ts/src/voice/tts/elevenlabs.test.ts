// TTS-03 (Phase 30): ElevenLabsTTSProvider migrated to Electron main.
// Tests for ElevenLabsTTSProvider now live in:
//   apps/desktop/src/main/voiceInput/tts/__tests__/tts-providers.test.ts
import { describe, it, expect } from "vitest";
import { ElevenLabsTTSProvider } from "./elevenlabs.js";

describe("ElevenLabsTTSProvider (backend-ts stub — migrated to Electron main in Phase 30)", () => {
  it("stub throws migration error at synthesize time", async () => {
    const provider = new ElevenLabsTTSProvider();
    await expect(provider.synthesize("hello")).rejects.toThrow(
      "migrated to Electron main",
    );
  });
});
