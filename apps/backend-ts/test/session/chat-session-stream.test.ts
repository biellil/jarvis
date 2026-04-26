/**
 * Tests for ChatSession.sendStream via agent.stream (Plan 18-04 Task 1).
 *
 * sendStream agora usa `agent.stream({messages}, {streamMode: 'messages'})` em vez de
 * `llm.stream()` direto. Isso permite que tools sejam invocadas durante o streaming
 * e que o listener de dispatch seja acionado mid-stream.
 *
 * Mocka createReactAgent. O mock expõe `.stream(input, config)` como async iterable
 * de tuplas `[message, metadata]` — streamMode 'messages' do LangGraph. Filtramos
 * AIMessageChunks não-vazios para yield tokens.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIMessageChunk, HumanMessage, AIMessage } from '@langchain/core/messages';

type StreamChunk = [any, Record<string, unknown>];
let agentStreamImpl: (input: { messages: any[] }) => AsyncIterable<StreamChunk> =
  async function* () {
    yield [new AIMessageChunk('ok'), {}];
  };

const agentStreamSpy = vi.fn((input: { messages: any[] }, _config: any) =>
  agentStreamImpl(input),
);
const agentInvokeSpy = vi.fn(async (input: { messages: any[] }) => ({
  messages: [...input.messages, new AIMessage('ok')],
}));
const createReactAgentMock = vi.fn(() => ({
  invoke: agentInvokeSpy,
  stream: agentStreamSpy,
}));

vi.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: (args: any) => createReactAgentMock(),
}));

import { ChatSession } from '../../src/session/chat-session.js';

function makeLlm() {
  return { invoke: vi.fn(), stream: vi.fn() } as any;
}
function makeMemory(convId: number | null = 1) {
  return {
    startConversation: vi.fn().mockResolvedValue(convId),
    getOrCreateConversation: vi.fn().mockResolvedValue(convId),
    getRecentMessages: vi.fn().mockReturnValue([]),
    saveTurn: vi.fn().mockResolvedValue(undefined),
    buildContext: vi.fn().mockResolvedValue(''),
    runRollingSummarization: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe('ChatSession.sendStream via agent.stream (18-04)', () => {
  beforeEach(() => {
    agentStreamSpy.mockClear();
    agentInvokeSpy.mockClear();
    createReactAgentMock.mockClear();
  });

  it('yields tokens dos AIMessageChunks emitidos pelo agent.stream', async () => {
    agentStreamImpl = async function* () {
      yield [new AIMessageChunk('Oi '), {}];
      yield [new AIMessageChunk('tudo '), {}];
      yield [new AIMessageChunk('bem?'), {}];
    };

    const memory = makeMemory();
    const session = await ChatSession.create({ llm: makeLlm(), memory });

    const tokens: string[] = [];
    for await (const t of session.sendStream('oi')) tokens.push(t);

    expect(tokens).toEqual(['Oi ', 'tudo ', 'bem?']);
    // agent.stream chamado com streamMode: 'messages'
    expect(agentStreamSpy).toHaveBeenCalledOnce();
    const config = agentStreamSpy.mock.calls[0]![1] as any;
    expect(config).toMatchObject({ streamMode: 'messages' });
    // memory.saveTurn com texto montado
    expect(memory.saveTurn).toHaveBeenCalledWith(1, 'oi', 'Oi tudo bem?');
  });

  it('history pós-stream contém HumanMessage + AIMessage final', async () => {
    agentStreamImpl = async function* () {
      yield [new AIMessageChunk('resposta'), {}];
    };
    const session = await ChatSession.create({ llm: makeLlm(), memory: makeMemory() });
    const tokens: string[] = [];
    for await (const t of session.sendStream('hello')) tokens.push(t);

    expect(tokens).toEqual(['resposta']);
    const human = session.history.find((m) => m instanceof HumanMessage) as HumanMessage;
    expect(human?.content).toBe('hello');
    const lastAi = [...session.history].reverse().find((m) => m instanceof AIMessage) as AIMessage;
    expect(String(lastAi?.content)).toBe('resposta');
  });

  it('ignora chunks vazios e não-AIMessageChunk', async () => {
    agentStreamImpl = async function* () {
      yield [new AIMessageChunk(''), {}];
      yield [new AIMessageChunk('A'), {}];
      // simula um ToolMessage-like que não deve virar token
      yield [{ content: 'nope', constructor: { name: 'ToolMessage' } } as any, {}];
      yield [new AIMessageChunk('B'), {}];
    };
    const session = await ChatSession.create({ llm: makeLlm(), memory: makeMemory() });
    const tokens: string[] = [];
    for await (const t of session.sendStream('x')) tokens.push(t);
    expect(tokens).toEqual(['A', 'B']);
  });
});
