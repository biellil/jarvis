/**
 * Type-level validation for LLMProvider union and LLMConfig interface (Phase 57).
 * These tests confirm 'gemini' is present — compilation failure = test failure.
 */
import { describe, test, expect } from 'vitest';
import type { LLMProvider, LLMConfig } from './types.js';

describe('LLMProvider type', () => {
  test('includes gemini in the union', () => {
    const provider: LLMProvider = 'gemini';
    expect(provider).toBe('gemini');
  });

  test('includes all four providers', () => {
    const providers: LLMProvider[] = ['lmstudio', 'openai', 'anthropic', 'gemini'];
    expect(providers).toHaveLength(4);
  });
});

describe('LLMConfig interface', () => {
  test('accepts GEMINI_API_KEY as optional field', () => {
    const config: LLMConfig = {
      LLM_PROVIDER: 'gemini',
      LM_STUDIO_URL: 'http://localhost:1234/v1',
      LM_STUDIO_MODEL: '',
      LLM_MODEL: '',
      OPENAI_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      GEMINI_API_KEY: 'AIzaSy-test',
      BACKEND_TS_PORT: 8001,
    };
    expect(config.GEMINI_API_KEY).toBe('AIzaSy-test');
  });

  test('GEMINI_API_KEY is optional (undefined acceptable)', () => {
    const config: LLMConfig = {
      LLM_PROVIDER: 'lmstudio',
      LM_STUDIO_URL: 'http://localhost:1234/v1',
      LM_STUDIO_MODEL: '',
      LLM_MODEL: '',
      OPENAI_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      BACKEND_TS_PORT: 8001,
    };
    expect(config.GEMINI_API_KEY).toBeUndefined();
  });
});
