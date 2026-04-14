// TTS-03 (Phase 30): createTTSProvider migrated to Electron main.
// Tests for createTTSProvider now live in:
//   apps/desktop/src/main/voiceInput/tts/__tests__/tts-providers.test.ts
import { describe, it, expect } from "vitest";
import { createTTSProvider } from "./index.js";

describe("createTTSProvider (backend-ts stub — migrated to Electron main in Phase 30)", () => {
  it("stub throws migration error at call time", () => {
    expect(() => createTTSProvider()).toThrow(
      "migrated to Electron main",
    );
  });
});
