import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createTTSProvider,
  LocalTTSProvider,
  FallbackTTSProvider,
} from "./index.js";

describe("createTTSProvider", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("TTS_PROVIDER=local retorna LocalTTSProvider sem fallback", () => {
    vi.stubEnv("TTS_PROVIDER", "local");
    const p = createTTSProvider();
    expect(p).toBeInstanceOf(LocalTTSProvider);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("TTS_PROVIDER=elevenlabs com API key retorna FallbackTTSProvider", () => {
    vi.stubEnv("TTS_PROVIDER", "elevenlabs");
    vi.stubEnv("ELEVENLABS_API_KEY", "sk-test-123");
    const p = createTTSProvider();
    expect(p).toBeInstanceOf(FallbackTTSProvider);
    expect(p.name).toBe("elevenlabs+local");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("TTS_PROVIDER=elevenlabs SEM API key loga warning e retorna LocalTTSProvider", () => {
    vi.stubEnv("TTS_PROVIDER", "elevenlabs");
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const p = createTTSProvider();
    expect(p).toBeInstanceOf(LocalTTSProvider);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("ELEVENLABS_API_KEY");
  });

  it("default (TTS_PROVIDER ausente) com API key retorna FallbackTTSProvider", () => {
    vi.stubEnv("TTS_PROVIDER", "");
    vi.stubEnv("ELEVENLABS_API_KEY", "sk-test-123");
    const p = createTTSProvider();
    expect(p).toBeInstanceOf(FallbackTTSProvider);
  });

  it("TTS_PROVIDER desconhecido loga warning e retorna LocalTTSProvider", () => {
    vi.stubEnv("TTS_PROVIDER", "bogus");
    const p = createTTSProvider();
    expect(p).toBeInstanceOf(LocalTTSProvider);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("bogus");
  });
});
