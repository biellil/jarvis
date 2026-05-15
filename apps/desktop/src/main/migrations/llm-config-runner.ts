/**
 * Side-effect wrapper for LLM config migration.
 *
 * Phase 70 (SIMP-03): Reads .env + electron-store, delegates to pure function,
 * performs atomic write of .env, and batch-deletes LLM keys from store.
 *
 * Design decisions:
 *  - D-04: Must be called BEFORE process.loadEnvFile() in index.ts.
 *  - D-05: If .env does not exist, logs a warning and returns (no-op).
 *  - T-70-02: Atomic write via temp file + rename (same FS = atomic on POSIX).
 *  - T-70-03: Temp file cleanup in catch block if rename fails.
 *  - T-70-04: Batch atomic delete via store.store = next (1 write vs 6).
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  statSync,
  chmodSync,
} from 'node:fs';
import { migrateLlmConfigToEnv, LLM_STORE_KEYS, type LlmStoreSnapshot } from './llm-config.js';
import store from '../store.js';

// CR-01 (Phase 70 REVIEW): .env containing API keys must not be world-readable.
// Preserve existing mode if already restrictive; otherwise force 0o600 on POSIX.
// Skipped on Windows (chmod is a no-op for non-execute bits there).
function applyRestrictivePerms(envPath: string, existingMode: number | null): void {
  if (process.platform === 'win32') return;
  // Mask to permission bits only (lower 9 bits). 0o077 = group+other bits.
  const currentBits = existingMode === null ? 0o644 : existingMode & 0o777;
  if ((currentBits & 0o077) === 0) return; // already restrictive (e.g. 0o600, 0o400)
  try {
    chmodSync(envPath, 0o600);
  } catch (err) {
    console.warn('[migration] could not chmod .env to 0600 (continuing):', err);
  }
}

export function runLlmConfigMigration(envPath: string): void {
  // D-05: .env absent → no-op + warning. Do NOT create the file.
  if (!existsSync(envPath)) {
    console.warn(`[migration] .env not found at ${envPath}, skipping`);
    return;
  }

  // Build snapshot from electron-store via direct .get() calls.
  // Intentionally NOT using accessor functions (getLlmProvider etc.) because
  // those will be deleted in this same plan (Task 3). Direct store.get() is
  // always safe regardless of accessor presence.
  const snapshot: LlmStoreSnapshot = {
    llmProvider: store.get('llmProvider') as LlmStoreSnapshot['llmProvider'],
    lmStudioUrl: store.get('lmStudioUrl') as string | undefined,
    geminiApiKey: store.get('geminiApiKey') as { key: string } | undefined,
    openaiApiKey: store.get('openaiApiKey') as { key: string } | undefined,
    anthropicApiKey: store.get('anthropicApiKey') as { key: string } | undefined,
    streamingLMStudioEventsEnabled: store.get('streamingLMStudioEventsEnabled') as
      | boolean
      | undefined,
  };

  // Idempotency guard (D-03): if no store keys are defined, skip immediately.
  // This is the steady state after the first successful migration run.
  const hasAnything = LLM_STORE_KEYS.some((k) => snapshot[k] !== undefined);
  if (!hasAnything) return;

  const envContent = readFileSync(envPath, 'utf-8');
  const result = migrateLlmConfigToEnv(envContent, snapshot);

  // Atomic write: write to temp file then rename (T-70-02).
  // POSIX rename is atomic on same filesystem; Windows best-effort via MoveFileEx.
  // CR-01: capture existing mode before write so we can preserve/tighten perms.
  let existingMode: number | null = null;
  try {
    existingMode = statSync(envPath).mode;
  } catch {
    /* file may have been deleted between existsSync and statSync — fallback below */
  }

  if (result.migratedKeys.length > 0) {
    const tmpPath = `${envPath}.tmp-${process.pid}`;
    // Force restrictive mode on the tmp file (matters BEFORE rename — otherwise
    // there's a window where keys land at default 0644 umask).
    const writeMode = process.platform === 'win32' ? undefined : 0o600;
    try {
      writeFileSync(tmpPath, result.newEnvContent, { encoding: 'utf-8', mode: writeMode });
      renameSync(tmpPath, envPath);
      // Defensive chmod: if existing .env had restrictive perms, preserve them;
      // otherwise enforce 0o600. This also covers the case where renameSync
      // preserves the destination's old mode metadata on some FS implementations.
      applyRestrictivePerms(envPath, existingMode);
    } catch (err) {
      // T-70-03: cleanup orphaned temp file on failure, then re-raise.
      try {
        unlinkSync(tmpPath);
      } catch {
        // best-effort cleanup — ignore secondary error
      }
      throw err; // re-raise original error so caller can log it
    }
  }

  // Batch atomic delete: one write to electron-store JSON instead of 6 (T-70-04).
  if (result.keysToDelete.length > 0) {
    const current = { ...store.store } as Record<string, unknown>;
    for (const k of result.keysToDelete) delete current[k];
    store.store = current as never;
  }

  // Informative log (only when something happened)
  if (result.migratedKeys.length > 0 || result.skippedKeys.length > 0) {
    console.log(
      `[migration] LLM config: migrated ${result.migratedKeys.length} key(s) to .env [${result.migratedKeys.join(', ')}]; ` +
        `${result.skippedKeys.length} already present [${result.skippedKeys.join(', ')}]; ` +
        `${result.keysToDelete.length} store key(s) cleaned`,
    );
  }
}
