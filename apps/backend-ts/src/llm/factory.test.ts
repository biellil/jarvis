/**
 * Integration tests for LLM factory.
 * Includes conditional LM Studio integration test (per D-21, D-24).
 */

import { describe, test, expect } from 'vitest';
import { ChatOpenAIStreamingEvents } from './streaming-events.js';
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
    OPENROUTER_API_KEY: '',
    OPENROUTER_MODEL: '',
    BACKEND_TS_PORT: 8001,
    USE_LM_STUDIO_STREAMING_EVENTS: false,
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
        .toThrow("Unknown provider: 'invalid'. Valid: lmstudio, openai, anthropic, gemini, openrouter");
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

  describe('Streaming Events flag (LLM-PROV-02)', () => {
    test('Test A: returns ChatOpenAIStreamingEvents when USE_LM_STUDIO_STREAMING_EVENTS=true', () => {
      const llm = createLLM('lmstudio', { ...mockConfig, USE_LM_STUDIO_STREAMING_EVENTS: true });
      expect(llm).toBeInstanceOf(ChatOpenAIStreamingEvents);
    });

    test('Test B: returns plain ChatOpenAI (not subclass) when USE_LM_STUDIO_STREAMING_EVENTS=false', () => {
      const llm = createLLM('lmstudio', { ...mockConfig, USE_LM_STUDIO_STREAMING_EVENTS: false });
      expect(llm).not.toBeInstanceOf(ChatOpenAIStreamingEvents);
    });

    test('Test C: returns plain ChatOpenAI when USE_LM_STUDIO_STREAMING_EVENTS missing (default false)', () => {
      const cfgWithoutFlag = { ...mockConfig } as any;
      delete cfgWithoutFlag.USE_LM_STUDIO_STREAMING_EVENTS;
      const llm = createLLM('lmstudio', cfgWithoutFlag);
      expect(llm).not.toBeInstanceOf(ChatOpenAIStreamingEvents);
    });

    test('Test D: returns plain ChatOpenAI for openai provider even if flag is set', () => {
      const llm = createLLM('openai', {
        ...mockConfig,
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test',
        USE_LM_STUDIO_STREAMING_EVENTS: true,
      });
      expect(llm).not.toBeInstanceOf(ChatOpenAIStreamingEvents);
    });
  });

  describe('OpenRouter provider (OPENR-02, OPENR-03, OPENR-04)', () => {
    const openrouterConfig: LLMConfig = {
      ...mockConfig,
      LLM_PROVIDER: 'openrouter',
      OPENROUTER_MODEL: 'meta-llama/llama-3.1-8b-instruct:free',
      OPENROUTER_API_KEY: '',
    };

    test('returns BaseChatModel for openrouter provider (OPENR-02)', () => {
      const llm = createLLM('openrouter', openrouterConfig);
      expect(llm).toBeDefined();
      expect(typeof llm.invoke).toBe('function');
    });

    test('succeeds without OPENROUTER_API_KEY — free-tier support (OPENR-03)', () => {
      const configNoKey: LLMConfig = {
        ...openrouterConfig,
        OPENROUTER_API_KEY: '',
      };
      expect(() => createLLM('openrouter', configNoKey)).not.toThrow();
    });

    test('succeeds with OPENROUTER_API_KEY set — paid-tier support (OPENR-03)', () => {
      const configWithKey: LLMConfig = {
        ...openrouterConfig,
        OPENROUTER_API_KEY: 'sk-or-test-key',
      };
      expect(() => createLLM('openrouter', configWithKey)).not.toThrow();
    });

    test('throws LLMConfigError when OPENROUTER_MODEL is empty (D-04)', () => {
      const configNoModel: LLMConfig = {
        ...openrouterConfig,
        OPENROUTER_MODEL: '',
        LLM_MODEL: '',
      };
      expect(() => createLLM('openrouter', configNoModel))
        .toThrow(LLMConfigError);
      expect(() => createLLM('openrouter', configNoModel))
        .toThrow('OPENROUTER_MODEL');
    });

    test('accepts free-tier model name with :free suffix (OPENR-04)', () => {
      const configFree: LLMConfig = {
        ...openrouterConfig,
        OPENROUTER_MODEL: 'meta-llama/llama-3.1-8b-instruct:free',
      };
      const llm = createLLM('openrouter', configFree);
      expect(llm).toBeDefined();
    });

    test('accepts paid model name without :free suffix (OPENR-04)', () => {
      const configPaid: LLMConfig = {
        ...openrouterConfig,
        OPENROUTER_MODEL: 'anthropic/claude-3.5-sonnet',
        OPENROUTER_API_KEY: 'sk-or-test-key',
      };
      const llm = createLLM('openrouter', configPaid);
      expect(llm).toBeDefined();
    });

    test('falls back to LLM_MODEL when OPENROUTER_MODEL is unset', () => {
      const configFallback: LLMConfig = {
        ...openrouterConfig,
        OPENROUTER_MODEL: '',
        LLM_MODEL: 'meta-llama/llama-3.1-8b-instruct:free',
      };
      expect(() => createLLM('openrouter', configFallback)).not.toThrow();
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
