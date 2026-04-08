/**
 * Cliente SSE do main process — consome GET /chat/stream do backend (Fase 18)
 * distinguindo frames `data:` (token) de `event: action\ndata: {json}` e
 * reconectando com backoff exponencial em erros transitivos.
 *
 * Sem side effects fora de `fetch` + callbacks. Totalmente testável via
 * injeção de `fetchImpl`.
 *
 * Formato wire (apps/backend-ts/src/routes/chat.ts):
 *   data: <token>\n\n
 *   event: action\ndata: {"tool_call_id":..,"action":..,"args":..,"requires_confirmation":..}\n\n
 */

export type SseToken = { type: 'token'; data: string };
export type SseAction = {
  type: 'action';
  payload: {
    tool_call_id: number;
    action: string;
    args: Record<string, unknown>;
    requires_confirmation: boolean;
  };
};
export type SseFrame = SseToken | SseAction;

/**
 * Parses a single SSE frame (sem os `\n\n` finais).
 * Retorna null se vazio ou se o JSON do action for inválido.
 */
export function parseFrame(raw: string): SseFrame | null {
  if (raw.length === 0) return null;
  const lines = raw.split('\n');
  let event: string | undefined;
  const data: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event: ')) {
      event = line.slice(7);
    } else if (line.startsWith('event:')) {
      event = line.slice(6);
    } else if (line.startsWith('data: ')) {
      data.push(line.slice(6));
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5));
    }
  }
  if (data.length === 0 && !event) return null;
  const joined = data.join('\n');
  if (event === 'action') {
    try {
      const payload = JSON.parse(joined) as SseAction['payload'];
      return { type: 'action', payload };
    } catch (err) {
      console.warn('[sse-client] invalid JSON in action frame:', err);
      return null;
    }
  }
  return { type: 'token', data: joined };
}

/**
 * Split an accumulated buffer into complete SSE frames (separated by \n\n)
 * and a trailing `rest` that is still incomplete.
 */
export function splitBuffer(buffer: string): { frames: string[]; rest: string } {
  const frames: string[] = [];
  let rest = buffer;
  let sep: number;
  while ((sep = rest.indexOf('\n\n')) !== -1) {
    frames.push(rest.slice(0, sep));
    rest = rest.slice(sep + 2);
  }
  return { frames, rest };
}

const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];

/** Backoff exponencial com teto em 30s. */
export function computeBackoffMs(attempt: number): number {
  if (attempt < 0) return BACKOFF_MS[0];
  if (attempt >= BACKOFF_MS.length) return 30000;
  return BACKOFF_MS[attempt];
}

export interface OpenChatStreamOpts {
  url: string;
  apiKey: string;
  message: string;
  onToken: (token: string) => void;
  onAction: (action: SseAction['payload']) => void;
  onEnd: () => void;
  onError: (err: Error) => void;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

const NON_RETRYABLE = new Set([400, 401, 403, 404, 429]);

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      resolve();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Abre um stream SSE do backend e invoca callbacks conforme os frames chegam.
 * Reconecta com backoff exponencial em erros transitivos (5xx, network).
 * Não retenta em 4xx (400/401/403/404/429).
 * Abortável via `signal`.
 */
export async function openChatStream(opts: OpenChatStreamOpts): Promise<void> {
  const {
    url,
    apiKey,
    message,
    onToken,
    onAction,
    onEnd,
    onError,
    signal,
    fetchImpl = globalThis.fetch,
  } = opts;

  const fullUrl = `${url}?message=${encodeURIComponent(message)}`;
  let attempt = 0;

  while (!signal?.aborted) {
    let response: Response;
    try {
      response = await fetchImpl(fullUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'text/event-stream',
        },
        signal,
      });
    } catch (err) {
      if (signal?.aborted) {
        onEnd();
        return;
      }
      onError(err as Error);
      await sleep(computeBackoffMs(attempt++), signal);
      continue;
    }

    if (!response.ok) {
      const err = new Error(`SSE HTTP ${response.status}`);
      if (NON_RETRYABLE.has(response.status)) {
        onError(err);
        onEnd();
        return;
      }
      onError(err);
      await sleep(computeBackoffMs(attempt++), signal);
      continue;
    }

    // Connected — reset backoff.
    attempt = 0;

    const body = response.body;
    if (!body) {
      await sleep(computeBackoffMs(attempt++), signal);
      continue;
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (!signal?.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { frames, rest } = splitBuffer(buffer);
        buffer = rest;
        for (const raw of frames) {
          const parsed = parseFrame(raw);
          if (!parsed) continue;
          if (parsed.type === 'token') {
            onToken(parsed.data);
          } else {
            onAction(parsed.payload);
          }
        }
      }
    } catch (err) {
      if (signal?.aborted) {
        onEnd();
        return;
      }
      onError(err as Error);
      await sleep(computeBackoffMs(attempt++), signal);
      continue;
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* ignore */
      }
    }

    if (signal?.aborted) {
      onEnd();
      return;
    }

    // Stream ended cleanly → try to reconnect with backoff.
    await sleep(computeBackoffMs(attempt++), signal);
  }

  onEnd();
}
