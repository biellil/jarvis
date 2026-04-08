import * as fs from 'node:fs/promises';
import type { ActionHandler } from './types.js';
import { ok, fail } from './types.js';
import { assertAbsolutePath, describeError } from './validators.js';

/**
 * Deletes a file. NOTE: user confirmation is NOT handled here — that is the
 * executor's responsibility (plan 18_5-04). This handler simply executes.
 */
export const deleteFileHandler: ActionHandler = async (args) => {
  try {
    const path = assertAbsolutePath(args.path, 'path');
    await fs.unlink(path);
    return ok(`deleted ${path}`);
  } catch (err) {
    return fail(describeError(err));
  }
};
