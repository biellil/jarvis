import { describe, it, expect } from 'vitest';
import { planSchema } from '../types.js';

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

  it.todo('generatePlan invokes withStructuredOutput on BaseChatModel and returns Plan');
  it.todo('generatePlan with editFeedback prepends "Feedback do usuário sobre o plano anterior:" to prompt');
  it.todo('generatePlan throws OutputParserException → caller falls back to synthetic empty-plan');
});
