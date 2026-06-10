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
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { LLMProvider, LLMConfig } from './types.js';
import { loadConfig } from './config.js';
import { LLMConfigError } from './errors.js';
import { ChatOpenAIStreamingEvents } from './streaming-events.js';

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
      if (cfg.USE_LM_STUDIO_STREAMING_EVENTS) {
        return new ChatOpenAIStreamingEvents({
          configuration: {
            baseURL: cfg.LM_STUDIO_URL,
          },
          apiKey: 'lm-studio',
          model: cfg.LM_STUDIO_MODEL || cfg.LLM_MODEL || 'default',
          streaming: true,
          nativeEventsEnabled: true,
        });
      }
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
        model: cfg.LM_OPENAI_MODEL || cfg.LLM_MODEL || 'gpt-4o-mini',
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

    case 'gemini':
      if (!cfg.GEMINI_API_KEY) {
        throw new LLMConfigError('gemini', 'GEMINI_API_KEY');
      }
      return new ChatGoogleGenerativeAI({
        apiKey: cfg.GEMINI_API_KEY,
        model: cfg.GEMINI_MODEL || cfg.LLM_MODEL || 'gemini-2.0-flash',
        streaming: true,
      });

    case 'openrouter': {
      if (!cfg.LLM_MODEL) {
        throw new LLMConfigError(
          'openrouter',
          'LLM_MODEL\n  Hint: Set LLM_MODEL in .env (e.g., meta-llama/llama-3.1-8b-instruct:free for free tier)'
        );
      }
      const openrouterBase = new ChatOpenAI({
        configuration: {
          baseURL: 'https://openrouter.ai/api/v1',
        },
        apiKey: cfg.OPENROUTER_API_KEY || 'free-tier',
        model: cfg.LLM_MODEL,
        streaming: true,
      });

      // Wrap invoke to catch 429 exhausted retries and surface as chat message (D-07).
      // The OpenAI SDK already retries 3x with exponential backoff + jitter — we only
      // catch the final failure. During retries, SDK logs internally (D-08 satisfied).
      const originalInvoke = openrouterBase.invoke.bind(openrouterBase);
      openrouterBase.invoke = async function (...args: Parameters<typeof originalInvoke>) {
        try {
          return await originalInvoke(...args);
        } catch (err: unknown) {
          const status =
            (err as { status?: number; statusCode?: number; response?: { status?: number } })
              ?.status ??
            (err as { statusCode?: number })?.statusCode ??
            (err as { response?: { status?: number } })?.response?.status;
          if (status === 429) {
            const { AIMessage } = await import('@langchain/core/messages');
            return new AIMessage(
              'OpenRouter rate limit reached (20 requests/minute on free tier). ' +
              'Please wait a few minutes before retrying, or upgrade your plan at openrouter.ai.'
            );
          }
          throw err;
        }
      } as typeof originalInvoke;

      return openrouterBase;
    }

    default:
      // Exhaustive check ensures all cases handled
      throw new Error(
        `Unknown provider: '${selectedProvider}'. Valid: lmstudio, openai, anthropic, gemini, openrouter`
      );
  }
}
