import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';

import { ChatSession } from './chat-session.js';
import { SYSTEM_PROMPT } from './system-prompt.js';

function makeLlm(response = 'pong') {
  return {
    invoke: vi.fn().mockResolvedValue(new AIMessage(response)),
  } as any;
}

function makeMemory(convId: number | null = 42) {
  return {
    startConversation: vi.fn().mockResolvedValue(convId),
    saveTurn: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe('ChatSession', () => {
  let llm: ReturnType<typeof makeLlm>;
  let memory: ReturnType<typeof makeMemory>;

  beforeEach(() => {
    llm = makeLlm();
    memory = makeMemory();
  });

  it('calls memory.startConversation() and stores convId', async () => {
    const session = await ChatSession.create({ llm, memory });
    expect(memory.startConversation).toHaveBeenCalledOnce();
    expect(session).toBeDefined();
  });

  it('initializes history with a single SystemMessage containing SYSTEM_PROMPT', async () => {
    const session = await ChatSession.create({ llm, memory });
    expect(session.history).toHaveLength(1);
    expect(session.history[0]).toBeInstanceOf(SystemMessage);
    expect(session.history[0].content).toBe(SYSTEM_PROMPT);
  });

  it('send() returns the LLM response string and grows history to length 3', async () => {
    const session = await ChatSession.create({ llm, memory });
    const reply = await session.send('oi');
    expect(reply).toBe('pong');
    expect(session.history).toHaveLength(3);
    expect(session.history[1]).toBeInstanceOf(HumanMessage);
    expect(session.history[1].content).toBe('oi');
    expect(session.history[2]).toBeInstanceOf(AIMessage);
    expect(session.history[2].content).toBe('pong');
  });

  it('send() persists the turn via memory.saveTurn exactly once', async () => {
    const session = await ChatSession.create({ llm, memory });
    await session.send('oi');
    expect(memory.saveTurn).toHaveBeenCalledOnce();
    expect(memory.saveTurn).toHaveBeenCalledWith(42, 'oi', 'pong');
  });

  it('degrades gracefully when startConversation returns null (no saveTurn)', async () => {
    const nullMemory = makeMemory(null);
    const session = await ChatSession.create({ llm, memory: nullMemory });
    await expect(session.send('oi')).resolves.toBe('pong');
    expect(nullMemory.saveTurn).not.toHaveBeenCalled();
  });

  it('accumulates history across multiple send() calls', async () => {
    const session = await ChatSession.create({ llm, memory });
    await session.send('primeira');
    await session.send('segunda');
    expect(session.history).toHaveLength(5);
    expect(session.history[1].content).toBe('primeira');
    expect(session.history[3].content).toBe('segunda');
  });
});
