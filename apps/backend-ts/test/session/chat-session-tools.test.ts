/**
 * Integration tests para ChatSession + PC tools wrapping (Plan 18-03 Task 2).
 *
 * Mocka createReactAgent para simular o runtime ReAct: o agent recebe as tools,
 * o teste recupera a tool alvo do array `tools` passado a createReactAgent,
 * invoca-a manualmente (simulando o loop interno), e verifica:
 *   - ToolLogger.logDispatch registrou a row com outcome='dispatched'.
 *   - setDispatchListener → listener invocado com DispatchEvent.
 *   - clearDispatchListener → listener NÃO é chamado mas row ainda insere.
 *   - recall_memory NÃO dispara logDispatch.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIMessage, ToolMessage } from '@langchain/core/messages';

// Mock createReactAgent igual chat-session.test.ts
let agentInvokeImpl: (input: { messages: any[] }) => Promise<{ messages: any[] }> = async (
  input,
) => ({ messages: [...input.messages, new AIMessage('ok')] });

const agentInvokeSpy = vi.fn((input: { messages: any[] }) => agentInvokeImpl(input));
const createReactAgentMock = vi.fn((_args: any) => ({ invoke: agentInvokeSpy }));

vi.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: (args: any) => createReactAgentMock(args),
}));

import { ChatSession } from '../../src/session/chat-session.js';
import { ToolLogger } from '../../src/memory/store.js';

function makeLlm() {
  return { invoke: vi.fn(), stream: vi.fn() } as any;
}

function makeMemory(convId: number | null = 1) {
  return {
    startConversation: vi.fn().mockResolvedValue(convId),
    saveTurn: vi.fn().mockResolvedValue(undefined),
    buildContext: vi.fn().mockResolvedValue(''),
    runRollingSummarization: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe('ChatSession + PC tools dispatch (18-03)', () => {
  let tmpDir: string;
  let dbPath: string;
  let toolLogger: ToolLogger;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'chat-session-tools-'));
    dbPath = path.join(tmpDir, 'test.db');
    toolLogger = new ToolLogger(dbPath);
    agentInvokeSpy.mockClear();
    createReactAgentMock.mockClear();
  });

  afterEach(() => {
    toolLogger.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('createReactAgent recebe 1 recall + 9 PC tools wrapped', async () => {
    await ChatSession.create({ llm: makeLlm(), memory: makeMemory(), toolLogger });
    const args = createReactAgentMock.mock.calls[0]![0] as any;
    expect(args.tools).toHaveLength(10);
    expect(args.tools[0].name).toBe('recall_memory');
  });

  it('ao agent chamar open_app, logDispatch insere row e listener recebe evento', async () => {
    const listener = vi.fn();

    // Simula runtime ReAct: chama open_app (wrapped) e devolve ToolMessage + AI final
    agentInvokeImpl = async (input) => {
      const args = createReactAgentMock.mock.calls[0]![0] as any;
      const openApp = args.tools.find((t: any) => t.name === 'open_app');
      const observation = await openApp.invoke({ app_name: 'firefox' });
      return {
        messages: [
          ...input.messages,
          new AIMessage({
            content: '',
            tool_calls: [{ id: 'c1', name: 'open_app', args: { app_name: 'firefox' } }],
          }),
          new ToolMessage({ content: observation as string, tool_call_id: 'c1' }),
          new AIMessage('abri o firefox'),
        ],
      };
    };

    const session = await ChatSession.create({ llm: makeLlm(), memory: makeMemory(), toolLogger });
    session.setDispatchListener(listener);

    const reply = await session.send('abre o firefox');
    expect(reply).toBe('abri o firefox');

    // Listener chamado
    expect(listener).toHaveBeenCalledOnce();
    const ev = listener.mock.calls[0]![0] as any;
    expect(ev.action).toBe('open_app');
    expect(ev.args).toEqual({ app: 'firefox' });
    expect(ev.requiresConfirmation).toBe(false);
    expect(typeof ev.toolCallId).toBe('number');

    // Row gravada no DB via logDispatch
    const raw = (toolLogger as any).db;
    const rows = raw.$client
      .prepare(
        "SELECT id, tool_name, outcome, params_json FROM tool_calls WHERE tool_name='open_app'",
      )
      .all() as Array<{ id: number; tool_name: string; outcome: string; params_json: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.outcome).toBe('dispatched');
    expect(JSON.parse(rows[0]!.params_json)).toEqual({ app: 'firefox' });
    expect(ev.toolCallId).toBe(rows[0]!.id);
  });

  it('clearDispatchListener: row ainda é inserida mas listener não é chamado', async () => {
    const listener = vi.fn();

    agentInvokeImpl = async (input) => {
      const args = createReactAgentMock.mock.calls[0]![0] as any;
      const openApp = args.tools.find((t: any) => t.name === 'open_app');
      await openApp.invoke({ app_name: 'vlc' });
      return { messages: [...input.messages, new AIMessage('done')] };
    };

    const session = await ChatSession.create({ llm: makeLlm(), memory: makeMemory(), toolLogger });
    session.setDispatchListener(listener);
    session.clearDispatchListener();

    await session.send('abre vlc');

    expect(listener).not.toHaveBeenCalled();

    const raw = (toolLogger as any).db;
    const rows = raw.$client
      .prepare("SELECT id FROM tool_calls WHERE tool_name='open_app'")
      .all();
    expect(rows).toHaveLength(1);
  });

  it('recall_memory NÃO dispara logDispatch (não é PC tool wrapped)', async () => {
    const listener = vi.fn();
    const memory = makeMemory();

    agentInvokeImpl = async (input) => {
      const args = createReactAgentMock.mock.calls[0]![0] as any;
      const recall = args.tools[0]; // recall_memory é sempre o primeiro
      expect(recall.name).toBe('recall_memory');
      await recall.invoke({ query: 'café' });
      return { messages: [...input.messages, new AIMessage('ok')] };
    };

    const session = await ChatSession.create({ llm: makeLlm(), memory, toolLogger });
    session.setDispatchListener(listener);
    await session.send('o que eu gosto?');

    expect(listener).not.toHaveBeenCalled();

    const raw = (toolLogger as any).db;
    const rows = raw.$client.prepare('SELECT id FROM tool_calls').all();
    expect(rows).toHaveLength(0);
  });
});
