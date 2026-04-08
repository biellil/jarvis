import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIMessage, SystemMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';

// Mock createReactAgent para controlar o loop ReAct nos testes sem subir LLM real.
// Cada teste sobrescreve `agentInvokeImpl` pra simular o comportamento desejado.
let agentInvokeImpl: (input: { messages: any[] }) => Promise<{ messages: any[] }> = async (
  input,
) => ({
  messages: [...input.messages, new AIMessage('pong')],
});

const agentInvokeSpy = vi.fn((input: { messages: any[] }) => agentInvokeImpl(input));
const createReactAgentMock = vi.fn((_args: any) => ({ invoke: agentInvokeSpy }));

vi.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: (args: any) => createReactAgentMock(args),
}));

import { ChatSession } from './chat-session.js';
import { SYSTEM_PROMPT } from './system-prompt.js';

function makeLlm() {
  return {
    invoke: vi.fn(),
    stream: vi.fn(),
  } as any;
}

function asyncIterableFrom(chunks: Array<{ content: any }>) {
  return (async function* () {
    for (const c of chunks) yield c;
  })();
}

function makeMemory(convId: number | null = 42) {
  return {
    startConversation: vi.fn().mockResolvedValue(convId),
    saveTurn: vi.fn().mockResolvedValue(undefined),
    buildContext: vi.fn().mockResolvedValue('### User profile\n- gosto: café'),
  } as any;
}

describe('ChatSession (agent runtime)', () => {
  let llm: ReturnType<typeof makeLlm>;
  let memory: ReturnType<typeof makeMemory>;

  beforeEach(() => {
    llm = makeLlm();
    memory = makeMemory();
    agentInvokeSpy.mockClear();
    createReactAgentMock.mockClear();
    // default: agent ecoa "pong" como AIMessage final
    agentInvokeImpl = async (input) => ({
      messages: [...input.messages, new AIMessage('pong')],
    });
  });

  it('chama createReactAgent uma vez com llm, tools e prompt durante create()', async () => {
    await ChatSession.create({ llm, memory });
    expect(createReactAgentMock).toHaveBeenCalledOnce();
    const arg = createReactAgentMock.mock.calls[0]![0] as any;
    expect(arg.llm).toBe(llm);
    expect(Array.isArray(arg.tools)).toBe(true);
    expect(arg.tools).toHaveLength(10);
    expect(arg.tools[0].name).toBe('recall_memory');
    const pcNames = arg.tools.slice(1).map((t: any) => t.name).sort();
    expect(pcNames).toEqual(
      [
        'close_app',
        'delete_file',
        'list_files',
        'list_processes',
        'move_file',
        'open_app',
        'search_files',
        'set_brightness',
        'set_volume',
      ].sort(),
    );
    expect(arg.prompt).toBe(SYSTEM_PROMPT);
  });

  it('chama memory.startConversation() e inicializa history com SystemMessage', async () => {
    const session = await ChatSession.create({ llm, memory });
    expect(memory.startConversation).toHaveBeenCalledOnce();
    expect(session.history).toHaveLength(1);
    expect(session.history[0]).toBeInstanceOf(SystemMessage);
    expect(session.history[0].content).toBe(SYSTEM_PROMPT);
  });

  it('send() invoca o agent, atualiza history com result.messages e retorna o texto final', async () => {
    const session = await ChatSession.create({ llm, memory });
    const reply = await session.send('oi');
    expect(agentInvokeSpy).toHaveBeenCalledOnce();
    expect(reply).toBe('pong');
    // history = [System, Human, AI]
    expect(session.history).toHaveLength(3);
    expect(session.history[1]).toBeInstanceOf(HumanMessage);
    expect(session.history[1].content).toBe('oi');
    expect(session.history[2]).toBeInstanceOf(AIMessage);
    expect(session.history[2].content).toBe('pong');
  });

  it('send() persiste o turn via memory.saveTurn exatamente uma vez', async () => {
    const session = await ChatSession.create({ llm, memory });
    await session.send('oi');
    expect(memory.saveTurn).toHaveBeenCalledOnce();
    expect(memory.saveTurn).toHaveBeenCalledWith(42, 'oi', 'pong');
  });

  it('degrada graciosamente quando startConversation retorna null', async () => {
    const nullMemory = makeMemory(null);
    const session = await ChatSession.create({ llm, memory: nullMemory });
    await expect(session.send('oi')).resolves.toBe('pong');
    expect(nullMemory.saveTurn).not.toHaveBeenCalled();
  });

  it('acumula history através de múltiplos sends', async () => {
    const session = await ChatSession.create({ llm, memory });
    await session.send('primeira');
    await session.send('segunda');
    expect(session.history).toHaveLength(5);
    expect(session.history[1].content).toBe('primeira');
    expect(session.history[3].content).toBe('segunda');
  });

  it('ciclo ReAct: agent emite tool_call para recall_memory, tool roda, agent finaliza', async () => {
    // Simula o runtime do createReactAgent:
    //   - passo 1: LLM responde AIMessage com tool_calls → [recall_memory({query:"café"})]
    //   - passo 2: runtime invoca a tool real (capturada em createReactAgent args) → ToolMessage
    //   - passo 3: LLM responde AIMessage final "você gosta de café"
    agentInvokeImpl = async (input) => {
      const toolCallId = 'call-1';
      const aiWithToolCall = new AIMessage({
        content: '',
        tool_calls: [
          {
            id: toolCallId,
            name: 'recall_memory',
            args: { query: 'café' },
          },
        ],
      });

      // Recupera a tool que foi passada pra createReactAgent e invoca de verdade
      const reactArgs = createReactAgentMock.mock.calls[0]![0] as any;
      const recallTool = reactArgs.tools[0];
      const observation: string = await recallTool.invoke({ query: 'café' });
      const toolMessage = new ToolMessage({
        content: observation,
        tool_call_id: toolCallId,
      });

      const finalAi = new AIMessage('sei, você gosta de café');

      return {
        messages: [...input.messages, aiWithToolCall, toolMessage, finalAi],
      };
    };

    const session = await ChatSession.create({ llm, memory });
    const reply = await session.send('você lembra o que eu gosto?');

    // tool realmente chamou buildContext
    expect(memory.buildContext).toHaveBeenCalledOnce();
    expect(memory.buildContext).toHaveBeenCalledWith('café');

    // resposta final extraída corretamente (ignora a AIMessage intermediária com tool_calls)
    expect(reply).toBe('sei, você gosta de café');

    // history contém a cadeia completa: System, Human, AI(tool_call), Tool, AI(final)
    expect(session.history).toHaveLength(5);
    expect(session.history[2]).toBeInstanceOf(AIMessage);
    expect(session.history[3]).toBeInstanceOf(ToolMessage);
    expect((session.history[3] as ToolMessage).content).toContain('café');
    expect(session.history[4]).toBeInstanceOf(AIMessage);
    expect(session.history[4].content).toBe('sei, você gosta de café');

    // persistiu o turn com o texto final (não o intermediário)
    expect(memory.saveTurn).toHaveBeenCalledWith(42, 'você lembra o que eu gosto?', 'sei, você gosta de café');
  });

  describe('sendStream', () => {
    it('yielda tokens um a um conforme o llm.stream emite', async () => {
      llm.stream.mockReturnValue(
        asyncIterableFrom([{ content: 'oi' }, { content: ' ' }, { content: 'mundo' }]),
      );
      const session = await ChatSession.create({ llm, memory });
      const out: string[] = [];
      for await (const t of session.sendStream('teste')) out.push(t);
      expect(out).toEqual(['oi', ' ', 'mundo']);
    });

    it('após drain, history ganha HumanMessage + AIMessage final e saveTurn é chamado', async () => {
      llm.stream.mockReturnValue(
        asyncIterableFrom([{ content: 'oi' }, { content: ' ' }, { content: 'mundo' }]),
      );
      const session = await ChatSession.create({ llm, memory });
      for await (const _ of session.sendStream('teste')) {
        void _;
      }
      expect(session.history).toHaveLength(3);
      expect(session.history[1]).toBeInstanceOf(HumanMessage);
      expect(session.history[1].content).toBe('teste');
      expect(session.history[2]).toBeInstanceOf(AIMessage);
      expect(session.history[2].content).toBe('oi mundo');
      expect(memory.saveTurn).toHaveBeenCalledOnce();
      expect(memory.saveTurn).toHaveBeenCalledWith(42, 'teste', 'oi mundo');
    });

    it('propaga erro do stream e não chama saveTurn', async () => {
      llm.stream.mockReturnValue(
        (async function* () {
          yield { content: 'oi' };
          throw new Error('boom');
        })(),
      );
      const session = await ChatSession.create({ llm, memory });
      const consume = async () => {
        for await (const _ of session.sendStream('teste')) void _;
      };
      await expect(consume()).rejects.toThrow('boom');
      expect(memory.saveTurn).not.toHaveBeenCalled();
    });

    it('sendStream não invoca o agent', async () => {
      llm.stream.mockReturnValue(asyncIterableFrom([{ content: 'x' }]));
      const session = await ChatSession.create({ llm, memory });
      for await (const _ of session.sendStream('teste')) void _;
      expect(agentInvokeSpy).not.toHaveBeenCalled();
    });

    it('ignora chunks com content vazio', async () => {
      llm.stream.mockReturnValue(
        asyncIterableFrom([{ content: 'a' }, { content: '' }, { content: 'b' }]),
      );
      const session = await ChatSession.create({ llm, memory });
      const out: string[] = [];
      for await (const t of session.sendStream('teste')) out.push(t);
      expect(out).toEqual(['a', 'b']);
      expect(session.history[2].content).toBe('ab');
    });
  });
});
