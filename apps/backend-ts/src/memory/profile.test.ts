import { describe, it, expect } from 'vitest';
import { AIMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  isExplicitProfileCommand,
  extractProfileFacts,
  EXPLICIT_TRIGGERS,
} from './profile.js';

/** Minimal fake chat model — only `invoke` is exercised. */
function fakeLlm(responder: (input: unknown) => unknown): BaseChatModel {
  return {
    invoke: async (messages: unknown) => {
      const content = responder(messages);
      if (content instanceof Error) throw content;
      return new AIMessage({ content: content as string });
    },
  } as unknown as BaseChatModel;
}

describe('isExplicitProfileCommand', () => {
  it('detects pt-BR triggers', () => {
    expect(isExplicitProfileCommand('lembra que eu gosto de café')).toBe(true);
    expect(isExplicitProfileCommand('Eu prefiro dark mode')).toBe(true);
    expect(isExplicitProfileCommand('meu nome é Alice')).toBe(true);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(isExplicitProfileCommand('  Eu PREFIRO dark mode  ')).toBe(true);
    expect(isExplicitProfileCommand('\tLEMBRA QUE eu odeio spam\n')).toBe(true);
  });

  it('detects english triggers', () => {
    expect(isExplicitProfileCommand('remember that I like tea')).toBe(true);
    expect(isExplicitProfileCommand('I prefer vim over emacs')).toBe(true);
  });

  it('returns false for non-triggering text', () => {
    expect(isExplicitProfileCommand('oi tudo bem')).toBe(false);
    expect(isExplicitProfileCommand('what is the weather')).toBe(false);
    expect(isExplicitProfileCommand('')).toBe(false);
  });

  it('exposes the 16-trigger list matching Python', () => {
    expect(EXPLICIT_TRIGGERS).toHaveLength(16);
  });
});

describe('extractProfileFacts', () => {
  it('parses plain JSON object into string/string dict', async () => {
    const llm = fakeLlm(() => '{"linguagem_trabalho": "Python e Go"}');
    const out = await extractProfileFacts(llm, 'Eu trabalho com Python e Go');
    expect(out).toEqual({ linguagem_trabalho: 'Python e Go' });
  });

  it('strips ```json fences before parsing', async () => {
    const llm = fakeLlm(() => '```json\n{"preferencia_tema": "dark mode"}\n```');
    const out = await extractProfileFacts(llm, 'Prefiro dark mode em tudo');
    expect(out).toEqual({ preferencia_tema: 'dark mode' });
  });

  it('strips bare ``` fences', async () => {
    const llm = fakeLlm(() => '```\n{"hobby": "xadrez"}\n```');
    const out = await extractProfileFacts(llm, 'jogo xadrez nos fins de semana');
    expect(out).toEqual({ hobby: 'xadrez' });
  });

  it('coerces non-string values to strings', async () => {
    const llm = fakeLlm(() => '{"idade": 30, "ativo": true}');
    const out = await extractProfileFacts(llm, 'tenho 30 anos');
    expect(out).toEqual({ idade: '30', ativo: 'true' });
  });

  it('returns {} when LLM throws', async () => {
    const llm = fakeLlm(() => new Error('network down'));
    const out = await extractProfileFacts(llm, 'whatever');
    expect(out).toEqual({});
  });

  it('returns {} on non-JSON garbage', async () => {
    const llm = fakeLlm(() => 'lorem ipsum dolor not json at all');
    const out = await extractProfileFacts(llm, 'whatever');
    expect(out).toEqual({});
  });

  it('returns {} when LLM returns an empty object', async () => {
    const llm = fakeLlm(() => '{}');
    const out = await extractProfileFacts(llm, 'bom dia');
    expect(out).toEqual({});
  });

  it('returns {} when parsed value is an array', async () => {
    const llm = fakeLlm(() => '[1, 2, 3]');
    const out = await extractProfileFacts(llm, 'whatever');
    expect(out).toEqual({});
  });

  it('handles array-form content (multimodal response)', async () => {
    const llm = fakeLlm(() => [{ type: 'text', text: '{"nome": "Alice"}' }]);
    // AIMessage supports array content — but our fakeLlm wraps in AIMessage which accepts it.
    const out = await extractProfileFacts(llm, 'meu nome é Alice');
    expect(out).toEqual({ nome: 'Alice' });
  });
});
