/**
 * Tests for migrateLlmConfigToEnv() pure function.
 *
 * Phase 70 (SIMP-03) — 9 mandatory scenarios from RESEARCH.md Example 3.
 * No mocks of FS needed: pure function operates only on strings.
 */

import { describe, it, expect } from 'vitest';
import { migrateLlmConfigToEnv } from '../llm-config.js';

describe('migrateLlmConfigToEnv', () => {
  it('no-op when store is empty', () => {
    // Store has nothing → function is a complete no-op (D-03 idempotency)
    const result = migrateLlmConfigToEnv('LLM_PROVIDER=lmstudio\n', {});
    expect(result.migratedKeys).toEqual([]);
    expect(result.keysToDelete).toEqual([]);
    expect(result.newEnvContent).toBe('LLM_PROVIDER=lmstudio\n');
  });

  it('writes all keys when .env is empty', () => {
    // .env is empty + store has provider + openai key → both written
    const result = migrateLlmConfigToEnv('', {
      llmProvider: 'openai',
      openaiApiKey: { key: 'sk-test' },
    });
    expect(result.migratedKeys).toEqual(['LLM_PROVIDER', 'OPENAI_API_KEY']);
    expect(result.newEnvContent).toBe('LLM_PROVIDER=openai\nOPENAI_API_KEY=sk-test\n');
  });

  it('preserves .env when it has non-empty value (D-02)', () => {
    // .env already has LLM_PROVIDER=lmstudio; store wants to set openai → .env wins
    const env = 'LLM_PROVIDER=lmstudio\n';
    const result = migrateLlmConfigToEnv(env, { llmProvider: 'openai' });
    expect(result.newEnvContent).toBe(env); // unchanged
    expect(result.skippedKeys).toEqual(['LLM_PROVIDER']);
    expect(result.keysToDelete).toEqual(['llmProvider']); // still cleaned from store (D-06)
  });

  it('overwrites .env when key exists but is empty (D-02)', () => {
    // .env has LLM_PROVIDER= (empty) → store value wins
    const env = 'LLM_PROVIDER=\n';
    const result = migrateLlmConfigToEnv(env, { llmProvider: 'openai' });
    expect(result.newEnvContent).toBe('LLM_PROVIDER=openai\n');
    expect(result.migratedKeys).toEqual(['LLM_PROVIDER']);
  });

  it('preserves comments and blank lines', () => {
    // Comments and blank lines must survive the upsert operation (Pitfall 5)
    const env = '# LLM section\nLLM_PROVIDER=\n\n# Other\nFOO=bar\n';
    const result = migrateLlmConfigToEnv(env, { llmProvider: 'openai' });
    expect(result.newEnvContent).toBe('# LLM section\nLLM_PROVIDER=openai\n\n# Other\nFOO=bar\n');
  });

  it('serializes boolean as "true"/"false" literal (D-07)', () => {
    // z.coerce.boolean() in backend reads "true"/"false" correctly (D-07)
    const result = migrateLlmConfigToEnv('', { streamingLMStudioEventsEnabled: true });
    expect(result.newEnvContent).toContain('USE_LM_STUDIO_STREAMING_EVENTS=true');

    const result2 = migrateLlmConfigToEnv('', { streamingLMStudioEventsEnabled: false });
    expect(result2.newEnvContent).toContain('USE_LM_STUDIO_STREAMING_EVENTS=false');
  });

  it('unwraps {key: string} for API keys', () => {
    // Phase 57 D-04: API keys stored as { key: string } must be unwrapped (Pitfall 6)
    const result = migrateLlmConfigToEnv('', {
      geminiApiKey: { key: 'AIzaSy-test' },
    });
    expect(result.newEnvContent).toBe('GEMINI_API_KEY=AIzaSy-test\n');
  });

  it('idempotent — second run no-op after store cleanup', () => {
    // Simulates the second boot: store is already clean (D-06 deleted keys after first run)
    const env = 'LLM_PROVIDER=openai\nOPENAI_API_KEY=sk-test\n';
    const result = migrateLlmConfigToEnv(env, {});
    expect(result.migratedKeys).toEqual([]);
    expect(result.keysToDelete).toEqual([]);
    expect(result.newEnvContent).toBe(env);
  });

  it('mixed: some keys win in .env, some win in store', () => {
    // .env has LLM_PROVIDER=lmstudio (non-empty) → .env wins
    // .env has OPENAI_API_KEY= (empty) → store wins
    // .env doesn't have LM_STUDIO_URL → store writes it
    const env = 'LLM_PROVIDER=lmstudio\nOPENAI_API_KEY=\n';
    const result = migrateLlmConfigToEnv(env, {
      llmProvider: 'openai',              // .env wins
      openaiApiKey: { key: 'sk-x' },      // .env empty → store wins
      lmStudioUrl: 'http://foo:1234/v1',  // absent in .env → store writes
    });
    expect(result.skippedKeys).toEqual(['LLM_PROVIDER']);
    // LLM_STORE_KEYS order: lmStudioUrl before openaiApiKey
    expect(result.migratedKeys).toEqual(['LM_STUDIO_URL', 'OPENAI_API_KEY']);
    expect(result.newEnvContent).toContain('LLM_PROVIDER=lmstudio');
    expect(result.newEnvContent).toContain('OPENAI_API_KEY=sk-x');
    expect(result.newEnvContent).toContain('LM_STUDIO_URL=http://foo:1234/v1');
    // All 3 store keys go to keysToDelete regardless of who won (D-06)
    expect(result.keysToDelete).toContain('llmProvider');
    expect(result.keysToDelete).toContain('openaiApiKey');
    expect(result.keysToDelete).toContain('lmStudioUrl');
  });

  it('WR-02 (REVIEW): empty-string llmProvider does NOT write LLM_PROVIDER= to .env', () => {
    // Guard against corrupted store JSON where llmProvider is "" (falsy non-undefined).
    // Empty value is treated as "no value" — neither migrated nor scheduled for delete,
    // so the corrupted cruft is left alone in the store and never leaks into .env.
    const result = migrateLlmConfigToEnv('', {
      llmProvider: '' as 'lmstudio',
    });
    expect(result.newEnvContent).toBe('');
    expect(result.migratedKeys).toEqual([]);
    expect(result.keysToDelete).toEqual([]);
  });
});
