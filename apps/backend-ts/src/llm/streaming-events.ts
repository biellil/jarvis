/**
 * ChatOpenAIStreamingEvents — LM Studio native /api/v1/chat SSE consumer.
 *
 * Extends ChatOpenAI to consume LM Studio's native streaming event protocol,
 * which provides lower latency (TTFT) compared to the standard OpenAI-compatible
 * endpoint. Falls back transparently to standard ChatOpenAI streaming on error (D-02).
 *
 * LM Studio native SSE event types:
 *   - chat.start       → metadata, no yield
 *   - message.start    → metadata, no yield
 *   - message.delta    → { content: string } — yielded as AIMessageChunk
 *   - reasoning.delta  → { content: string } — logged, not yielded in Phase 60
 *   - message.end      → metadata, no yield
 *   - chat.end         → TTFT stats logged
 *   - error            → throws with error.message propagated
 *
 * Native URL: replace /v1 at end of LM_STUDIO_URL with /api/v1 → append /chat
 *   e.g. http://localhost:1234/v1  →  http://localhost:1234/api/v1/chat
 *
 * @module streaming-events
 */

import { ChatOpenAI } from '@langchain/openai';
import type { BaseMessage } from '@langchain/core/messages';
import { AIMessageChunk } from '@langchain/core/messages';

/** Options for ChatOpenAIStreamingEvents (extends ChatOpenAI constructor options). */
export type ChatOpenAIStreamingEventsOptions = ConstructorParameters<typeof ChatOpenAI>[0] & {
  /** Enable native LM Studio /api/v1/chat SSE endpoint. When false, delegates to super. */
  nativeEventsEnabled: boolean;
};

/**
 * ChatOpenAI subclass that consumes LM Studio's native streaming event protocol.
 *
 * When `nativeEventsEnabled=true`, stream() calls `_streamNativeEvents()` and
 * falls back to `super.stream()` silently on any error (D-02).
 * When `nativeEventsEnabled=false`, stream() delegates directly to `super.stream()`.
 */
export class ChatOpenAIStreamingEvents extends ChatOpenAI {
  private readonly nativeEventsEnabled: boolean;

  constructor(opts: ChatOpenAIStreamingEventsOptions) {
    const { nativeEventsEnabled, ...rest } = opts;
    super(rest);
    this.nativeEventsEnabled = nativeEventsEnabled;
  }

  /**
   * Build the native LM Studio chat endpoint URL from the configured baseURL.
   *
   * Transformation: remove trailing /v1 (if present) → append /api/v1/chat.
   * Idempotent: bases that already lack /v1 suffix are simply appended with /chat.
   *
   * Examples:
   *   http://localhost:1234/v1    → http://localhost:1234/api/v1/chat
   *   http://host:1234/api/v1    → http://host:1234/api/v1/chat
   */
  _buildNativeUrl(): string {
    // Access baseURL from the OpenAI client configuration stored internally
    const base: string = (this as any).clientConfig?.baseURL ?? 'http://localhost:1234/v1';
    // If the base already ends with /api/v1 — just append /chat (idempotent)
    if (/\/api\/v1\/?$/.test(base)) {
      return base.replace(/\/?$/, '') + '/chat';
    }
    // Otherwise strip trailing /v1 suffix and rebuild with /api/v1/chat
    const withoutV1 = base.replace(/\/v1\/?$/, '');
    return `${withoutV1}/api/v1/chat`;
  }

  /**
   * Override stream() to route through native events when enabled.
   *
   * Flow:
   *  - nativeEventsEnabled=false → yield* super.stream()
   *  - nativeEventsEnabled=true  → yield* _streamNativeEvents(), on error → yield* super.stream() (D-02)
   */
  async *stream(
    input: BaseMessage[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
  ): AsyncGenerator<AIMessageChunk> {
    if (!this.nativeEventsEnabled) {
      yield* super.stream(input, ...args);
      return;
    }

    try {
      yield* this._streamNativeEvents(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        '[ChatOpenAIStreamingEvents] Native events failed, falling back to standard SSE:',
        msg,
      );
      yield* super.stream(input, ...args);
    }
  }

  /**
   * Stream from LM Studio's native /api/v1/chat endpoint.
   *
   * Parses SSE events separated by double-newline boundaries. Maintains a
   * buffer to handle events split across network chunks (partial reads).
   *
   * Yields: AIMessageChunk for each `message.delta` event with non-empty content.
   * Throws: on HTTP error or `error` SSE event.
   */
  async *_streamNativeEvents(messages: BaseMessage[]): AsyncGenerator<AIMessageChunk> {
    // Map LangChain messages to OpenAI chat format
    const chatMessages = messages.map(m => {
      const type = m._getType();
      const role = type === 'human' ? 'user' : type === 'ai' ? 'assistant' : 'system';
      const content =
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return { role, content };
    });

    const url = this._buildNativeUrl();
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatMessages, stream: true }),
    });

    if (!response.ok) {
      throw new Error(
        `LM Studio native endpoint error: ${response.status} ${response.statusText}`,
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body reader available');

    let buffer = '';
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Accumulate decoded text; stream:true keeps the internal state for multi-byte chars
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by double newlines
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? ''; // Keep the incomplete event tail in buffer

      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        const lines = trimmed.split('\n');
        const eventLine = lines.find(l => l.startsWith('event: '));
        const dataLine = lines.find(l => l.startsWith('data: '));
        if (!eventLine || !dataLine) continue;

        const eventType = eventLine.slice('event: '.length).trim();
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(dataLine.slice('data: '.length).trim()) as Record<string, unknown>;
        } catch {
          continue; // Skip malformed JSON silently
        }

        switch (eventType) {
          case 'message.delta':
            // Official LM Studio spec: { type: 'message.delta', content: string }
            // content is a TOP-LEVEL field (not nested in delta.text)
            if (typeof data.content === 'string' && data.content.length > 0) {
              yield new AIMessageChunk({ content: data.content, additional_kwargs: {} });
            }
            break;

          case 'reasoning.delta':
            // Log reasoning for observability; not forwarded to UI in Phase 60
            console.log('[native-events] reasoning:', data.content);
            break;

          case 'chat.end': {
            // Log TTFT and throughput metrics for observability
            const stats = (data.result as Record<string, unknown> | undefined)?.stats as
              | Record<string, unknown>
              | undefined;
            if (stats?.time_to_first_token_seconds !== undefined) {
              console.log(
                '[native-events] TTFT:',
                stats.time_to_first_token_seconds,
                's, tps:',
                stats.tokens_per_second,
              );
            }
            break;
          }

          case 'error': {
            const errData = data.error as { message?: string } | undefined;
            throw new Error(
              `LM Studio error event: ${errData?.message ?? JSON.stringify(data.error)}`,
            );
          }

          // chat.start, message.start, message.end — metadata only, no yield
          default:
            break;
        }
      }
    }
  }
}
