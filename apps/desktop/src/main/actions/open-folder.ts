/**
 * openFolderHandler — opens a folder in the OS file explorer (Phase 55, LACT-02).
 *
 * Follows the ActionHandler interface (args: Record<string, unknown>).
 * Uses Electron shell.openPath() which is cross-platform (Finder/Files/Explorer).
 */
import { shell } from 'electron';
import type { ActionHandler } from './types.js';
import { ok, fail } from './types.js';
import { describeError } from './validators.js';

export const openFolderHandler: ActionHandler = async (args) => {
  const path = args['path'];
  if (typeof path !== 'string' || path.length === 0) {
    return fail('invalid_args: path must be a non-empty string');
  }
  try {
    const errMsg = await shell.openPath(path);
    if (errMsg) {
      // shell.openPath returns '' on success, error string on failure
      return fail(`subprocess_failed: ${errMsg}`);
    }
    return ok(`opened folder: ${path}`);
  } catch (err) {
    return fail(describeError(err));
  }
};
