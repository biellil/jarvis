import type { ActionHandler } from './types.js';
import { ok, fail } from './types.js';
import { assertSafeAppName, describeError, runExecFile } from './validators.js';

export const openAppHandler: ActionHandler = async (args) => {
  try {
    const app = assertSafeAppName(args.app);
    await runExecFile('xdg-open', [app]);
    return ok(`opened ${app}`);
  } catch (err) {
    return fail(describeError(err));
  }
};
