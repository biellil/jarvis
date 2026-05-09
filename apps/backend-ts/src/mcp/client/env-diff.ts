/**
 * Phase 65 (MCP-CLI D-09) — Pure helpers for detecting MCP_SERVER_* changes.
 * Used by the chokidar env-watcher (Plan 03) to decide whether a `.env` save
 * actually changed any MCP variable, avoiding spurious reloads on unrelated edits.
 *
 * Pure: no I/O, no process.env mutation. Watcher passes file contents as strings.
 */
import { parse as parseDotenv } from 'dotenv';

export const WATCHED_KEYS = [
  'MCP_SERVER_URL',
  'MCP_SERVER_BEARER',
  'MCP_SERVER_NAME',
] as const;

export type McpEnvSnapshot = Record<(typeof WATCHED_KEYS)[number], string | undefined>;

/**
 * Parse `.env` and `.env.local` text content (already read by caller from disk)
 * and return a snapshot containing only the 3 MCP_SERVER_* keys.
 *
 * `.env.local` overrides `.env` — same precedence as Node `--env-file` behavior.
 * Either argument may be undefined when the corresponding file does not exist.
 */
export function snapshotMcpVars(
  envText: string | undefined,
  localText?: string | undefined,
): McpEnvSnapshot {
  const merged: Record<string, string> = {};
  if (envText !== undefined) Object.assign(merged, parseDotenv(envText));
  if (localText !== undefined) Object.assign(merged, parseDotenv(localText));
  const out: McpEnvSnapshot = {
    MCP_SERVER_URL: merged['MCP_SERVER_URL'],
    MCP_SERVER_BEARER: merged['MCP_SERVER_BEARER'],
    MCP_SERVER_NAME: merged['MCP_SERVER_NAME'],
  };
  return out;
}

/**
 * True iff any of the 3 watched keys changed between snapshots.
 * Defensive: ignores keys not in WATCHED_KEYS even if present on inputs.
 */
export function diffMcpVars(prev: McpEnvSnapshot, next: McpEnvSnapshot): boolean {
  return WATCHED_KEYS.some((k) => prev[k] !== next[k]);
}
