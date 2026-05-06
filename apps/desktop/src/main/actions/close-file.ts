/**
 * closeFileHandler — closes a process by name (Phase 55, LACT-04).
 *
 * Follows the ActionHandler interface (args: Record<string, unknown>).
 * The processName arg is the executable name (e.g. 'notepad.exe', 'Preview').
 *
 * Windows: taskkill /IM <name> /F
 * macOS/Linux: pkill -f <name>
 *
 * Note: closes ALL windows of that process, not just a specific file (D-06).
 */
import type { ActionHandler } from './types.js';
import { ok, fail } from './types.js';
import { assertSafeAppName, runExecFile, describeError } from './validators.js';

export const closeFileHandler: ActionHandler = async (args) => {
  try {
    const processName = assertSafeAppName(args['processName']);
    if (process.platform === 'win32') {
      await runExecFile('taskkill', ['/IM', processName, '/F']);
    } else {
      await runExecFile('pkill', ['-f', processName]);
    }
    return ok(`process killed: ${processName}`);
  } catch (err) {
    return fail(describeError(err));
  }
};
