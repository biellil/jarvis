/**
 * openFileHandler — opens a file in its default application (Phase 55, LACT-03).
 *
 * Follows the ActionHandler interface (args: Record<string, unknown>).
 * Uses Electron shell.openPath() — routes to the registered default app.
 */
import { shell } from 'electron';
import type { ActionHandler } from './types.js';
import { ok, fail } from './types.js';
import { describeError } from './validators.js';

export const openFileHandler: ActionHandler = async (args) => {
  const path = args['path'];
  if (typeof path !== 'string' || path.length === 0) {
    return fail('invalid_args: path must be a non-empty string');
  }
  try {
    const errMsg = await shell.openPath(path);
    if (errMsg) {
      return fail(`subprocess_failed: ${errMsg}`);
    }
    return ok(`opened file: ${path}`);
  } catch (err) {
    return fail(describeError(err));
  }
};
