import type { ActionHandler } from './types.js';
import { ok, fail } from './types.js';
import { assertLevel0to100, describeError, runExecFile } from './validators.js';

export const setVolumeHandler: ActionHandler = async (args) => {
  try {
    const level = assertLevel0to100(args.level);
    const { stdout } = await runExecFile('pactl', [
      'set-sink-volume',
      '@DEFAULT_SINK@',
      `${level}%`,
    ]);
    return ok(stdout.trim() || `volume set to ${level}%`);
  } catch (err) {
    return fail(describeError(err));
  }
};
