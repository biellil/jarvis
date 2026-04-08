import type { ActionHandler } from './types.js';
import { ok, fail } from './types.js';
import { assertLevel0to100, describeError, runExecFile } from './validators.js';

export const setBrightnessHandler: ActionHandler = async (args) => {
  try {
    const level = assertLevel0to100(args.level);
    const { stdout } = await runExecFile('brightnessctl', ['set', `${level}%`]);
    return ok(stdout.trim() || `brightness set to ${level}%`);
  } catch (err) {
    return fail(describeError(err));
  }
};
