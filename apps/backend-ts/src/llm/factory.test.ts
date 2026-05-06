/**
 * Integration tests for LLM factory.
 * Includes conditional LM Studio integration test (per D-21, D-24).
 */

import { describe, test, expect } from 'vitest';
import { createLLM } from './factory.js';
import type { LLMConfig } from './types.js';
import { LLMConfigError } from './errors.js';
import { loadConfig } from './config.js';

/**
 * Check if LM Studio is running at configured URL.
 * Used for conditional test skipping (per D-24).
 */
async function isLMStudioRunning(baseUrl: string): Promise<boolean> {
  try {
    // Remove /v1 suffix if present and add /models endpoint
    const url = baseUrl.replace(/\/v1\/?$/, '') + '/v1/models';
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

describe('LLM Factory', () => {
  const mockConfig: LLMConfig = {
    LLM_PROVIDER: 'lmstudio',
    LM_STUDIO_URL: 'http://localhost:1234/v1',
    LM_STUDIO_MODEL: '',
    LLM_MODEL: '',
    OPENAI_API_KEY: '',
    ANTHROPIC_API_KEY: '',
    GEMINI_API_KEY: '',
    BACKEND_TS_PORT: 8001,
  };

  describe('Provider Selection', () => {
    test('returns BaseChatModel for lmstudio provider', () => {
      const llm = createLLM('lmstudio', mockConfig);
      expect(llm).toBeDefined();
      expect(llm.invoke).toBeDefined();  // Has invoke method
      expect(typeof llm.invoke).toBe('function');
    });

    test('returns BaseChatModel for openai provider with API key', () => {
      const configWithKey: LLMConfig = {
        ...mockConfig,
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test-key',
      };
      const llm = createLLM('openai', configWithKey);
      expect(llm).toBeDefined();
      expect(llm.invoke).toBeDefined();
    });

    test('returns BaseChatModel for anthropic provider with API key', () => {
      const configWithKey: LLMConfig = {
        ...mockConfig,
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
      };
      const llm = createLLM('anthropic', configWithKey);
      expect(llm).toBeDefined();
      expect(llm.invoke).toBeDefined();
    });

    test('returns BaseChatModel for gemini provider with API key', () => {
      const configWithKey: LLMConfig = {
        ...mockConfig,
        LLM_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'AIzaSy-test-key',
      };
      const llm = createLLM('gemini', configWithKey);
      expect(llm).toBeDefined();
      expect(llm.invoke).toBeDefined();
    });

    test('throws for unknown provider', () => {
      expect(() => createLLM('invalid' as any, mockConfig))
        .toThrow("Unknown provider: 'invalid'. Valid: lmstudio, openai, anthropic, gemini");
    });
  });

  describe('Error Handling', () => {
    test('throws LLMConfigError when OPENAI_API_KEY is missing', () => {
      const configWithoutKey: LLMConfig = {
        ...mockConfig,
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: '',
      };
      expect(() => createLLM('openai', configWithoutKey))
        .toThrow(LLMConfigError);
      expect(() => createLLM('openai', configWithoutKey))
        .toThrow('OPENAI_API_KEY required when LLM_PROVIDER=openai');
    });

    test('throws LLMConfigError when ANTHROPIC_API_KEY is missing', () => {
      const configWithoutKey: LLMConfig = {
        ...mockConfig,
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: '',
      };
      expect(() => createLLM('anthropic', configWithoutKey))
        .toThrow(LLMConfigError);
      expect(() => createLLM('anthropic', configWithoutKey))
        .toThrow('ANTHROPIC_API_KEY required when LLM_PROVIDER=anthropic');
    });

    test('throws LLMConfigError when GEMINI_API_KEY is missing', () => {
      const configWithoutKey: LLMConfig = {
        ...mockConfig,
        LLM_PROVIDER: 'gemini',
        GEMINI_API_KEY: '',
      };
      expect(() => createLLM('gemini', configWithoutKey))
        .toThrow(LLMConfigError);
      expect(() => createLLM('gemini', configWithoutKey))
        .toThrow('GEMINI_API_KEY required when LLM_PROVIDER=gemini');
    });
  });

  describe('LM Studio Integration', () => {
    test('sends message and receives response if LM Studio is running', async () => {
      // Use real config from .env instead of hardcoded localhost
      const realConfig = loadConfig();
      const lmStudioUrl = realConfig.LM_STUDIO_URL;
      const lmStudioRunning = await isLMStudioRunning(lmStudioUrl);

      if (!lmStudioRunning) {
        console.log(`ℹ️  LM Studio not running at ${lmStudioUrl} — integration test skipped`);
        console.log('   Start LM Studio and re-run tests to validate LM Studio integration (per D-22)');
        return;  // Skip test gracefully
      }

      console.log(`Testing with real LM Studio at ${lmStudioUrl}...`);
      const llm = createLLM('lmstudio', realConfig);
      const response = await llm.invoke('Say "Hello from LM Studio"');

      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      expect(typeof response.content).toBe('string');
      expect(response.content.length).toBeGreaterThan(0);
      console.log('Response:', response.content);
    }, 10000);  // 10 second timeout - LM Studio can be slow
  });
});
