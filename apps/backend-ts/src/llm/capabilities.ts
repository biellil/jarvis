/**
 * Provider capability detection.
 *
 * Replicates Python's src/jarvis/llm/capabilities.py heuristics (per D-12).
 * Detects streaming, vision, and function calling support based on provider and model.
 */

import type { LLMConfig } from './types.js';

export interface ProviderCapabilities {
  streaming: boolean;
  vision: boolean;
  functionCalling: boolean;
}

export type CapabilityMatrix = Record<string, ProviderCapabilities>;

/**
 * Detect capabilities for configured LLM providers.
 * Replicates Python detect_capabilities() heuristics.
 *
 * Non-fatal by design (per D-13) — errors are logged but don't prevent startup.
 *
 * @param config - Validated LLM configuration
 * @returns Capability matrix for all providers
 */
export async function detectCapabilities(config: LLMConfig): Promise<CapabilityMatrix> {
  const capabilities: CapabilityMatrix = {};

  // LM Studio capabilities (from Python heuristics)
  if (config.LLM_PROVIDER === 'lmstudio' || config.LM_STUDIO_URL) {
    const lmModel = (config.LM_STUDIO_MODEL || config.LLM_MODEL || '').toLowerCase();
    const visionKeywords = ['vl', 'vision', 'llava', 'bakllava', 'minicpm-v', 'qwen2-vl', 'qwen2.5-vl', 'internvl', 'moondream'];
    const modelHasVision = visionKeywords.some(kw => lmModel.includes(kw));
    const envOverride = process.env['LM_STUDIO_VISION'] === 'true';
    capabilities.lmstudio = {
      streaming: true,
      vision: modelHasVision || envOverride,
      functionCalling: true,
    };
  }

  // OpenAI capabilities
  if (config.LLM_PROVIDER === 'openai' || config.OPENAI_API_KEY) {
    const model = config.LLM_MODEL || 'gpt-4o-mini';
    capabilities.openai = {
      streaming: true,  // All OpenAI models support streaming
      vision: model.includes('vision') || model.includes('4o'),  // GPT-4V and 4o models
      functionCalling: true,  // All OpenAI models support functions
    };
  }

  // Anthropic capabilities
  if (config.LLM_PROVIDER === 'anthropic' || config.ANTHROPIC_API_KEY) {
    const model = config.LLM_MODEL || 'claude-3-5-haiku-20241022';
    capabilities.anthropic = {
      streaming: true,  // All Claude models support streaming
      vision: model.includes('claude-3'),  // Claude 3 family supports vision
      functionCalling: true,  // Tool use supported
    };
  }

  // Gemini capabilities (Phase 63: was missing — add Gemini vision detection)
  if (config.LLM_PROVIDER === 'gemini' || config.GEMINI_API_KEY) {
    capabilities.gemini = {
      streaming: true,
      // All Gemini models support vision (gemini-2.0-flash, gemini-1.5-pro, etc.)
      vision: true,
      functionCalling: true,
    };
  }

  return capabilities;
}

/**
 * Get the vision capability for a specific provider from the capability matrix.
 * Used by createAnalyzeScreenTool to check at call-time (not cached at session creation).
 *
 * @param caps - Capability matrix from detectCapabilities()
 * @param provider - Active LLM provider name
 * @returns true if provider supports vision, false otherwise
 */
export function providerHasVision(caps: CapabilityMatrix, provider: string): boolean {
  return caps[provider]?.vision === true;
}

/**
 * Format capabilities for console logging.
 *
 * @param caps - Capability matrix from detectCapabilities()
 * @returns Formatted multi-line string for console output
 */
export function formatCapabilities(caps: CapabilityMatrix): string {
  const lines: string[] = ['Provider capabilities:'];

  for (const [provider, cap] of Object.entries(caps)) {
    const features = [];
    if (cap.streaming) features.push('streaming ✓');
    if (cap.vision) features.push('vision ✓');
    if (cap.functionCalling) features.push('functions ✓');

    if (!cap.streaming) features.push('streaming ✗');
    if (!cap.vision) features.push('vision ✗');
    if (!cap.functionCalling) features.push('functions ✗');

    lines.push(`  ${provider}: ${features.join(', ')}`);
  }

  return lines.join('\n');
}
