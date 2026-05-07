// @vitest-environment node
/**
 * Unit tests for ChatOpenAIStreamingEvents.
 *
 * Tests cover:
 * - _buildNativeUrl URL transformation
 * - stream() delegation to super.stream() when native events disabled
 * - _streamNativeEvents SSE event parsing (message.delta yields, others skipped)
 * - Error event propagation
 * - TTFT logging from chat.end stats
 * - Silent fallback from _streamNativeEvents to super.stream() on error (D-02)
 * - SSE buffer management for partial events at chunk boundary
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { AIMessageChunk, HumanMessage } from '@langchain/core/messages';
import { ChatOpenAIStreamingEvents } from './streaming-events.js';

// ---------------------------------------------------------------------------
// Helper: create a simulated SSE ReadableStream from event descriptors
// ---------------------------------------------------------------------------
function makeSSEStream(events: Array<{ type: string; data: object }>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = events.map(e => encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`));
  let idx = 0;
  return new ReadableStream({
    pull(controller) {
      if (idx < chunks.length) controller.enqueue(chunks[idx++]);
      else controller.close();
    },
  });
}

// Helper: create a split SSE stream to test buffer management
function makeSplitSSEStream(rawChunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const byteChunks = rawChunks.map(c => encoder.encode(c));
  let idx = 0;
  return new ReadableStream({
    pull(controller) {
      if (idx < byteChunks.length) controller.enqueue(byteChunks[idx++]);
      else controller.close();
    },
  });
}

// ---------------------------------------------------------------------------
// Helper: collect all chunks from an async generator into an array
// ---------------------------------------------------------------------------
async function collectChunks(gen: AsyncIterable<AIMessageChunk>): Promise<AIMessageChunk[]> {
  const result: AIMessageChunk[] = [];
  for await (const chunk of gen) {
    result.push(chunk);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Helper: create a minimal ChatOpenAIStreamingEvents instance for testing
// ---------------------------------------------------------------------------
function makeInstance(nativeEventsEnabled: boolean, baseURL = 'http://localhost:1234/v1') {
  return new ChatOpenAIStreamingEvents({
    configuration: { baseURL },
    apiKey: 'lm-studio',
    model: 'test-model',
    streaming: true,
    nativeEventsEnabled,
  });
}

// ---------------------------------------------------------------------------
// Test messages
// ---------------------------------------------------------------------------
const testMessages = [new HumanMessage('Hello')];

// ---------------------------------------------------------------------------
describe('ChatOpenAIStreamingEvents', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Test 1: _buildNativeUrl converts /v1 suffix
  // =========================================================================
  test('Test 1: _buildNativeUrl converts /v1 suffix to /api/v1/chat', () => {
    const instance = makeInstance(false, 'http://localhost:1234/v1');
    expect(instance._buildNativeUrl()).toBe('http://localhost:1234/api/v1/chat');
  });

  // =========================================================================
  // Test 2: _buildNativeUrl is idempotent when base already ends without /v1
  // =========================================================================
  test('Test 2: _buildNativeUrl handles base without /v1 suffix', () => {
    const instance = makeInstance(false, 'http://host:1234/api/v1');
    // /api/v1 does NOT match /v1/? at the end — idempotent, just appends /chat
    expect(instance._buildNativeUrl()).toBe('http://host:1234/api/v1/chat');
  });

  // =========================================================================
  // Test 3: stream() with nativeEventsEnabled=false delegates to super.stream()
  // =========================================================================
  test('Test 3: stream() delegates to super.stream() when nativeEventsEnabled=false', async () => {
    const instance = makeInstance(false);
    // Mock super.stream by spying on the prototype of ChatOpenAI
    const superStreamChunks = [new AIMessageChunk({ content: 'hello' })];
    const mockSuperStream = vi.fn(async function* () {
      for (const c of superStreamChunks) yield c;
    });
    // Directly replace the instance's parent stream method via prototype access
    Object.getPrototypeOf(Object.getPrototypeOf(instance)).stream = mockSuperStream;

    const result = await collectChunks(await instance.stream(testMessages));
    expect(mockSuperStream).toHaveBeenCalledOnce();
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('hello');
  });

  // =========================================================================
  // Test 4: _streamNativeEvents yields AIMessageChunk for message.delta events
  // =========================================================================
  test('Test 4: _streamNativeEvents yields AIMessageChunk for each message.delta event', async () => {
    const instance = makeInstance(true);
    const mockStream = makeSSEStream([
      { type: 'chat.start', data: { type: 'chat.start', model_instance_id: 'test' } },
      { type: 'message.start', data: { type: 'message.start' } },
      { type: 'message.delta', data: { type: 'message.delta', content: 'Hello' } },
      { type: 'message.delta', data: { type: 'message.delta', content: ' world' } },
      { type: 'message.end', data: { type: 'message.end' } },
      { type: 'chat.end', data: { type: 'chat.end', result: { stats: { time_to_first_token_seconds: 0.5, tokens_per_second: 20 } } } },
    ]);

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(mockStream, { status: 200 }),
    );

    const chunks = await collectChunks(instance._streamNativeEvents(testMessages));
    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).toBe('Hello');
    expect(chunks[1].content).toBe(' world');
  });

  // =========================================================================
  // Test 5: _streamNativeEvents skips non-delta events (no yield)
  // =========================================================================
  test('Test 5: _streamNativeEvents skips reasoning.delta, chat.start, message.start, message.end', async () => {
    const instance = makeInstance(true);
    const mockStream = makeSSEStream([
      { type: 'chat.start', data: { type: 'chat.start', model_instance_id: 'test' } },
      { type: 'message.start', data: { type: 'message.start' } },
      { type: 'reasoning.delta', data: { type: 'reasoning.delta', content: 'thinking...' } },
      { type: 'message.end', data: { type: 'message.end' } },
      { type: 'chat.end', data: { type: 'chat.end', result: { stats: {} } } },
    ]);

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(mockStream, { status: 200 }),
    );

    const chunks = await collectChunks(instance._streamNativeEvents(testMessages));
    expect(chunks).toHaveLength(0);
  });

  // =========================================================================
  // Test 6: _streamNativeEvents throws when event type is 'error'
  // =========================================================================
  test('Test 6: _streamNativeEvents throws when error event received', async () => {
    const instance = makeInstance(true);
    const mockStream = makeSSEStream([
      { type: 'chat.start', data: { type: 'chat.start', model_instance_id: 'test' } },
      { type: 'error', data: { type: 'error', error: { type: 'inference_error', message: 'Model overloaded' } } },
    ]);

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(mockStream, { status: 200 }),
    );

    await expect(collectChunks(instance._streamNativeEvents(testMessages))).rejects.toThrow(
      'LM Studio error event: Model overloaded',
    );
  });

  // =========================================================================
  // Test 7: _streamNativeEvents logs TTFT from chat.end stats
  // =========================================================================
  test('Test 7: _streamNativeEvents logs TTFT from chat.end stats', async () => {
    const instance = makeInstance(true);
    const consoleSpy = vi.spyOn(console, 'log');

    const mockStream = makeSSEStream([
      { type: 'message.delta', data: { type: 'message.delta', content: 'hi' } },
      {
        type: 'chat.end',
        data: {
          type: 'chat.end',
          result: {
            stats: {
              time_to_first_token_seconds: 0.123,
              tokens_per_second: 42,
            },
          },
        },
      },
    ]);

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(mockStream, { status: 200 }),
    );

    await collectChunks(instance._streamNativeEvents(testMessages));

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[native-events] TTFT:'),
      0.123,
      expect.stringContaining('s'),
      expect.anything(),
    );
  });

  // =========================================================================
  // Test 8: stream() with nativeEventsEnabled=true catches error and falls back
  // =========================================================================
  test('Test 8: stream() silently falls back to super.stream() when _streamNativeEvents throws (D-02)', async () => {
    const instance = makeInstance(true);
    const fallbackChunks = [new AIMessageChunk({ content: 'fallback response' })];

    // Make _streamNativeEvents throw
    vi.spyOn(instance, '_streamNativeEvents').mockImplementation(async function* () {
      throw new Error('native events failed');
    });

    // Mock super.stream on the prototype chain
    const mockSuperStream = vi.fn(async function* () {
      for (const c of fallbackChunks) yield c;
    });
    Object.getPrototypeOf(Object.getPrototypeOf(instance)).stream = mockSuperStream;

    const consoleSpy = vi.spyOn(console, 'warn');

    const result = await collectChunks(await instance.stream(testMessages));
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ChatOpenAIStreamingEvents] Native events failed'),
      expect.anything(),
    );
    expect(mockSuperStream).toHaveBeenCalledOnce();
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('fallback response');
  });

  // =========================================================================
  // Test 9: SSE buffer management — partial event at chunk boundary
  // =========================================================================
  test('Test 9: SSE buffer management holds partial event and completes on next chunk', async () => {
    const instance = makeInstance(true);

    // Split a single SSE event across two network chunks
    const fullEvent = 'event: message.delta\ndata: {"type":"message.delta","content":"split"}\n\n';
    const splitAt = Math.floor(fullEvent.length / 2);
    const chunk1 = fullEvent.slice(0, splitAt);
    const chunk2 = fullEvent.slice(splitAt);

    const mockStream = makeSplitSSEStream([chunk1, chunk2]);

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(mockStream, { status: 200 }),
    );

    const chunks = await collectChunks(instance._streamNativeEvents(testMessages));
    // The event split across chunks should produce exactly one AIMessageChunk
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('split');
  });
});
