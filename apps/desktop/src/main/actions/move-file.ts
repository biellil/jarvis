import * as fs from 'node:fs/promises';
import type { ActionHandler } from './types.js';
import { ok, fail } from './types.js';
import { assertAbsolutePath, describeError } from './validators.js';

export const moveFileHandler: ActionHandler = async (args) => {
  try {
    const source = assertAbsolutePath(args.source, 'source');
    const destination = assertAbsolutePath(args.destination, 'destination');
    await fs.rename(source, destination);
    return ok(`moved ${source} -> ${destination}`);
  } catch (err) {
    return fail(describeError(err));
  }
};
