// TTS-03 (Phase 30): LocalTTSProvider stub — TTS migrated to Electron main.
// Offline TTS (Kokoro) deferred to v1.7.
import { describe, it, expect } from "vitest";
import { LocalTTSProvider } from "./local.js";

describe("LocalTTSProvider (backend-ts stub — migrated in Phase 30)", () => {
  it("stub throws migration error at synthesize time", async () => {
    const provider = new LocalTTSProvider();
    await expect(provider.synthesize("hello")).rejects.toThrow(
      "migrated to Electron main",
    );
  });
});
