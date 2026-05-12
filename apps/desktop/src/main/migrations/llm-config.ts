/**
 * Pure function: migrate LLM config from electron-store to .env
 *
 * Phase 70 (SIMP-03): Moves LLM provider/API keys from electron-store JSON
 * (plaintext, 644 perms) to .env (OS file perms, 600).
 *
 * Design decisions from CONTEXT.md:
 *  - D-02: .env wins — non-empty .env value is preserved; only empty/absent keys are filled.
 *  - D-03: Idempotent — no state flag; second run is no-op because store is clean (D-06).
 *  - D-06: keysToDelete always includes any store key whose store value was defined, regardless of who won.
 *  - D-07: boolean streamingLMStudioEventsEnabled → "true"/"false" literal.
 *
 * NO I/O in this file. Side effects (file read/write, store cleanup) live in llm-config-runner.ts.
 */

import { parse as parseDotenv } from 'dotenv';

/** Keys that migrate from electron-store to .env */
export const LLM_STORE_KEYS = [
  'llmProvider',
  'lmStudioUrl',
  'geminiApiKey',
  'openaiApiKey',
  'anthropicApiKey',
  'streamingLMStudioEventsEnabled',
] as const;

/** LlmProvider type (local copy — standalone; Plan 03 deletes ipc-types import) */
type LlmProvider = 'lmstudio' | 'openai' | 'anthropic' | 'gemini';

/** Snapshot of electron-store LLM-related keys used as pure input */
export interface LlmStoreSnapshot {
  llmProvider?: LlmProvider;
  lmStudioUrl?: string;
  geminiApiKey?: { key: string };
  openaiApiKey?: { key: string };
  anthropicApiKey?: { key: string };
  streamingLMStudioEventsEnabled?: boolean;
}

/** Mapping from electron-store key to .env variable name */
const STORE_TO_ENV: Record<typeof LLM_STORE_KEYS[number], string> = {
  llmProvider: 'LLM_PROVIDER',
  lmStudioUrl: 'LM_STUDIO_URL',
  geminiApiKey: 'GEMINI_API_KEY',
  openaiApiKey: 'OPENAI_API_KEY',
  anthropicApiKey: 'ANTHROPIC_API_KEY',
  streamingLMStudioEventsEnabled: 'USE_LM_STUDIO_STREAMING_EVENTS',
};

export interface MigrationResult {
  newEnvContent: string;
  keysToDelete: (typeof LLM_STORE_KEYS)[number][];
  migratedKeys: string[];  // .env keys effectively written
  skippedKeys: string[];   // .env already had non-empty value (D-02)
}

/**
 * Pure migration function. No I/O.
 *
 * For each LLM store key:
 *   - If .env already has a non-empty value → skip (D-02), but still mark for delete (D-06).
 *   - If .env is absent or has an empty value → write value to .env, mark for delete.
 *   - If store also has no value for the key → no-op for that key.
 */
export function migrateLlmConfigToEnv(
  envContent: string,
  storeSnapshot: LlmStoreSnapshot,
): MigrationResult {
  const parsed = parseDotenv(envContent);
  const migrated: string[] = [];
  const skipped: string[] = [];
  const keysToDelete: (typeof LLM_STORE_KEYS)[number][] = [];
  let newEnvContent = envContent;

  for (const storeKey of LLM_STORE_KEYS) {
    const envKey = STORE_TO_ENV[storeKey];
    const storeValue = extractStoreValue(storeSnapshot, storeKey);
    if (storeValue === undefined) continue; // nothing in store → nothing to do

    const envValue = parsed[envKey];
    const envHasValue = envValue !== undefined && envValue !== '';

    if (envHasValue) {
      // .env wins (D-02). Mark store key for deletion anyway (D-06).
      skipped.push(envKey);
      keysToDelete.push(storeKey);
    } else {
      // .env is absent or empty → store value wins.
      newEnvContent = upsertEnvKey(newEnvContent, envKey, storeValue);
      migrated.push(envKey);
      keysToDelete.push(storeKey);
    }
  }

  return { newEnvContent, keysToDelete, migratedKeys: migrated, skippedKeys: skipped };
}

/**
 * Extract a scalar string value from the store snapshot.
 * Unwraps { key: string } wrappers for API keys (Phase 57 D-04).
 * Returns undefined if the value is absent or empty.
 */
function extractStoreValue(
  snap: LlmStoreSnapshot,
  storeKey: (typeof LLM_STORE_KEYS)[number],
): string | undefined {
  switch (storeKey) {
    case 'llmProvider':
      return snap.llmProvider;
    case 'lmStudioUrl':
      return snap.lmStudioUrl && snap.lmStudioUrl.length > 0 ? snap.lmStudioUrl : undefined;
    case 'geminiApiKey':
      return snap.geminiApiKey?.key && snap.geminiApiKey.key.length > 0
        ? snap.geminiApiKey.key
        : undefined;
    case 'openaiApiKey':
      return snap.openaiApiKey?.key && snap.openaiApiKey.key.length > 0
        ? snap.openaiApiKey.key
        : undefined;
    case 'anthropicApiKey':
      return snap.anthropicApiKey?.key && snap.anthropicApiKey.key.length > 0
        ? snap.anthropicApiKey.key
        : undefined;
    case 'streamingLMStudioEventsEnabled':
      // Boolean → 'true'/'false' literal (D-07).
      // Note: undefined (not set) → returns undefined (no migration needed).
      return snap.streamingLMStudioEventsEnabled === true
        ? 'true'
        : snap.streamingLMStudioEventsEnabled === false
          ? 'false'
          : undefined;
  }
}

/**
 * Upsert key→value in the .env text content, preserving comments and blank lines.
 *
 * - If the key already exists (even with empty value): replace that single line.
 * - If the key does not exist: append to the end with a guaranteed newline separator.
 *
 * Assumption: values for LLM keys (provider, URL, API keys, boolean) are single-line.
 * Multi-line values would require different handling — not applicable here.
 *
 * Regex: ^KEY=.*$  (matches line starting with the key, ignores comment lines)
 */
function upsertEnvKey(content: string, key: string, value: string): string {
  const serialized = serializeEnvValue(value);
  const line = `${key}=${serialized}`;
  const lineRegex = new RegExp(`^${escapeRegex(key)}=.*$`, 'm');

  if (lineRegex.test(content)) {
    return content.replace(lineRegex, line);
  } else {
    // Append: ensure single newline separator (Pitfall 5)
    const sep = content.length === 0 || content.endsWith('\n') ? '' : '\n';
    return `${content}${sep}${line}\n`;
  }
}

/** Escape special regex characters in a string */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Serialize a value for .env format.
 * - No whitespace/quotes/hash/newline → bare: KEY=value
 * - Otherwise → double-quoted with escapes for \, ", \n
 */
function serializeEnvValue(value: string): string {
  const needsQuoting = /[\s"'#\n]/.test(value);
  if (!needsQuoting) return value;
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
  return `"${escaped}"`;
}
