/**
 * Tests pro handleSendAudio (Fase 19_5-01).
 *
 * Cobre:
 *  - Success path com response shape novo
 *  - URL correta (backendUrl + /api/chat/audio)
 *  - Authorization: Bearer <apiKey>
 *  - Content-Type webm + filename recording.webm
 *  - Error body JSON (code/detail) → error estruturado
 *  - Error body não-JSON → HTTP_<status>
 *  - 4xx não retrya
 *  - 5xx retrya e recupera
 *  - Network error → code NETWORK
 *  - Timeout 60s → code TIMEOUT
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleSendAudio, type ChatHandlerDeps } from '../chat';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

function makeDeps(
  overrides: Partial<ChatHandlerDeps['config']> = {},
): ChatHandlerDeps {
  return {
    openStream: (async () => {}) as unknown as ChatHandlerDeps['openStream'],
    config: {
      backendUrl: 'http://localhost:3000',
      apiKey: 'test-key',
      ...overrides,
    },
    actionExecutor: {
      enqueue: vi.fn(),
      shutdown: vi.fn(async () => {}),
    } as unknown as ChatHandlerDeps['actionExecutor'],
  };
}

function successBody() {
  return {
    transcription: 'olá jarvis',
    message: 'olá! como posso ajudar?',
    audio_base64: 'QUJDRA==',
    audio_format: 'mp3' as const,
    stt_provider: 'whisper-local',
    tts_provider: 'kokoro-local',
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function textResponse(status: number, text: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new Error('not json');
    },
    text: async () => text,
  } as unknown as Response;
}

describe('handleSendAudio', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sucesso: parseia response shape novo', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(200, successBody()),
    );

    const result = await handleSendAudio(
      Buffer.from([1, 2, 3, 4]),
      makeDeps(),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        transcription: 'olá jarvis',
        message: 'olá! como posso ajudar?',
        audioBase64: 'QUJDRA==',
        audioFormat: 'mp3',
        sttProvider: 'whisper-local',
        ttsProvider: 'kokoro-local',
      });
    }
  });

  it('URL: chama ${backendUrl}/api/chat/audio', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(200, successBody()));

    await handleSendAudio(Buffer.from([1]), makeDeps());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3000/api/chat/audio');
  });

  it('auth header: Authorization Bearer <apiKey>', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(200, successBody()));

    await handleSendAudio(Buffer.from([1]), makeDeps());

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key');
    expect(init.method).toBe('POST');
  });

  it('content-type webm + filename recording.webm', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(200, successBody()));

    await handleSendAudio(Buffer.from([1, 2, 3]), makeDeps());

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    const audio = body.get('audio') as Blob & { name?: string };
    expect(audio).toBeTruthy();
    expect(audio.type).toBe('audio/webm');
    // FormData.append(name, blob, filename) wraps as File with .name
    expect((audio as unknown as File).name).toBe('recording.webm');
  });

  it('erro 400 com body JSON {code,detail} → error estruturado', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(400, { code: 'NO_SPEECH', detail: 'no speech detected' }),
    );

    const result = await handleSendAudio(Buffer.from([1]), makeDeps());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NO_SPEECH');
      expect(result.error.message).toBe('no speech detected');
    }
  });

  it('erro 500 com body não-JSON → HTTP_500', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(textResponse(500, 'internal boom'));
    // 500 retrya 3x → todos retornam texto plano
    fetchMock.mockResolvedValue(textResponse(500, 'internal boom'));

    const result = await handleSendAudio(Buffer.from([1]), makeDeps());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('HTTP_500');
      expect(result.error.message).toContain('internal boom');
    }
  }, 15000);

  it('4xx não retrya: fetch chamado exatamente 1 vez', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      jsonResponse(400, { code: 'EMPTY_AUDIO', detail: 'empty' }),
    );

    await handleSendAudio(Buffer.from([1]), makeDeps());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('5xx retrya e recupera no segundo attempt', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(textResponse(500, 'boom'))
      .mockResolvedValueOnce(jsonResponse(200, successBody()));

    const result = await handleSendAudio(Buffer.from([1]), makeDeps());

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 15000);

  it('network error → code NETWORK', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('fetch failed'),
    );

    const result = await handleSendAudio(Buffer.from([1]), makeDeps());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NETWORK');
      expect(result.error.message).toContain('fetch failed');
    }
  }, 15000);

  it('timeout 60s → code TIMEOUT', async () => {
    vi.useFakeTimers();
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation((_url, init?: RequestInit) => {
      return new Promise((_, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const promise = handleSendAudio(Buffer.from([1]), makeDeps());
    // Avança o timeout do AbortController (60s) + backoffs das 2 próximas tentativas
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(1_100);
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(3_300);
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await promise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TIMEOUT');
      expect(result.error.message).toContain('60');
    }
  });
});
