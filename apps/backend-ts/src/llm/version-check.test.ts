import { describe, test, expect } from 'vitest';
import { validateLangChainVersions } from './version-check.js';

describe('Version Check', () => {
  test('validates installed LangChain.js packages', async () => {
    const result = await validateLangChainVersions();

    // Should find packages since they're installed
    expect(result).toBeDefined();
    expect(result.coreVersion).toBeDefined();
    expect(result.message).toContain('@langchain/core');

    // In normal case, versions should be compatible
    expect(result.valid).toBe(true);
  });
});
