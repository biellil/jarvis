/**
 * Tests for LLM config validation.
 * Ensures Zod schema validates correctly and loadConfig() exits on errors.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadConfig, envSchema } from './config.js';

describe('LLM Config', () => {
  // Store original process.env
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear all mocks and reset process.env
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original process.env
    process.env = originalEnv;
  });

  describe('envSchema validation', () => {
    test('accepts valid config with all fields', () => {
      const validEnv = {
        LLM_PROVIDER: 'lmstudio',
        LLM_MODEL: 'mistral-7b',
        LM_STUDIO_URL: 'http://localhost:1234/v1',
        LM_STUDIO_MODEL: 'mistral-7b',
        OPENAI_API_KEY: 'sk-test',
        ANTHROPIC_API_KEY: 'sk-ant-test',
        BACKEND_TS_PORT: '8001',
      };

      const result = envSchema.safeParse(validEnv);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.LLM_PROVIDER).toBe('lmstudio');
        expect(result.data.LLM_MODEL).toBe('mistral-7b');
        expect(result.data.LM_STUDIO_URL).toBe('http://localhost:1234/v1');
        expect(result.data.BACKEND_TS_PORT).toBe(8001); // Coerced to number
      }
    });

    test('applies default values for missing optional fields', () => {
      const minimalEnv = {};

      const result = envSchema.safeParse(minimalEnv);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.LLM_PROVIDER).toBe('lmstudio'); // Default
        expect(result.data.LM_STUDIO_URL).toBe('http://localhost:1234/v1'); // Default
        expect(result.data.BACKEND_TS_PORT).toBe(8001); // Default
        expect(result.data.LLM_MODEL).toBe('');
        expect(result.data.OPENAI_API_KEY).toBe('');
        expect(result.data.ANTHROPIC_API_KEY).toBe('');
      }
    });

    test('rejects invalid provider', () => {
      const invalidEnv = {
        LLM_PROVIDER: 'invalid-provider',
      };

      const result = envSchema.safeParse(invalidEnv);

      expect(result.success).toBe(false);
      if (!result.success) {
        const providerError = result.error.issues.find(
          issue => issue.path[0] === 'LLM_PROVIDER'
        );
        expect(providerError).toBeDefined();
      }
    });

    test('rejects invalid URL format', () => {
      const invalidEnv = {
        LM_STUDIO_URL: 'not-a-url',
      };

      const result = envSchema.safeParse(invalidEnv);

      expect(result.success).toBe(false);
      if (!result.success) {
        const urlError = result.error.issues.find(
          issue => issue.path[0] === 'LM_STUDIO_URL'
        );
        expect(urlError).toBeDefined();
        expect(urlError?.message).toContain('Invalid URL');
      }
    });

    test('coerces port string to number', () => {
      const envWithStringPort = {
        BACKEND_TS_PORT: '8001',
      };

      const result = envSchema.safeParse(envWithStringPort);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.BACKEND_TS_PORT).toBe(8001);
        expect(typeof result.data.BACKEND_TS_PORT).toBe('number');
      }
    });

    test('accepts all five valid providers', () => {
      const providers = ['lmstudio', 'openai', 'anthropic', 'gemini', 'openrouter'];

      providers.forEach(provider => {
        const env = { LLM_PROVIDER: provider };
        const result = envSchema.safeParse(env);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.LLM_PROVIDER).toBe(provider);
        }
      });
    });

    test('accepts gemini as valid provider', () => {
      const env = { LLM_PROVIDER: 'gemini' };
      const result = envSchema.safeParse(env);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.LLM_PROVIDER).toBe('gemini');
      }
    });

    test('parses GEMINI_API_KEY from env', () => {
      const env = { GEMINI_API_KEY: 'AIzaSy-test-key' };
      const result = envSchema.safeParse(env);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.GEMINI_API_KEY).toBe('AIzaSy-test-key');
      }
    });

    test('defaults GEMINI_API_KEY to empty string when absent', () => {
      const result = envSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.GEMINI_API_KEY).toBe('');
      }
    });

    test('parses OPENROUTER_API_KEY from env', () => {
      const env = { OPENROUTER_API_KEY: 'sk-or-test-key' };
      const result = envSchema.safeParse(env);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.OPENROUTER_API_KEY).toBe('sk-or-test-key');
      }
    });

    test('defaults OPENROUTER_API_KEY to empty string when absent', () => {
      const result = envSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.OPENROUTER_API_KEY).toBe('');
      }
    });

    test('parses OPENROUTER_MODEL from env', () => {
      const env = { OPENROUTER_MODEL: 'meta-llama/llama-3.1-8b-instruct:free' };
      const result = envSchema.safeParse(env);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.OPENROUTER_MODEL).toBe('meta-llama/llama-3.1-8b-instruct:free');
      }
    });

    test('defaults OPENROUTER_MODEL to empty string when absent', () => {
      const result = envSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.OPENROUTER_MODEL).toBe('');
      }
    });

    describe('USE_LM_STUDIO_STREAMING_EVENTS boolean coerce', () => {
      test('parses USE_LM_STUDIO_STREAMING_EVENTS=true as true', () => {
        const result = envSchema.safeParse({ USE_LM_STUDIO_STREAMING_EVENTS: 'true' });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.USE_LM_STUDIO_STREAMING_EVENTS).toBe(true);
        }
      });

      test('parses USE_LM_STUDIO_STREAMING_EVENTS=false as false (NOT true)', () => {
        // Critical test: z.coerce.boolean() is naive in Zod 3.x/early 4.x —
        // treats any non-empty string (including "false") as true.
        // Must use z.preprocess to handle this correctly.
        const result = envSchema.safeParse({ USE_LM_STUDIO_STREAMING_EVENTS: 'false' });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.USE_LM_STUDIO_STREAMING_EVENTS).toBe(false);
        }
      });

      test('defaults to false when USE_LM_STUDIO_STREAMING_EVENTS key is missing', () => {
        const result = envSchema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.USE_LM_STUDIO_STREAMING_EVENTS).toBe(false);
        }
      });

      test('accepts boolean true literal (non-string)', () => {
        const result = envSchema.safeParse({ USE_LM_STUDIO_STREAMING_EVENTS: true });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.USE_LM_STUDIO_STREAMING_EVENTS).toBe(true);
        }
      });
    });
  });

  describe('loadConfig()', () => {
    test('returns validated config for valid environment', () => {
      process.env.LLM_PROVIDER = 'openai';
      process.env.LLM_MODEL = 'gpt-4';
      process.env.OPENAI_API_KEY = 'sk-test';
      process.env.BACKEND_TS_PORT = '8001';

      const config = loadConfig();

      expect(config.LLM_PROVIDER).toBe('openai');
      expect(config.LLM_MODEL).toBe('gpt-4');
      expect(config.OPENAI_API_KEY).toBe('sk-test');
      expect(config.BACKEND_TS_PORT).toBe(8001);
    });

    test('exits with code 1 on invalid provider', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      process.env.LLM_PROVIDER = 'invalid-provider';

      expect(() => loadConfig()).toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalled();

      // Verify error message mentions the field
      const errorCalls = consoleErrorSpy.mock.calls.flat();
      const hasFieldError = errorCalls.some(call =>
        typeof call === 'string' && call.includes('LLM_PROVIDER')
      );
      expect(hasFieldError).toBe(true);

      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    test('exits with code 1 on invalid URL', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      process.env.LM_STUDIO_URL = 'not-a-valid-url';

      expect(() => loadConfig()).toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalled();

      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    test('logs clear error messages on validation failure', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      process.env.LLM_PROVIDER = 'invalid';

      expect(() => loadConfig()).toThrow();

      // Verify error structure
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Configuration validation failed')
      );

      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    test('uses defaults when environment is empty', () => {
      // Clear all LLM-related env vars
      delete process.env.LLM_PROVIDER;
      delete process.env.LLM_MODEL;
      delete process.env.LM_STUDIO_URL;
      delete process.env.BACKEND_TS_PORT;

      const config = loadConfig();

      expect(config.LLM_PROVIDER).toBe('lmstudio');
      expect(config.LM_STUDIO_URL).toBe('http://localhost:1234/v1');
      expect(config.BACKEND_TS_PORT).toBe(8001);
    });

    test('does NOT require OPENAI_API_KEY when provider is lmstudio', () => {
      process.env.LLM_PROVIDER = 'lmstudio';
      delete process.env.OPENAI_API_KEY;

      const config = loadConfig();

      // Should succeed - factory validates API keys, not config
      expect(config.LLM_PROVIDER).toBe('lmstudio');
      expect(config.OPENAI_API_KEY).toBe('');
    });

    test('does NOT require ANTHROPIC_API_KEY when provider is lmstudio', () => {
      process.env.LLM_PROVIDER = 'lmstudio';
      delete process.env.ANTHROPIC_API_KEY;

      const config = loadConfig();

      // Should succeed - factory validates API keys, not config
      expect(config.LLM_PROVIDER).toBe('lmstudio');
      expect(config.ANTHROPIC_API_KEY).toBe('');
    });
  });
});
