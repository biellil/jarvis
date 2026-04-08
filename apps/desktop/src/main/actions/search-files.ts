import type { ActionHandler } from './types.js';
import { ok, fail } from './types.js';
import {
  assertAbsolutePath,
  assertSafeGlobPattern,
  describeError,
  runExecFile,
} from './validators.js';

export const searchFilesHandler: ActionHandler = async (args) => {
  try {
    const dir = assertAbsolutePath(args.directory, 'directory');
    const pattern = assertSafeGlobPattern(args.pattern);
    const { stdout } = await runExecFile('find', [
      dir,
      '-maxdepth',
      '5',
      '-name',
      pattern,
    ]);
    return ok(stdout);
  } catch (err) {
    return fail(describeError(err));
  }
};
