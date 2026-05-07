/**
 * mediaControlHandler — media playback control (Phase 59, SYSCTRL-02).
 *
 * Sends play_pause / next_track / prev_track to the active media player.
 *   Linux:   playerctl (requires playerctl package)
 *   macOS:   osascript NX media key codes via System Events (requires Accessibility permission)
 *   Windows: PowerShell WScript.Shell SendKeys with VK_MEDIA_* codes; fallback nircmd
 *
 * All three commands are non-destructive — not added to REQUIRES_CONFIRMATION.
 */
import type { ActionHandler } from './types.js';
import { ok, fail } from './types.js';
import { ActionValidationError, describeError, runExecFile } from './validators.js';

const VALID_COMMANDS = new Set(['play_pause', 'next_track', 'prev_track']);

export const mediaControlHandler: ActionHandler = async (args) => {
  try {
    const command = args['command'];
    if (typeof command !== 'string' || !VALID_COMMANDS.has(command)) {
      throw new ActionValidationError(
        'invalid_args',
        `command must be one of: ${[...VALID_COMMANDS].join(', ')}`,
      );
    }

    if (process.platform === 'win32') {
      await mediaControlWindows(command);
    } else if (process.platform === 'darwin') {
      await mediaControlMac(command);
    } else {
      await mediaControlLinux(command);
    }
    return ok(`media: ${command}`);
  } catch (err) {
    if (
      err instanceof ActionValidationError &&
      (err.code === 'command_not_found' || err.message.includes('command_not_found'))
    ) {
      // Provide actionable message when playerctl is missing on Linux
      return fail(`${err.message} — install playerctl to control media on Linux`);
    }
    return fail(describeError(err));
  }
};

// Linux: playerctl command mappings
const LINUX_COMMANDS: Record<string, string> = {
  play_pause: 'play-pause',
  next_track: 'next',
  prev_track: 'previous',
};

async function mediaControlLinux(command: string): Promise<void> {
  await runExecFile('playerctl', [LINUX_COMMANDS[command]!]);
}

// macOS: NX media key codes via System Events (requires Accessibility permission)
// F7=prev(98), F8=play-pause(100), F9=next(101)
const MAC_KEY_CODES: Record<string, string> = {
  play_pause: '100',
  next_track: '101',
  prev_track: '98',
};

async function mediaControlMac(command: string): Promise<void> {
  const keyCode = MAC_KEY_CODES[command]!;
  try {
    await runExecFile('osascript', [
      '-e',
      `tell application "System Events" to key code ${keyCode}`,
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('not allowed') ||
      msg.includes('permission_denied') ||
      msg.includes('access for assistive')
    ) {
      throw new ActionValidationError(
        'permission_denied',
        'media_control requires Accessibility permission — grant JARVIS access in System Settings → Privacy & Security → Accessibility',
      );
    }
    throw err;
  }
}

// Windows: VK_MEDIA_* key codes via WScript.Shell SendKeys
const WIN_KEY_CODES: Record<string, number> = {
  play_pause: 179, // VK_MEDIA_PLAY_PAUSE
  next_track: 176, // VK_MEDIA_NEXT_TRACK
  prev_track: 177, // VK_MEDIA_PREV_TRACK
};

const NIRCMD_KEYS: Record<string, string> = {
  play_pause: 'media_play_pause',
  next_track: 'media_next_track',
  prev_track: 'media_prev_track',
};

async function mediaControlWindows(command: string): Promise<void> {
  const charCode = WIN_KEY_CODES[command]!;
  try {
    await runExecFile('powershell.exe', [
      '-NoProfile',
      '-Command',
      `(New-Object -ComObject WScript.Shell).SendKeys([char]${charCode})`,
    ]);
  } catch {
    // Fallback: nircmd sendkeypress
    try {
      await runExecFile('nircmd.exe', ['sendkeypress', NIRCMD_KEYS[command]!]);
    } catch {
      throw new Error(
        'Unable to send media key — PowerShell WScript.Shell failed and nircmd not found. Install nircmd as fallback.',
      );
    }
  }
}
