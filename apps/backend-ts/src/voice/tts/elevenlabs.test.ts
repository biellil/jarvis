import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElevenLabsTTSProvider } from "./elevenlabs.js";

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_VOICE_ID;
  delete process.env.ELEVENLABS_MODEL_ID;
}

function mockFetchOk(bytes: Uint8Array): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    text: async () => "",
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function mockFetchError(status: number, body: string): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => ({
    ok: false,
    status,
    arrayBuffer: async () => new ArrayBuffer(0),
    text: async () => body,
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("ElevenLabsTTSProvider", () => {
  beforeEach(() => {
    resetEnv();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  it("expõe nome 'elevenlabs'", () => {
    const p = new ElevenLabsTTSProvider();
    expect(p.name).toBe("elevenlabs");
  });

  it("sintetiza texto com sucesso retornando Buffer mp3", async () => {
    process.env.ELEVENLABS_API_KEY = "sk-test-key";
    const audioBytes = new Uint8Array([1, 2, 3, 4, 5]);
    const fetchMock = mockFetchOk(audioBytes);

    const provider = new ElevenLabsTTSProvider();
    const result = await provider.synthesize("olá mundo");

    expect(result.format).toBe("mp3");
    expect(Buffer.isBuffer(result.audio)).toBe(true);
    expect(Array.from(result.audio)).toEqual([1, 2, 3, 4, 5]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL",
    );
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["xi-api-key"]).toBe("sk-test-key");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Accept).toBe("audio/mpeg");

    const body = JSON.parse(init.body as string);
    expect(body.text).toBe("olá mundo");
    expect(body.model_id).toBe("eleven_multilingual_v2");
    expect(body.voice_settings).toEqual({
      stability: 0.5,
      similarity_boost: 0.75,
    });
  });

  it("respeita ELEVENLABS_VOICE_ID e ELEVENLABS_MODEL_ID via env", async () => {
    process.env.ELEVENLABS_API_KEY = "sk-test-key";
    process.env.ELEVENLABS_VOICE_ID = "voice-custom";
    process.env.ELEVENLABS_MODEL_ID = "eleven_turbo_v2_5";
    const fetchMock = mockFetchOk(new Uint8Array([9]));

    const provider = new ElevenLabsTTSProvider();
    await provider.synthesize("teste");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/voice-custom",
    );
    const body = JSON.parse(init.body as string);
    expect(body.model_id).toBe("eleven_turbo_v2_5");
  });

  it("throw se texto estiver vazio", async () => {
    process.env.ELEVENLABS_API_KEY = "sk-test-key";
    mockFetchOk(new Uint8Array([1]));
    const provider = new ElevenLabsTTSProvider();
    await expect(provider.synthesize("")).rejects.toThrow(/empty text/);
    await expect(provider.synthesize("   ")).rejects.toThrow(/empty text/);
  });

  it("throw se ELEVENLABS_API_KEY ausente", async () => {
    mockFetchOk(new Uint8Array([1]));
    const provider = new ElevenLabsTTSProvider();
    await expect(provider.synthesize("olá")).rejects.toThrow(
      /ELEVENLABS_API_KEY not set/,
    );
  });

  it("throw com mensagem clara em 401", async () => {
    process.env.ELEVENLABS_API_KEY = "sk-bad";
    mockFetchError(401, '{"detail":"invalid_api_key"}');
    const provider = new ElevenLabsTTSProvider();
    await expect(provider.synthesize("olá")).rejects.toThrow(
      /ElevenLabs error 401/,
    );
  });

  it("throw em 429 (rate limit)", async () => {
    process.env.ELEVENLABS_API_KEY = "sk-test";
    mockFetchError(429, "rate_limited");
    const provider = new ElevenLabsTTSProvider();
    await expect(provider.synthesize("olá")).rejects.toThrow(
      /ElevenLabs error 429/,
    );
  });

  it("throw em 5xx (provider error)", async () => {
    process.env.ELEVENLABS_API_KEY = "sk-test";
    mockFetchError(500, "boom");
    const provider = new ElevenLabsTTSProvider();
    await expect(provider.synthesize("olá")).rejects.toThrow(
      /ElevenLabs error 500/,
    );
  });

  it("throw em erro de rede (fetch rejeita)", async () => {
    process.env.ELEVENLABS_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const provider = new ElevenLabsTTSProvider();
    await expect(provider.synthesize("olá")).rejects.toThrow(
      /network error.*ECONNREFUSED/,
    );
  });
});
