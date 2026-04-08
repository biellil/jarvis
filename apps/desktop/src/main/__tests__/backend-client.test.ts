/**
 * Tests for backend-client (Plan 18_5-02).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadBackendConfig,
  buildChatStreamUrl,
  buildToolCallResultUrl,
  createBackendClient,
  type BackendConfig,
} from '../backend-client.js';

describe('loadBackendConfig', () => {
  it('throws when JARVIS_API_KEY is missing', () => {
    expect(() => loadBackendConfig({})).toThrow(/JARVIS_API_KEY/);
  });

  it('throws when JARVIS_API_KEY is empty string', () => {
    expect(() => loadBackendConfig({ JARVIS_API_KEY: '' })).toThrow(
      /JARVIS_API_KEY/,
    );
  });

  it('returns config with default backend URL', () => {
    const cfg = loadBackendConfig({ JARVIS_API_KEY: 'secret' });
    expect(cfg).toEqual({
      backendUrl: 'http://localhost:3000',
      apiKey: 'secret',
    });
  });

  it('uses JARVIS_BACKEND_URL when provided', () => {
    const cfg = loadBackendConfig({
      JARVIS_API_KEY: 'secret',
      JARVIS_BACKEND_URL: 'http://example.com:4000',
    });
    expect(cfg.backendUrl).toBe('http://example.com:4000');
  });

  it('strips trailing slash from backendUrl', () => {
    const cfg = loadBackendConfig({
      JARVIS_API_KEY: 'secret',
      JARVIS_BACKEND_URL: 'http://example.com:4000/',
    });
    expect(cfg.backendUrl).toBe('http://example.com:4000');
  });
});

describe('URL builders', () => {
  it('buildChatStreamUrl encodes message', () => {
    const url = buildChatStreamUrl('http://localhost:3000', 'hello world & stuff');
    expect(url).toBe(
      'http://localhost:3000/api/chat/stream?message=hello%20world%20%26%20stuff',
    );
  });

  it('buildToolCallResultUrl formats id', () => {
    expect(buildToolCallResultUrl('http://localhost:3000', 42)).toBe(
      'http://localhost:3000/api/tool-calls/42/result',
    );
  });
});

describe('createBackendClient.postToolCallResult', () => {
  const config: BackendConfig = {
    backendUrl: 'http://localhost:3000',
    apiKey: 'test-key-123',
  };

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  function mockResponse(status: number, body = ''): Response {
    return {
      status,
      ok: status >= 200 && status < 300,
      text: async () => body,
    } as unknown as Response;
  }

  it('sends POST with Authorization header on success=true', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(204));
    const client = createBackendClient(config, fetchMock as unknown as typeof fetch);

    await client.postToolCallResult(7, { success: true, output: 'done' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/tool-calls/7/result');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key-123');
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({
      success: true,
      output: 'done',
    });
  });

  it('sends POST with error payload on success=false', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(204));
    const client = createBackendClient(config, fetchMock as unknown as typeof fetch);

    await client.postToolCallResult(9, {
      success: false,
      error: 'user_denied',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      success: false,
      error: 'user_denied',
    });
  });

  it('resolves on 204', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(204));
    const client = createBackendClient(config, fetchMock as unknown as typeof fetch);
    await expect(
      client.postToolCallResult(1, { success: true }),
    ).resolves.toBeUndefined();
  });

  it('throws on 404 with structured message', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(404, '{"detail":"not found"}'));
    const client = createBackendClient(config, fetchMock as unknown as typeof fetch);
    await expect(
      client.postToolCallResult(99, { success: true }),
    ).rejects.toThrow(/tool-call result failed: HTTP 404/);
  });

  it('throws on 400 with structured message', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(400, '{"detail":"bad body"}'));
    const client = createBackendClient(config, fetchMock as unknown as typeof fetch);
    await expect(
      client.postToolCallResult(1, { success: true }),
    ).rejects.toThrow(/tool-call result failed: HTTP 400/);
  });

  it('throws on 401', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(401, 'unauthorized'));
    const client = createBackendClient(config, fetchMock as unknown as typeof fetch);
    await expect(
      client.postToolCallResult(1, { success: true }),
    ).rejects.toThrow(/HTTP 401/);
  });

  it('throws on 500', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(500, 'boom'));
    const client = createBackendClient(config, fetchMock as unknown as typeof fetch);
    await expect(
      client.postToolCallResult(1, { success: true }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it('wraps network errors with prefix', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const client = createBackendClient(config, fetchMock as unknown as typeof fetch);
    await expect(
      client.postToolCallResult(1, { success: true }),
    ).rejects.toThrow(/tool-call result network error.*ECONNREFUSED/);
  });
});

describe('createBackendClient.getChatStreamRequest', () => {
  it('returns URL + Authorization header', () => {
    const client = createBackendClient({
      backendUrl: 'http://localhost:3000',
      apiKey: 'abc',
    });
    const req = client.getChatStreamRequest('hi there');
    expect(req.url).toBe(
      'http://localhost:3000/api/chat/stream?message=hi%20there',
    );
    expect(req.headers.Authorization).toBe('Bearer abc');
  });
});
