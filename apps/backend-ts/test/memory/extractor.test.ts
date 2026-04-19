/**
 * Tests for MemoryExtractor — Phase 36-P01 (MEMW-01, MEMW-02, MEMW-03, MTYPE-01..04)
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { MemoryExtractor, extractionSchema, type Extraction } from '../../src/memory/extractor.js';

function makeMockLlm(returnValue: unknown) {
  const runnable = { invoke: vi.fn().mockResolvedValue(returnValue) };
  return {
    withStructuredOutput: vi.fn().mockReturnValue(runnable),
  } as unknown as import('@langchain/core/language_models/chat_models').BaseChatModel;
}

describe('MemoryExtractor', () => {
  it('can be instantiated', () => {
    const mockLlm = makeMockLlm([]);
    expect(() => new MemoryExtractor(mockLlm)).not.toThrow();
  });

  it('returns [] when LLM returns empty array', async () => {
    const mockLlm = makeMockLlm([]);
    const extractor = new MemoryExtractor(mockLlm);
    const result = await extractor.extractMemories('hello', 'hi there');
    expect(result).toEqual([]);
  });

  it('returns semantic extraction', async () => {
    const mockLlm = makeMockLlm([{ type: 'semantic', content: 'User prefers dark mode', confidence: 0.9 }]);
    const extractor = new MemoryExtractor(mockLlm);
    const result = await extractor.extractMemories('I love dark mode', 'Got it, noted!');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('semantic');
  });

  it('returns episodic extraction', async () => {
    const mockLlm = makeMockLlm([{ type: 'episodic', content: 'Discussed login bug', confidence: 0.7 }]);
    const extractor = new MemoryExtractor(mockLlm);
    const result = await extractor.extractMemories('We have a bug in login', 'I will help you fix it.');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('episodic');
  });

  it('returns procedural extraction', async () => {
    const mockLlm = makeMockLlm([{ type: 'procedural', content: 'To reset WiFi: Settings → Network', confidence: 0.8 }]);
    const extractor = new MemoryExtractor(mockLlm);
    const result = await extractor.extractMemories('How do I reset WiFi?', 'Go to Settings → Network');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('procedural');
  });

  it('returns [] and does not throw on LLM error', async () => {
    const runnable = { invoke: vi.fn().mockRejectedValue(new Error('LLM unavailable')) };
    const mockLlm = {
      withStructuredOutput: vi.fn().mockReturnValue(runnable),
    } as unknown as import('@langchain/core/language_models/chat_models').BaseChatModel;
    const extractor = new MemoryExtractor(mockLlm);
    let result: Extraction[] | undefined;
    await expect(async () => {
      result = await extractor.extractMemories('test', 'test');
    }).not.toThrow();
    expect(result).toEqual([]);
  });
});

describe('extractionSchema', () => {
  it('validates a valid semantic extraction', () => {
    const result = extractionSchema.safeParse({
      type: 'semantic',
      content: 'x'.repeat(10),
      confidence: 0.8,
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown type discriminator', () => {
    const result = extractionSchema.safeParse({
      type: 'unknown',
      content: 'foo bar baz',
      confidence: 0.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects content shorter than 10 characters', () => {
    const result = extractionSchema.safeParse({
      type: 'semantic',
      content: 'short',
      confidence: 0.8,
    });
    expect(result.success).toBe(false);
  });

  it('rejects confidence greater than 1', () => {
    const result = extractionSchema.safeParse({
      type: 'semantic',
      content: 'valid content here',
      confidence: 1.5,
    });
    expect(result.success).toBe(false);
  });
});
