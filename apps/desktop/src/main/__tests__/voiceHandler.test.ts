import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn().mockReturnValue('/tmp/userData') },
}));
vi.mock('../voiceInput/audioNormalizer.js');
vi.mock('../voiceInput/whisperResources.js');
vi.mock('@fugood/whisper.node');

// Import after mocks
import { handleAudio } from '../voiceInput/voiceHandler.js';

function makeVoiceHandlerDeps() {
  return {
    config: { backendUrl: 'http://localhost:3000', apiKey: 'test-key' },
    selectedModel: 'base' as const,
    ttsProvider: {
      name: 'murf',
      synthesize: vi.fn().mockResolvedValue({ audio: Buffer.from([1, 2, 3]), format: 'mp3' }),
    },
  };
}

describe('handleAudio', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('success path: returns transcription + message + audioBase64', async () => {
    const { normalizeAudioToWav } = await import('../voiceInput/audioNormalizer.js');
    const { getWhisperInstance } = await import('../voiceInput/whisperResources.js');
    const whisperMod = await import('@fugood/whisper.node');

    (normalizeAudioToWav as ReturnType<typeof vi.fn>).mockResolvedValue(Buffer.from([0, 1, 2, 3]));
    (getWhisperInstance as ReturnType<typeof vi.fn>).mockResolvedValue({
      transcribe: vi.fn().mockResolvedValue({ result: 'olá jarvis' }),
    });

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ reply: 'olá!' }),
    });

    const deps = makeVoiceHandlerDeps();
    const result = await handleAudio(Buffer.from([1, 2, 3, 4]), deps);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.transcription).toBe('olá jarvis');
      expect(result.data.message).toBe('olá!');
      expect(result.data.audioBase64).not.toBeNull();
      expect(result.data.audioFormat).toBe('mp3');
      expect(result.data.sttProvider).toBe('whisper.cpp');
      expect(result.data.ttsProvider).toBe('murf');
    }
  });

  it('TTS failure: graceful degrade returns audioBase64: null with message intact', async () => {
    const { normalizeAudioToWav } = await import('../voiceInput/audioNormalizer.js');
    const { getWhisperInstance } = await import('../voiceInput/whisperResources.js');

    (normalizeAudioToWav as ReturnType<typeof vi.fn>).mockResolvedValue(Buffer.from([0, 1, 2, 3]));
    (getWhisperInstance as ReturnType<typeof vi.fn>).mockResolvedValue({
      transcribe: vi.fn().mockResolvedValue({ result: 'olá jarvis' }),
    });

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ reply: 'olá!' }),
    });

    const deps = makeVoiceHandlerDeps();
    deps.ttsProvider.synthesize = vi.fn().mockRejectedValue(new Error('TTS network error'));

    const result = await handleAudio(Buffer.from([1, 2, 3, 4]), deps);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.transcription).toBe('olá jarvis');
      expect(result.data.message).toBe('olá!');
      expect(result.data.audioBase64).toBeNull();
      expect(result.data.audioFormat).toBe('mp3');
      expect(result.data.sttProvider).toBe('whisper.cpp');
      expect(result.data.ttsProvider).toBe('murf');
    }
  });

  it('LLM gateway 503: returns error with code LLM_ERROR', async () => {
    const { normalizeAudioToWav } = await import('../voiceInput/audioNormalizer.js');
    const { getWhisperInstance } = await import('../voiceInput/whisperResources.js');

    (normalizeAudioToWav as ReturnType<typeof vi.fn>).mockResolvedValue(Buffer.from([0, 1, 2, 3]));
    (getWhisperInstance as ReturnType<typeof vi.fn>).mockResolvedValue({
      transcribe: vi.fn().mockResolvedValue({ result: 'olá jarvis' }),
    });

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'service unavailable' }),
      text: async () => 'service unavailable',
    });

    const deps = makeVoiceHandlerDeps();
    const result = await handleAudio(Buffer.from([1, 2, 3, 4]), deps);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('LLM_ERROR');
      expect(result.error.message).toContain('503');
    }
  });

  it('normalization error: returns VOICE_HANDLER_ERROR', async () => {
    const { normalizeAudioToWav } = await import('../voiceInput/audioNormalizer.js');

    (normalizeAudioToWav as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('ffmpeg spawn failed: binary not found'),
    );

    const deps = makeVoiceHandlerDeps();
    const result = await handleAudio(Buffer.from([1, 2, 3, 4]), deps);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VOICE_HANDLER_ERROR');
      expect(result.error.message).toContain('ffmpeg');
    }
  });

  it('empty transcription: returns NO_SPEECH error', async () => {
    const { normalizeAudioToWav } = await import('../voiceInput/audioNormalizer.js');
    const { getWhisperInstance } = await import('../voiceInput/whisperResources.js');

    (normalizeAudioToWav as ReturnType<typeof vi.fn>).mockResolvedValue(Buffer.from([0, 1, 2, 3]));
    (getWhisperInstance as ReturnType<typeof vi.fn>).mockResolvedValue({
      transcribe: vi.fn().mockResolvedValue({ result: '' }),
    });

    const deps = makeVoiceHandlerDeps();
    const result = await handleAudio(Buffer.from([1, 2, 3, 4]), deps);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NO_SPEECH');
      expect(result.error.message).toContain('empty transcription');
    }
  });
});
