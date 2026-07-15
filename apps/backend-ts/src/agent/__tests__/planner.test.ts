import { describe, it, expect } from 'vitest';
import { planSchema } from '../types.js';
import { generatePlan, PLANNER_SYSTEM_PROMPT } from '../planner.js';
import { createMockChatModel } from './fixtures/mockChatModel.js';

const validPlan = {
  steps: [
    { id: 1, description: 'Listar arquivos em Downloads', expectedOutcome: '14 arquivos listados' },
    { id: 2, description: 'Filtrar por extensão PDF', expectedOutcome: '5 PDFs filtrados' },
    { id: 3, description: 'Mover PDFs para pasta Documentos', expectedOutcome: '5 PDFs movidos' },
  ],
};

describe('planSchema (Zod)', () => {
  it('accepts a valid plan with 1 step', () => {
    const result = planSchema.safeParse({
      steps: [{ id: 1, description: 'Listar arquivos', expectedOutcome: '14 arquivos listados' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects 0 steps', () => {
    const result = planSchema.safeParse({ steps: [] });
    expect(result.success).toBe(false);
  });

  it('rejects 16 steps (hard cap = 15 per D-05)', () => {
    const tooMany = Array.from({ length: 16 }, (_, i) => ({
      id: i + 1,
      description: 'Passo',
      expectedOutcome: 'Resultado',
    }));
    const result = planSchema.safeParse({ steps: tooMany });
    expect(result.success).toBe(false);
  });
});

describe('generatePlan', () => {
  it('invokes withStructuredOutput on BaseChatModel and returns a typed Plan', async () => {
    const llm = createMockChatModel({ planResponse: validPlan });
    const result = await generatePlan(llm, 'organize Downloads');
    expect(result.steps.length).toBeGreaterThanOrEqual(1);
    expect(result.steps[0]).toMatchObject({
      id: expect.any(Number),
      description: expect.any(String),
      expectedOutcome: expect.any(String),
    });
  });

  it('with editFeedback prepends "Feedback do usuário sobre o plano anterior:" to prompt', async () => {
    const capturedPrompts: string[] = [];
    const llm = createMockChatModel({ planResponse: validPlan, capturedPrompts });
    await generatePlan(llm, 'organize Downloads', { editFeedback: 'tira o passo 3' });
    // The captured content should contain the edit feedback phrase
    const allContent = capturedPrompts.join('\n');
    expect(allContent).toContain('Feedback do usuário sobre o plano anterior: tira o passo 3');
  });

  it('throws when withStructuredOutput throws (propagates error — caller handles fallback)', async () => {
    const llm = createMockChatModel({ failNext: true });
    await expect(generatePlan(llm, 'organize Downloads')).rejects.toThrow(
      'Mock LLM forced failure',
    );
  });

  it('plan returned has all required fields per planSchema (id positive int, description+expectedOutcome 3-200 chars)', async () => {
    const llm = createMockChatModel({ planResponse: validPlan });
    const result = await generatePlan(llm, 'organize Downloads');
    const parsed = planSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      for (const step of parsed.data.steps) {
        expect(step.id).toBeGreaterThan(0);
        expect(Number.isInteger(step.id)).toBe(true);
        expect(step.description.length).toBeGreaterThanOrEqual(3);
        expect(step.description.length).toBeLessThanOrEqual(200);
        expect(step.expectedOutcome.length).toBeGreaterThanOrEqual(3);
        expect(step.expectedOutcome.length).toBeLessThanOrEqual(200);
      }
    }
  });

  it('PLANNER_SYSTEM_PROMPT is exported as a non-empty string constant', () => {
    expect(typeof PLANNER_SYSTEM_PROMPT).toBe('string');
    expect(PLANNER_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });
});

describe('generatePlan — provider-aware structured output method (Quick 260715-07o)', () => {
  it('provider "lmstudio" força withStructuredOutput a usar { method: "jsonSchema" }', async () => {
    const capturedStructuredOutputConfigs: unknown[] = [];
    const llm = createMockChatModel({ planResponse: validPlan, capturedStructuredOutputConfigs });
    await generatePlan(llm, 'organize Downloads', { provider: 'lmstudio' });
    expect(capturedStructuredOutputConfigs[0]).toEqual({ method: 'jsonSchema' });
  });

  it('provider "openai" preserva o default — withStructuredOutput sem segundo argumento', async () => {
    const capturedStructuredOutputConfigs: unknown[] = [];
    const llm = createMockChatModel({ planResponse: validPlan, capturedStructuredOutputConfigs });
    await generatePlan(llm, 'organize Downloads', { provider: 'openai' });
    expect(capturedStructuredOutputConfigs[0]).toBeUndefined();
  });

  it('provider omitido preserva o default — withStructuredOutput sem segundo argumento', async () => {
    const capturedStructuredOutputConfigs: unknown[] = [];
    const llm = createMockChatModel({ planResponse: validPlan, capturedStructuredOutputConfigs });
    await generatePlan(llm, 'organize Downloads');
    expect(capturedStructuredOutputConfigs[0]).toBeUndefined();
  });
});
