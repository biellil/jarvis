import type { ActionHandler } from './types.js';
import { ok, fail } from './types.js';
import { describeError, runExecFile } from './validators.js';

export const listProcessesHandler: ActionHandler = async () => {
  try {
    const { stdout } = await runExecFile('ps', [
      '-eo',
      'pid,comm,pcpu,pmem',
      '--sort=-pcpu',
    ]);
    return ok(stdout);
  } catch (err) {
    return fail(describeError(err));
  }
};
