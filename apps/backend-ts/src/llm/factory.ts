/**
 * LLM factory — single entry point for creating any supported LLM.
 * Replicates Python's src/jarvis/llm/factory.py
 *
 * Usage:
 *   import { createLLM } from './llm/factory';
 *   const llm = createLLM();  // Uses config.LLM_PROVIDER
 *
 * The returned BaseChatModel is provider-agnostic — callers never import
 * ChatOpenAI or ChatAnthropic directly; they use the abstract interface.
 */

import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { LLMProvider, LLMConfig } from './types.js';
import { loadConfig } from './config.js';
import { LLMConfigError } from './errors.js';

/**
 * Create and return the configured LLM as a BaseChatModel.
 *
 * Replicates Python's create_llm() from src/jarvis/llm/factory.py
 *
 * @param provider - Optional provider override
 * @param config - Optional config override (for testing)
 * @returns BaseChatModel instance with streaming=true
 * @throws Error if provider is unknown or required config is missing
 */
export function createLLM(
  provider?: LLMProvider,
  config?: LLMConfig
): BaseChatModel {
  const cfg = config || loadConfig();
  const selectedProvider = provider || cfg.LLM_PROVIDER;

  switch (selectedProvider) {
    case 'lmstudio':
      // CRITICAL: Use configuration object (not basePath) per RESEARCH.md
      return new ChatOpenAI({
        configuration: {
          baseURL: cfg.LM_STUDIO_URL,  // Must use baseURL in nested config
        },
        apiKey: 'lm-studio',  // Required but ignored by LM Studio
        model: cfg.LM_STUDIO_MODEL || cfg.LLM_MODEL || 'default',
        streaming: true,  // Always enable streaming (per D-01 parity)
      });

    case 'openai':
      if (!cfg.OPENAI_API_KEY) {
        throw new LLMConfigError('openai', 'OPENAI_API_KEY');
      }
      return new ChatOpenAI({
        apiKey: cfg.OPENAI_API_KEY,
        model: cfg.LLM_MODEL || 'gpt-4o-mini',  // Match Python default
        streaming: true,
      });

    case 'anthropic':
      if (!cfg.ANTHROPIC_API_KEY) {
        throw new LLMConfigError('anthropic', 'ANTHROPIC_API_KEY');
      }
      return new ChatAnthropic({
        apiKey: cfg.ANTHROPIC_API_KEY,
        model: cfg.LLM_MODEL || 'claude-3-5-haiku-20241022',  // Match Python default
        streaming: true,
      });

    default:
      // Exhaustive check ensures all cases handled
      throw new Error(
        `Unknown provider: '${selectedProvider}'. Valid: lmstudio, openai, anthropic`
      );
  }
}
