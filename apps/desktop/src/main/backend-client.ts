/**
 * Backend HTTP client (Plan 18_5-02).
 *
 * Centraliza todo acesso HTTP do Electron main process ao backend/gateway.
 * - Lê config do env (JARVIS_BACKEND_URL, JARVIS_API_KEY)
 * - Injeta Authorization: Bearer <key> em todos os requests
 * - Fail-fast se API_KEY ausente no startup
 *
 * Consumers:
 *   - action-executor → postToolCallResult() reporta outcome
 *   - sse-client / ipc chat → getChatStreamRequest() monta URL + headers
 */

export interface BackendConfig {
  backendUrl: string;
  apiKey: string;
}

export type ToolResult =
  | { success: true; output?: string | null }
  | { success: false; output?: string | null; error: string };

export interface BackendClient {
  postToolCallResult(id: number, result: ToolResult): Promise<void>;
  getChatStreamRequest(message: string): {
    url: string;
    headers: Record<string, string>;
  };
}

const DEFAULT_BACKEND_URL = 'http://localhost:3000';

/**
 * Loads backend config from env. Throws if JARVIS_API_KEY is missing.
 * Main process should call this at startup to fail-fast.
 */
export function loadBackendConfig(
  env: Record<string, string | undefined> = process.env,
): BackendConfig {
  const apiKey = env.JARVIS_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    throw new Error(
      'JARVIS_API_KEY env var is required (generate with: openssl rand -hex 32)',
    );
  }
  const rawUrl = env.JARVIS_BACKEND_URL ?? DEFAULT_BACKEND_URL;
  const backendUrl = rawUrl.replace(/\/+$/, '');
  return { backendUrl, apiKey };
}

export function buildChatStreamUrl(backendUrl: string, message: string): string {
  return `${backendUrl}/api/chat/stream?message=${encodeURIComponent(message)}`;
}

export function buildToolCallResultUrl(backendUrl: string, id: number): string {
  return `${backendUrl}/api/tool-calls/${id}/result`;
}

/**
 * Creates an authenticated backend client.
 * fetchImpl is injectable for tests.
 */
export function createBackendClient(
  config: BackendConfig,
  fetchImpl: typeof fetch = globalThis.fetch,
): BackendClient {
  const authHeader = `Bearer ${config.apiKey}`;

  return {
    async postToolCallResult(id, result) {
      const url = buildToolCallResultUrl(config.backendUrl, id);
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(result),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`tool-call result network error: ${msg}`);
      }

      if (response.status === 204) return;

      let bodyText = '';
      try {
        bodyText = await response.text();
      } catch {
        // ignore read error
      }
      throw new Error(
        `tool-call result failed: HTTP ${response.status} ${bodyText}`.trim(),
      );
    },

    getChatStreamRequest(message: string) {
      return {
        url: buildChatStreamUrl(config.backendUrl, message),
        headers: {
          Authorization: authHeader,
        },
      };
    },
  };
}
