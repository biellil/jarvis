import { describe, it, expect, vi, beforeEach } from "vitest";

const synthFn = vi.fn();
const pipelineFactory = vi.fn();

vi.mock("@xenova/transformers", () => ({
  pipeline: (...args: unknown[]) => pipelineFactory(...args),
}));

import { LocalTTSProvider } from "./local.js";

beforeEach(() => {
  synthFn.mockReset();
  pipelineFactory.mockReset();
  synthFn.mockResolvedValue({
    audio: new Float32Array([0, 0.5, -0.5]),
    sampling_rate: 16000,
  });
  pipelineFactory.mockResolvedValue(synthFn);
});

describe("LocalTTSProvider", () => {
  it("has name === 'local'", () => {
    const p = new LocalTTSProvider();
    expect(p.name).toBe("local");
  });

  it("synthesize returns a WAV buffer", async () => {
    const p = new LocalTTSProvider();
    const result = await p.synthesize("hello world");
    expect(result.format).toBe("wav");
    expect(Buffer.isBuffer(result.audio)).toBe(true);
    expect(result.audio.slice(0, 4).toString("ascii")).toBe("RIFF");
    expect(result.audio.slice(8, 12).toString("ascii")).toBe("WAVE");
  });

  it("loads the pipeline lazily — only once across calls", async () => {
    const p = new LocalTTSProvider();
    await p.synthesize("one");
    await p.synthesize("two");
    expect(pipelineFactory).toHaveBeenCalledTimes(1);
    expect(pipelineFactory).toHaveBeenCalledWith(
      "text-to-speech",
      "Xenova/speecht5_tts",
      expect.any(Object),
    );
    expect(synthFn).toHaveBeenCalledTimes(2);
  });

  it("throws on empty text", async () => {
    const p = new LocalTTSProvider();
    await expect(p.synthesize("")).rejects.toThrow(/empty text/);
    await expect(p.synthesize("   ")).rejects.toThrow(/empty text/);
  });

  it("logs warning when text has non-ASCII accents (pt-BR)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const p = new LocalTTSProvider();
    await p.synthesize("olá coração");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not warn on pure ASCII text", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const p = new LocalTTSProvider();
    await p.synthesize("hello world");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("passes speaker_embeddings option to synthesizer", async () => {
    const p = new LocalTTSProvider();
    await p.synthesize("hello");
    expect(synthFn).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({ speaker_embeddings: expect.any(String) }),
    );
  });

  it("respects TTS_LOCAL_SPEAKER_EMBEDDINGS env override", async () => {
    process.env.TTS_LOCAL_SPEAKER_EMBEDDINGS = "http://custom/embeddings.bin";
    const p = new LocalTTSProvider();
    await p.synthesize("hello");
    expect(synthFn).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({ speaker_embeddings: "http://custom/embeddings.bin" }),
    );
    delete process.env.TTS_LOCAL_SPEAKER_EMBEDDINGS;
  });
});
