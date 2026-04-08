import * as fs from 'node:fs/promises';
import type { ActionHandler } from './types.js';
import { ok, fail } from './types.js';
import { assertAbsolutePath, describeError, ActionValidationError } from './validators.js';

export const listFilesHandler: ActionHandler = async (args) => {
  try {
    const dir = assertAbsolutePath(args.directory, 'directory');
    let stat;
    try {
      stat = await fs.stat(dir);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') throw new ActionValidationError('path_not_found', dir);
      throw err;
    }
    if (!stat.isDirectory()) {
      throw new ActionValidationError('invalid_args', 'not a directory');
    }
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const out = entries.map((e) => ({
      name: e.name,
      type: e.isDirectory() ? 'dir' : 'file',
    }));
    return ok(JSON.stringify(out));
  } catch (err) {
    return fail(describeError(err));
  }
};
