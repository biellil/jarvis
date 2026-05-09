/**
 * Phase 65 (MCP-CLI-01 D-09) — chokidar-based watcher for `.env` and `.env.local`.
 *
 * Fires `onChange()` only when one of the 3 MCP_SERVER_* keys changed between
 * snapshots. 250ms debounce on top of chokidar's `awaitWriteFinish: 200` to
 * absorb VS Code-style atomic-save event pairs (unlink → add) into a single
 * logical change event (Pitfall 3 in RESEARCH.md).
 *
 * Mutates `process.env` for the 3 keys before invoking onChange so that
 * `mcpManager.configFromEnv()` sees fresh values (Pitfall 2: process.env
 * does NOT auto-refresh from disk).
 */
import chokidar from 'chokidar';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  snapshotMcpVars,
  diffMcpVars,
  WATCHED_KEYS,
  type McpEnvSnapshot,
} from '../mcp/client/env-diff.js';

/** 250ms debounce — empirical balance: instant-feeling, absorbs atomic-save (Pitfall 3). */
export const ENV_WATCHER_DEBOUNCE_MS = 250;

export interface EnvWatcherOptions {
  /** Project root containing .env / .env.local. Defaults to `resolve(process.cwd(), '../..')` to match `node --env-file=../../.env`. */
  projectRoot?: string;
  /** Override debounce window in tests. Default 250ms. */
  debounceMs?: number;
}

function readEnvSnapshot(projectRoot: string): McpEnvSnapshot {
  const envPath = resolve(projectRoot, '.env');
  const localPath = resolve(projectRoot, '.env.local');
  const envText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : undefined;
  const localText = existsSync(localPath) ? readFileSync(localPath, 'utf8') : undefined;
  return snapshotMcpVars(envText, localText);
}

/**
 * Start watching `.env` and `.env.local` for MCP_SERVER_* changes.
 * Returns a stop function that resolves when chokidar has fully closed.
 */
export function startEnvWatcher(
  onChange: () => void | Promise<void>,
  opts: EnvWatcherOptions = {},
): () => Promise<void> {
  const projectRoot = opts.projectRoot ?? resolve(process.cwd(), '../..');
  const debounceMs = opts.debounceMs ?? ENV_WATCHER_DEBOUNCE_MS;

  let lastSnapshot = readEnvSnapshot(projectRoot);
  let debounceTimer: NodeJS.Timeout | null = null;

  const watcher = chokidar.watch(['.env', '.env.local'], {
    cwd: projectRoot,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });

  const handler = (path: string): void => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const next = readEnvSnapshot(projectRoot);
      if (!diffMcpVars(lastSnapshot, next)) {
        // No MCP_SERVER_* change — silently ignore (D-09 specifics)
        return;
      }
      lastSnapshot = next;
      // Pitfall 2: mutate process.env so mcpManager.configFromEnv() sees fresh values
      for (const k of WATCHED_KEYS) {
        const v = next[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      // Log only the file path (T-65-01 mitigation: never log values/contents)
      console.log(`[env-watcher] MCP_SERVER_* changed (${path}) — triggering reload`);
      void Promise.resolve(onChange()).catch((err) => {
        console.error(`[env-watcher] onChange handler threw: ${(err as Error).message}`);
      });
    }, debounceMs);
  };

  // Treat add/change/unlink identically (Pitfall 3 atomic-save: editor → unlink + add)
  watcher.on('change', handler);
  watcher.on('add', handler);
  watcher.on('unlink', handler);

  return async () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    await watcher.close();
  };
}
