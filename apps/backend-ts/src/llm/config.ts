/**
 * LLM configuration loading with Zod validation.
 * Replicates Python's src/jarvis/config.py Settings class (per D-07).
 */

import { z } from 'zod';

/**
 * Zod schema for LLM-related environment variables.
 * Validates at startup and provides clear error messages (per D-10).
 */
export const envSchema = z.object({
  // Provider selection (per D-28: default to lmstudio for privacy-first)
  LLM_PROVIDER: z.enum(['lmstudio', 'openai', 'anthropic', 'gemini', 'openrouter']).default('lmstudio'),

  // Model override (optional, provider-specific defaults used if not set)
  LLM_MODEL: z.string().optional().default(''),

  // LM Studio configuration (per D-25)
  LM_STUDIO_URL: z.string().url().default('http://localhost:1234/v1'),
  LM_STUDIO_MODEL: z.string().optional().default(''),
  // Feature flag: use LM Studio native /api/v1/chat SSE endpoint (LLM-PROV-02)
  // z.coerce.boolean() is naive in Zod 4.x: treats any non-empty string (including "false") as true.
  // z.preprocess ensures the string "false" is correctly parsed as false (Open Question 1 — CRITICAL).
  USE_LM_STUDIO_STREAMING_EVENTS: z.preprocess(
    (v) => typeof v === 'string' ? v.toLowerCase() === 'true' : v,
    z.boolean()
  ).default(false),

  // Per-provider model overrides (take precedence over LLM_MODEL when set)
  LM_OPENAI_MODEL: z.string().optional().default(''),
  GEMINI_MODEL: z.string().optional().default(''),

  // Cloud provider API keys (per D-26, D-27)
  OPENAI_API_KEY: z.string().optional().default(''),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  GEMINI_API_KEY: z.string().optional().default(''),
  OPENROUTER_API_KEY: z.string().optional().default(''),
  OPENROUTER_MODEL: z.string().optional().default(''),

  // Backend server port (use coerce for number conversion per research)
  BACKEND_TS_PORT: z.coerce.number().default(8001),
});

/**
 * TypeScript type inferred from Zod schema.
 * Ensures type safety throughout the application.
 */
export type LLMConfig = z.infer<typeof envSchema>;

/**
 * Load and validate configuration from environment variables.
 * Exits with code 1 if validation fails (per D-09).
 *
 * Replicates Python's Settings() instantiation behavior.
 *
 * @returns Validated configuration object
 */
export function loadConfig(): LLMConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Configuration validation failed:');
    result.error.issues.forEach(issue => {
      const path = issue.path.join('.');
      console.error(`  ${path}: ${issue.message}`);
    });
    console.error('\nCheck your .env file or environment variables.');
    process.exit(1);
  }

  return result.data;
}
