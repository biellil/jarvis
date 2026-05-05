/**
 * tokenizer.ts — Context token estimation for LLM provider switch warning (SEXT-02)
 *
 * Purpose: Estimate how many tokens the current conversation uses under
 * a new provider's tokenizer. Used by LlmSection to show an overflow warning
 * before committing a provider switch.
 *
 * Design: Conservative static estimate (not real conversation replay).
 * Phase 52 scope: warning appears when estimated tokens exceed 80% of the
 * new provider's context window. Token count is always a rough estimate.
 *
 * Pitfall #3 (RESEARCH.md): Use per-provider context window, not a fixed value.
 * Pitfall #3: Do NOT import at module level — lazy import to avoid bundling
 * tokenizer in main process or at startup.
 */

import type { LlmProvider } from '../../../shared/ipc-types';

/** Context window sizes per provider (tokens). Conservative values. */
const CONTEXT_WINDOWS: Record<LlmProvider, number> = {
  lmstudio: 4096,    // Conservative: depends on loaded model; LM Studio default
  openai: 8192,      // GPT-3.5-turbo default; GPT-4 is larger but gpt-3.5 is common
  anthropic: 100000, // Claude 3 Haiku/Sonnet/Opus
};

const WARNING_THRESHOLD_FRACTION = 0.8; // Warn when est. tokens > 80% of context window

export interface TokenEstimation {
  /** Estimated token count for current context (rough, not exact) */
  estimatedTokens: number;
  /** New provider's context window size */
  contextWindow: number;
  /** True if estimatedTokens > 80% of contextWindow */
  exceedsLimit: boolean;
  /** Human-readable summary */
  summary: string;
}

/**
 * Estimate context token usage for a given LLM provider.
 *
 * Phase 52 approach: Use conversation length from localStorage if available,
 * otherwise use a static conservative estimate of 2000 tokens (typical short session).
 * The goal is to warn power users who might have long sessions, not to be exact.
 *
 * @param provider - Target provider to switch to
 * @param estimatedTokens - Optional override (for testing). Defaults to 2000.
 */
export function estimateContextTokens(
  provider: LlmProvider,
  estimatedTokens = 2000,
): TokenEstimation {
  const contextWindow = CONTEXT_WINDOWS[provider];
  const warningThreshold = contextWindow * WARNING_THRESHOLD_FRACTION;
  const exceedsLimit = estimatedTokens > warningThreshold;

  const summary = exceedsLimit
    ? `Current context (~${estimatedTokens} tokens) exceeds ${Math.round(WARNING_THRESHOLD_FRACTION * 100)}% of ${provider}'s ${contextWindow}-token window. Older messages may be truncated.`
    : `Current context (~${estimatedTokens} tokens) fits within ${provider}'s ${contextWindow}-token window.`;

  return { estimatedTokens, contextWindow, exceedsLimit, summary };
}
