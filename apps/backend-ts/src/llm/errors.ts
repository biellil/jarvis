/**
 * Custom error classes for LLM operations.
 * Replicates Python's error handling patterns from src/jarvis/llm/factory.py
 */

/**
 * Thrown when required configuration is missing for selected provider.
 * Example: LLM_PROVIDER=openai but OPENAI_API_KEY not set.
 */
export class LLMConfigError extends Error {
  constructor(provider: string, missingField: string) {
    super(`${missingField} required when LLM_PROVIDER=${provider}`);
    this.name = 'LLMConfigError';
  }
}

/**
 * Thrown when connection to LLM provider fails.
 * Example: LM Studio not running at configured URL.
 */
export class LLMConnectionError extends Error {
  constructor(provider: string, url: string) {
    super(`Could not connect to ${provider} at ${url}`);
    this.name = 'LLMConnectionError';
  }
}
