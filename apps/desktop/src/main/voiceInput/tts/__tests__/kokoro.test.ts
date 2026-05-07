import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: vi.fn((key: string) => (key === 'userData' ? '/test/userData' : '')) },
}));

vi.mock('@huggingface/transformers', () => ({
  env: { cacheDir: '', useFSCache: false },
}));

// Mock kokoro-js before importing the provider
vi.mock('kokoro-js', () => ({
  KokoroTTS: {
    from_pretrained: vi.fn(),
  },
}));

// Mock store.ts — voiceHandler tests do this same pattern
vi.mock('../../../../store.js', () => ({
  getTtsLocalOnlyFlag: vi.fn().mockReturnValue(false),
}));

import { KokoroTTS } from 'kokoro-js';
import { KokoroTTSProvider } from '../kokoro.js';

const mockGenerate = vi.fn();
const mockTtsInstance = { generate: mockGenerate };

describe('KokoroTTSProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(KokoroTTS.from_pretrained).mockResolvedValue(mockTtsInstance as any);
    mockGenerate.mockResolvedValue(Buffer.from([0x52, 0x49, 0x46, 0x46])); // RIFF header
  });

  it('returns TTSResult with wav format', async () => {
    const provider = new KokoroTTSProvider();
    const result = await provider.synthesize('Hello world');
    expect(result.format).toBe('wav');
    expect(result.audio).toBeInstanceOf(Buffer);
    expect(result.audio.length).toBeGreaterThan(0);
  });

  it('throws on empty text', async () => {
    const provider = new KokoroTTSProvider();
    await expect(provider.synthesize('')).rejects.toThrow('empty text');
  });

  it('lazy-loads model only once across multiple synthesize() calls', async () => {
    const provider = new KokoroTTSProvider();
    await provider.synthesize('First call');
    await provider.synthesize('Second call');
    expect(KokoroTTS.from_pretrained).toHaveBeenCalledTimes(1);
  });

  it('throws descriptive error when from_pretrained fails', async () => {
    vi.mocked(KokoroTTS.from_pretrained).mockRejectedValue(new Error('ONNX session failed'));
    const provider = new KokoroTTSProvider();
    await expect(provider.synthesize('test')).rejects.toThrow('KokoroTTSProvider: failed to load model');
  });

  it('throws descriptive error when generate() fails', async () => {
    mockGenerate.mockRejectedValue(new Error('synthesis error'));
    const provider = new KokoroTTSProvider();
    await expect(provider.synthesize('test')).rejects.toThrow('KokoroTTSProvider: synthesis failed');
  });

  it('has name === "kokoro"', () => {
    const provider = new KokoroTTSProvider();
    expect(provider.name).toBe('kokoro');
  });

  it('error propagates without swallowing when synthesis fails', async () => {
    mockGenerate.mockRejectedValue(new Error('gpu out of memory'));
    const provider = new KokoroTTSProvider();
    const err = await provider.synthesize('test').catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('synthesis failed');
  });
});
