import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FallbackTTSProvider } from "./fallback.js";
import type { TTSProvider, TTSResult } from "./provider.js";

function makeProvider(
  name: string,
  impl: (text: string) => Promise<TTSResult>,
): TTSProvider {
  return { name, synthesize: vi.fn(impl) } as TTSProvider;
}

describe("FallbackTTSProvider", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("concatena nomes primary+secondary", () => {
    const p = makeProvider("primary", async () => ({
      audio: Buffer.from([1]),
      format: "mp3",
    }));
    const s = makeProvider("secondary", async () => ({
      audio: Buffer.from([2]),
      format: "wav",
    }));
    const fb = new FallbackTTSProvider(p, s);
    expect(fb.name).toBe("primary+secondary");
  });

  it("usa primary quando succeed e seta providerUsed=primary", async () => {
    const primaryAudio = Buffer.from([1, 2, 3]);
    const p = makeProvider("primary", async () => ({
      audio: primaryAudio,
      format: "mp3",
    }));
    const s = makeProvider("secondary", async () => {
      throw new Error("should not be called");
    });
    const fb = new FallbackTTSProvider(p, s);
    const result = await fb.synthesize("hello");
    expect(result.audio).toBe(primaryAudio);
    expect(result.format).toBe("mp3");
    expect(result.providerUsed).toBe("primary");
    expect(s.synthesize).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("cai pra secondary quando primary throw e loga warning", async () => {
    const secondaryAudio = Buffer.from([9, 9]);
    const p = makeProvider("primary", async () => {
      throw new Error("boom cloud");
    });
    const s = makeProvider("secondary", async () => ({
      audio: secondaryAudio,
      format: "wav",
    }));
    const fb = new FallbackTTSProvider(p, s);
    const result = await fb.synthesize("hi");
    expect(result.audio).toBe(secondaryAudio);
    expect(result.format).toBe("wav");
    expect(result.providerUsed).toBe("secondary");
    expect(warnSpy).toHaveBeenCalledOnce();
    const msg = warnSpy.mock.calls[0][0] as string;
    expect(msg).toContain("primary");
    expect(msg).toContain("boom cloud");
    expect(msg).toContain("secondary");
  });

  it("propaga erro combinado quando ambos falham", async () => {
    const p = makeProvider("primary", async () => {
      throw new Error("cloud down");
    });
    const s = makeProvider("secondary", async () => {
      throw new Error("local broken");
    });
    const fb = new FallbackTTSProvider(p, s);
    await expect(fb.synthesize("x")).rejects.toThrow(
      /Both TTS providers failed.*cloud down.*local broken/,
    );
  });
});
