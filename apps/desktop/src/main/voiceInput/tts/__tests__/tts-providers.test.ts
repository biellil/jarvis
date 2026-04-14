import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// All imports will fail until Plan 30-03 creates the modules
import { MurfTTSProvider } from '../murf.js';
import { ElevenLabsTTSProvider } from '../elevenlabs.js';
import { createTTSProvider } from '../index.js';

function mockFetchSuccess(body: unknown): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
}

function mockFetchSuccessBinary(arrayBuffer: ArrayBuffer): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    arrayBuffer: async () => arrayBuffer,
    text: async () => '',
  }));
}

describe('MurfTTSProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('synthesize() sends POST to Murf API with api-key header (NOT Authorization: Bearer)', async () => {
    vi.stubEnv('MURF_API_KEY', 'test-murf-key');
    mockFetchSuccess({ encodedAudio: 'QUJDRA==' });

    const provider = new MurfTTSProvider();
    await provider.synthesize('hello world');

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.murf.ai/v1/speech/generate');
    const headers = init.headers as Record<string, string>;
    expect(headers['api-key']).toBe('test-murf-key');
    expect(headers['Authorization']).toBeUndefined();
  });

  it('synthesize() reads response.encodedAudio (base64) and returns Buffer with format mp3', async () => {
    vi.stubEnv('MURF_API_KEY', 'test-murf-key');
    // 'ABCD' in base64 is 'QUJDRA=='
    mockFetchSuccess({ encodedAudio: 'QUJDRA==' });

    const provider = new MurfTTSProvider();
    const result = await provider.synthesize('hello');

    expect(result.format).toBe('mp3');
    expect(result.audio).toBeInstanceOf(Buffer);
    expect(result.audio.toString('base64')).toBe('QUJDRA==');
  });

  it('synthesize() throws when MURF_API_KEY not set', async () => {
    vi.stubEnv('MURF_API_KEY', '');
    mockFetchSuccess({ encodedAudio: 'QUJDRA==' });

    const provider = new MurfTTSProvider();
    await expect(provider.synthesize('hello')).rejects.toThrow(/MURF_API_KEY/);
  });

  it('synthesize() throws with "empty text" when text is empty string', async () => {
    vi.stubEnv('MURF_API_KEY', 'test-murf-key');

    const provider = new MurfTTSProvider();
    await expect(provider.synthesize('')).rejects.toThrow(/empty text/);
  });
});

describe('ElevenLabsTTSProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('synthesize() sends POST to ElevenLabs API with xi-api-key header', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-el-key');
    vi.stubEnv('ELEVENLABS_VOICE_ID', 'test-voice-id');
    mockFetchSuccessBinary(new ArrayBuffer(4));

    const provider = new ElevenLabsTTSProvider();
    await provider.synthesize('hello world');

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/test-voice-id');
    const headers = init.headers as Record<string, string>;
    expect(headers['xi-api-key']).toBe('test-el-key');
  });

  it('synthesize() returns audio buffer from response.arrayBuffer() with format mp3', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-el-key');
    const ab = new ArrayBuffer(8);
    new Uint8Array(ab).set([1, 2, 3, 4, 5, 6, 7, 8]);
    mockFetchSuccessBinary(ab);

    const provider = new ElevenLabsTTSProvider();
    const result = await provider.synthesize('hello');

    expect(result.format).toBe('mp3');
    expect(result.audio).toBeInstanceOf(Buffer);
    expect(result.audio.length).toBe(8);
  });

  it('synthesize() throws when ELEVENLABS_API_KEY not set', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', '');

    const provider = new ElevenLabsTTSProvider();
    await expect(provider.synthesize('hello')).rejects.toThrow(/ELEVENLABS_API_KEY/);
  });
});

describe('createTTSProvider factory', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('TTS_PROVIDER=murf + MURF_API_KEY set → returns MurfTTSProvider instance (name === murf)', () => {
    vi.stubEnv('TTS_PROVIDER', 'murf');
    vi.stubEnv('MURF_API_KEY', 'test-murf-key');

    const provider = createTTSProvider();

    expect(provider.name).toBe('murf');
    expect(provider).toBeInstanceOf(MurfTTSProvider);
  });

  it('TTS_PROVIDER=elevenlabs + ELEVENLABS_API_KEY set → returns ElevenLabsTTSProvider instance (name === elevenlabs)', () => {
    vi.stubEnv('TTS_PROVIDER', 'elevenlabs');
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-el-key');

    const provider = createTTSProvider();

    expect(provider.name).toBe('elevenlabs');
    expect(provider).toBeInstanceOf(ElevenLabsTTSProvider);
  });

  it('TTS_PROVIDER=murf + MURF_API_KEY missing → logs warning, returns ElevenLabsTTSProvider (graceful degrade)', () => {
    vi.stubEnv('TTS_PROVIDER', 'murf');
    vi.stubEnv('MURF_API_KEY', '');
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-el-key');
    const warnSpy = vi.spyOn(console, 'warn');

    const provider = createTTSProvider();

    expect(warnSpy).toHaveBeenCalled();
    expect(provider).toBeInstanceOf(ElevenLabsTTSProvider);
  });

  it('TTS_PROVIDER not set → defaults to elevenlabs', () => {
    vi.stubEnv('TTS_PROVIDER', '');
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-el-key');

    const provider = createTTSProvider();

    expect(provider.name).toBe('elevenlabs');
  });
});
