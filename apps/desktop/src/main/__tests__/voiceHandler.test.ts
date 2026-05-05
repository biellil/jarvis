import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn().mockReturnValue('/tmp/userData') },
}));
vi.mock('../voiceInput/audioNormalizer.js');
vi.mock('../voiceInput/whisperResources.js');
vi.mock('@fugood/whisper.node');

// Phase 53 Plan 04: voiceHandler now imports getStreamingTtsEnabled from ../store,
// which instantiates ElectronStore at module-load (throws in node test env without
// projectName). Mock the store to prevent the throw and keep flag=false (legacy path).
vi.mock('../store', () => ({
  getStreamingTtsEnabled: vi.fn(() => false),
}));

// Phase 53 Plan 04: voiceHandler imports runStreamingTurn but legacy tests never
// exercise the streaming path (flag=false). Stub to avoid pulling streamingTurn
// (and its electron + sse-client transitive deps) into module load.
vi.mock('../voiceInput/streamingTurn.js', () => ({
  runStreamingTurn: vi.fn(),
}));

// Mock createTTSProvider so reinitializeTTS doesn't call real TTS logic
const createTTSProviderMock = vi.fn();
vi.mock('../voiceInput/tts/index.js', () => ({
  createTTSProvider: () => createTTSProviderMock(),
}));

// Import after mocks
import { handleAudio, initializeTTSProvider, reinitializeTTS } from '../voiceInput/voiceHandler.js';

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

// ============================================================
// Phase 34: reinitializeTTS + initializeTTSProvider
// ============================================================

describe('reinitializeTTS / initializeTTSProvider (Phase 34)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    createTTSProviderMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('initializeTTSProvider and reinitializeTTS are exported functions', () => {
    expect(typeof initializeTTSProvider).toBe('function');
    expect(typeof reinitializeTTS).toBe('function');
  });

  it('reinitializeTTS calls createTTSProvider() and resolves', async () => {
    const fakeProvider = { name: 'elevenlabs', synthesize: vi.fn() };
    createTTSProviderMock.mockReturnValue(fakeProvider);

    await expect(reinitializeTTS()).resolves.toBeUndefined();
    expect(createTTSProviderMock).toHaveBeenCalledTimes(1);
  });

  it('handleAudio uses module-scope provider when set via initializeTTSProvider', async () => {
    const { normalizeAudioToWav } = await import('../voiceInput/audioNormalizer.js');
    const { getWhisperInstance } = await import('../voiceInput/whisperResources.js');

    (normalizeAudioToWav as ReturnType<typeof vi.fn>).mockResolvedValue(Buffer.from([0, 1, 2, 3]));
    (getWhisperInstance as ReturnType<typeof vi.fn>).mockResolvedValue({
      transcribe: vi.fn().mockResolvedValue({ result: 'test input' }),
    });

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ reply: 'response' }),
    });

    const moduleScopeProvider = {
      name: 'murf',
      synthesize: vi.fn().mockResolvedValue({ audio: Buffer.from([9, 9, 9]), format: 'mp3' }),
    };
    initializeTTSProvider(moduleScopeProvider);

    const deps = makeVoiceHandlerDeps();
    deps.ttsProvider.synthesize = vi.fn().mockRejectedValue(new Error('should not be called'));

    const result = await handleAudio(Buffer.from([1, 2, 3, 4]), deps);

    expect(result.success).toBe(true);
    // Module-scope provider synthesize was called, not deps.ttsProvider
    expect(moduleScopeProvider.synthesize).toHaveBeenCalled();
    expect(deps.ttsProvider.synthesize).not.toHaveBeenCalled();
  });
});
