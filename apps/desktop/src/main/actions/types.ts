/**
 * Shared types for PC action handlers (Phase 18_5-03).
 *
 * Each handler is a pure async function `(args) => Promise<ActionResult>`
 * that validates input, performs an operation via `fs.promises` or
 * `child_process.execFile` (NEVER `exec`), and returns a structured result.
 */

export type ActionResult =
  | { success: true; output: string | null; error: null }
  | { success: false; output: null; error: string };

export type ActionHandler = (
  args: Record<string, unknown>,
) => Promise<ActionResult>;

export function ok(output: string | null = null): ActionResult {
  return { success: true, output, error: null };
}

export function fail(error: string): ActionResult {
  return { success: false, output: null, error };
}
