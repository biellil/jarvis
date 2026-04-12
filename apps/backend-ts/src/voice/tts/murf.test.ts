import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MurfTTSProvider } from "./murf.js";

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.MURF_API_KEY;
  delete process.env.MURF_VOICE_ID;
}

type MurfResponseBody = {
  encodedAudio?: string;
  audioFile?: string;
  audioLengthInSeconds?: number;
  remainingCharacterCount?: number;
};

function mockFetchOk(body: MurfResponseBody): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function mockFetchError(
  status: number,
  body: string,
): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => ({
    ok: false,
    status,
    json: async () => ({}),
    text: async () => body,
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("MurfTTSProvider", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetEnv();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    logSpy.mockRestore();
    process.env = { ...ORIGINAL_ENV };
  });

  it("expõe nome 'murf'", () => {
    const p = new MurfTTSProvider();
    expect(p.name).toBe("murf");
  });

  it("sintetiza texto com sucesso retornando Buffer mp3 a partir de encodedAudio base64", async () => {
    process.env.MURF_API_KEY = "murf-test-key";
    // "JARVIS" em base64 = "SkFSVklT"
    const base64Audio = Buffer.from("JARVIS").toString("base64");
    const fetchMock = mockFetchOk({
      encodedAudio: base64Audio,
      audioLengthInSeconds: 2.4,
      remainingCharacterCount: 9985,
    });

    const provider = new MurfTTSProvider();
    const result = await provider.synthesize("olá mundo");

    expect(result.format).toBe("mp3");
    expect(Buffer.isBuffer(result.audio)).toBe(true);
    expect(result.audio.toString("utf-8")).toBe("JARVIS");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.murf.ai/v1/speech/generate");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers["api-key"]).toBe("murf-test-key");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Accept).toBe("application/json");

    const body = JSON.parse(init.body as string);
    expect(body.text).toBe("olá mundo");
    expect(body.voiceId).toBe("pt-BR-heitor");
    expect(body.format).toBe("MP3");
    expect(body.channelType).toBe("MONO");
    expect(body.encodeAsBase64).toBe(true);
    expect(body.rate).toBe(0);
    expect(body.pitch).toBe(0);
  });

  it("respeita MURF_VOICE_ID custom via env", async () => {
    process.env.MURF_API_KEY = "murf-test-key";
    process.env.MURF_VOICE_ID = "pt-BR-gustavo";
    const base64Audio = Buffer.from("x").toString("base64");
    const fetchMock = mockFetchOk({ encodedAudio: base64Audio });

    const provider = new MurfTTSProvider();
    await provider.synthesize("teste");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.voiceId).toBe("pt-BR-gustavo");
  });

  it("usa default 'pt-BR-heitor' quando MURF_VOICE_ID ausente", async () => {
    process.env.MURF_API_KEY = "murf-test-key";
    const base64Audio = Buffer.from("x").toString("base64");
    const fetchMock = mockFetchOk({ encodedAudio: base64Audio });

    const provider = new MurfTTSProvider();
    await provider.synthesize("teste");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.voiceId).toBe("pt-BR-heitor");
  });

  it("throw se texto estiver vazio", async () => {
    process.env.MURF_API_KEY = "murf-test-key";
    mockFetchOk({ encodedAudio: "x" });
    const provider = new MurfTTSProvider();
    await expect(provider.synthesize("")).rejects.toThrow(
      /MurfTTSProvider: empty text/,
    );
  });

  it("throw se texto for só whitespace", async () => {
    process.env.MURF_API_KEY = "murf-test-key";
    mockFetchOk({ encodedAudio: "x" });
    const provider = new MurfTTSProvider();
    await expect(provider.synthesize("   ")).rejects.toThrow(
      /MurfTTSProvider: empty text/,
    );
  });

  it("throw se MURF_API_KEY ausente", async () => {
    mockFetchOk({ encodedAudio: "x" });
    const provider = new MurfTTSProvider();
    await expect(provider.synthesize("olá")).rejects.toThrow(
      /MurfTTSProvider: MURF_API_KEY not set/,
    );
  });

  it("throw com mensagem clara em 401", async () => {
    process.env.MURF_API_KEY = "murf-bad";
    mockFetchError(401, '{"error":"invalid_api_key"}');
    const provider = new MurfTTSProvider();
    await expect(provider.synthesize("olá")).rejects.toThrow(
      /Murf error 401/,
    );
  });

  it("throw em 429 (rate limit)", async () => {
    process.env.MURF_API_KEY = "murf-test";
    mockFetchError(429, "rate_limited");
    const provider = new MurfTTSProvider();
    await expect(provider.synthesize("olá")).rejects.toThrow(
      /Murf error 429/,
    );
  });

  it("throw em 5xx (provider error)", async () => {
    process.env.MURF_API_KEY = "murf-test";
    mockFetchError(500, "boom");
    const provider = new MurfTTSProvider();
    await expect(provider.synthesize("olá")).rejects.toThrow(
      /Murf error 500/,
    );
  });

  it("throw em erro de rede (fetch rejeita)", async () => {
    process.env.MURF_API_KEY = "murf-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const provider = new MurfTTSProvider();
    await expect(provider.synthesize("olá")).rejects.toThrow(
      /MurfTTSProvider: network error.*ECONNREFUSED/,
    );
  });

  it("throw em 200 mas encodedAudio vazio", async () => {
    process.env.MURF_API_KEY = "murf-test";
    mockFetchOk({ encodedAudio: "" });
    const provider = new MurfTTSProvider();
    await expect(provider.synthesize("olá")).rejects.toThrow(
      /MurfTTSProvider: empty encodedAudio/,
    );
  });

  it("throw em 200 sem campo encodedAudio", async () => {
    process.env.MURF_API_KEY = "murf-test";
    mockFetchOk({ audioFile: "https://cdn.murf.ai/some.mp3" });
    const provider = new MurfTTSProvider();
    await expect(provider.synthesize("olá")).rejects.toThrow(
      /MurfTTSProvider: empty encodedAudio/,
    );
  });

  it("loga quota remainingCharacterCount quando presente", async () => {
    process.env.MURF_API_KEY = "murf-test";
    const base64Audio = Buffer.from("ok").toString("base64");
    mockFetchOk({ encodedAudio: base64Audio, remainingCharacterCount: 4321 });

    const provider = new MurfTTSProvider();
    await provider.synthesize("olá");

    const calls = logSpy.mock.calls.map((c) => String(c[0]));
    const quotaLog = calls.find((s) => s.includes("quota"));
    expect(quotaLog).toBeDefined();
    expect(quotaLog).toContain("4321");
  });

  it("NÃO loga a MURF_API_KEY em nenhum console.log", async () => {
    const secret = "super-secret-murf-key-xyz-987";
    process.env.MURF_API_KEY = secret;
    const base64Audio = Buffer.from("ok").toString("base64");
    mockFetchOk({ encodedAudio: base64Audio, remainingCharacterCount: 10 });

    const provider = new MurfTTSProvider();
    await provider.synthesize("olá");

    for (const call of logSpy.mock.calls) {
      for (const arg of call) {
        expect(String(arg)).not.toContain(secret);
      }
    }
  });

  it("NÃO vaza a MURF_API_KEY em mensagens de erro (401)", async () => {
    const secret = "super-secret-murf-key-abc-123";
    process.env.MURF_API_KEY = secret;
    mockFetchError(401, "invalid_api_key");
    const provider = new MurfTTSProvider();
    try {
      await provider.synthesize("olá");
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as Error).message).not.toContain(secret);
    }
  });
});
