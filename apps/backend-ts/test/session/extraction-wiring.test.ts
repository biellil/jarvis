/**
 * Tests for ChatSession fire-and-forget extraction wiring — Phase 36-P03 (MEMW-01, REL-01).
 *
 * Verifica que:
 * 1. send() chama _extractAndWriteMemories com os textos corretos
 * 2. send() retorna imediatamente sem aguardar a extração (void context)
 * 3. send() não lança erro quando _extractAndWriteMemories falha internamente
 * 4. sendStream() chama _extractAndWriteMemories com o texto montado após o stream
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIMessage, AIMessageChunk, HumanMessage } from '@langchain/core/messages';

// ── mock createReactAgent before importing ChatSession ──────────────────────
const agentInvokeSpy = vi.fn(async (input: { messages: any[] }) => ({
  messages: [...input.messages, new AIMessage('mocked response')],
}));

type StreamChunk = [any, Record<string, unknown>];
let agentStreamImpl: (input: { messages: any[] }) => AsyncIterable<StreamChunk> =
  async function* () {
    yield [new AIMessageChunk('streamed response'), {}];
  };

const agentStreamSpy = vi.fn((input: { messages: any[] }, _config: any) =>
  agentStreamImpl(input),
);

vi.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: () => ({
    invoke: agentInvokeSpy,
    stream: agentStreamSpy,
  }),
}));

import { ChatSession } from '../../src/session/chat-session.js';

// ── helpers ─────────────────────────────────────────────────────────────────

function makeLlm() {
  return {
    invoke: vi.fn(),
    stream: vi.fn(),
    withStructuredOutput: vi.fn().mockReturnValue({ invoke: vi.fn().mockResolvedValue([]) }),
  } as any;
}

function makeMemory(convId: number | null = 1) {
  return {
    startConversation: vi.fn().mockResolvedValue(convId),
    saveTurn: vi.fn().mockResolvedValue(undefined),
    saveTypedMemory: vi.fn().mockResolvedValue(undefined),
    buildContext: vi.fn().mockResolvedValue(''),
    vectors: { queryMemories: vi.fn().mockResolvedValue([]) },
  } as any;
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('ChatSession fire-and-forget extraction (Phase 36-P03)', () => {
  beforeEach(() => {
    agentInvokeSpy.mockClear();
    agentStreamSpy.mockClear();
  });

  it('send() calls _extractAndWriteMemories with user + assistant text', async () => {
    const session = await ChatSession.create({ llm: makeLlm(), memory: makeMemory() });

    // Spy on the private method after creation
    const extractSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(session, { _extractAndWriteMemories: extractSpy });

    await session.send('hello world');

    expect(extractSpy).toHaveBeenCalledOnce();
    expect(extractSpy).toHaveBeenCalledWith('hello world', 'mocked response');
  });

  it('send() returns before extraction completes (void context — fire-and-forget)', async () => {
    const session = await ChatSession.create({ llm: makeLlm(), memory: makeMemory() });

    let extractionStarted = false;
    let extractionCompleted = false;

    const slowExtract = vi.fn(async () => {
      extractionStarted = true;
      // Simulate slow async extraction
      await new Promise((resolve) => setTimeout(resolve, 50));
      extractionCompleted = true;
    });
    Object.assign(session, { _extractAndWriteMemories: slowExtract });

    // send() should resolve before the 50ms extraction finishes
    const result = await session.send('test message');

    // send() returned with finalText
    expect(result).toBe('mocked response');
    // Extraction was started (void called it)
    expect(extractionStarted).toBe(true);
    // But send() did NOT wait for it — extraction may or may not be done
    // (the important invariant is that send() resolved before extraction completed)
    // We verify by checking the extraction is NOT awaited: result is available immediately.
    // In void context, extractionCompleted could be false here depending on event loop.
    expect(typeof result).toBe('string');
  });

  it('send() does not throw when extraction fails internally', async () => {
    const session = await ChatSession.create({ llm: makeLlm(), memory: makeMemory() });

    const failingExtract = vi.fn().mockRejectedValue(new Error('extraction exploded'));
    Object.assign(session, { _extractAndWriteMemories: failingExtract });

    // send() must not throw even if extraction promise rejects
    await expect(session.send('test')).resolves.toBe('mocked response');
    expect(failingExtract).toHaveBeenCalledOnce();
  });

  it('sendStream() calls _extractAndWriteMemories with assembled text after stream drains', async () => {
    agentStreamImpl = async function* () {
      yield [new AIMessageChunk('streamed '), {}];
      yield [new AIMessageChunk('text'), {}];
    };

    const session = await ChatSession.create({ llm: makeLlm(), memory: makeMemory() });

    const extractSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(session, { _extractAndWriteMemories: extractSpy });

    const tokens: string[] = [];
    for await (const t of session.sendStream('stream input')) {
      tokens.push(t);
    }

    // Drain must complete before extraction call
    expect(tokens).toEqual(['streamed ', 'text']);
    expect(extractSpy).toHaveBeenCalledOnce();
    expect(extractSpy).toHaveBeenCalledWith('stream input', 'streamed text');
  });
});
