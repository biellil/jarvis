import type { ActionHandler } from './types.js';
import { ok, fail } from './types.js';
import { assertSafeAppName, describeError, runExecFile, ActionValidationError } from './validators.js';

export const closeAppHandler: ActionHandler = async (args) => {
  try {
    const app = assertSafeAppName(args.app);
    await runExecFile('pkill', ['-f', app]);
    return ok(`closed ${app}`);
  } catch (err) {
    // pkill exit code 1 => no matching process. runExecFile maps to subprocess_failed.
    if (err instanceof ActionValidationError && err.code === 'subprocess_failed') {
      return fail('subprocess_failed: no matching process');
    }
    return fail(describeError(err));
  }
};
