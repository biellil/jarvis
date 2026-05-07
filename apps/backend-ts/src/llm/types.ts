/**
 * LLM type definitions for multi-provider support.
 * Replicates Python's src/jarvis/llm/types.py
 */

/**
 * Supported LLM providers.
 * Corresponds to Python's LLMProvider enum (per D-06).
 */
export type LLMProvider = 'lmstudio' | 'openai' | 'anthropic' | 'gemini';

/**
 * LLM configuration interface.
 * Will be inferred from Zod schema in config.ts.
 */
export interface LLMConfig {
  LLM_PROVIDER: LLMProvider;
  LLM_MODEL?: string;
  LM_STUDIO_URL: string;
  LM_STUDIO_MODEL?: string;
  USE_LM_STUDIO_STREAMING_EVENTS?: boolean;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  BACKEND_TS_PORT: number;
}
