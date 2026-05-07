/**
 * adjustVolumeHandler — delta-based system volume adjustment (Phase 59, SYSCTRL-01).
 *
 * Reads current volume, applies delta, clamps to [0, 100], sets the new level.
 * Each platform uses native CLI tools (no extra npm dependencies):
 *   Linux:   pactl get-sink-volume / pactl set-sink-volume
 *   macOS:   osascript (AppleScript volume settings)
 *   Windows: PowerShell Set-Volume, fallback nircmd.exe
 */
import type { ActionHandler } from './types.js';
import { ok, fail } from './types.js';
import { assertDelta, describeError, runExecFile } from './validators.js';

export const adjustVolumeHandler: ActionHandler = async (args) => {
  try {
    const delta = assertDelta(args['delta']);
    let newLevel: number;
    if (process.platform === 'win32') {
      newLevel = await adjustVolumeWindows(delta);
    } else if (process.platform === 'darwin') {
      newLevel = await adjustVolumeMac(delta);
    } else {
      newLevel = await adjustVolumeLinux(delta);
    }
    return ok(`volume adjusted to ${newLevel}%`);
  } catch (err) {
    return fail(describeError(err));
  }
};

async function adjustVolumeLinux(delta: number): Promise<number> {
  const { stdout } = await runExecFile('pactl', ['get-sink-volume', '@DEFAULT_SINK@']);
  const match = stdout.match(/(\d+)%/);
  const current = match ? parseInt(match[1]!, 10) : 50;
  const newLevel = Math.max(0, Math.min(100, current + delta));
  await runExecFile('pactl', ['set-sink-volume', '@DEFAULT_SINK@', `${newLevel}%`]);
  return newLevel;
}

async function adjustVolumeMac(delta: number): Promise<number> {
  const { stdout } = await runExecFile('osascript', [
    '-e',
    'output volume of (get volume settings)',
  ]);
  const current = parseInt(stdout.trim(), 10) || 50;
  const newLevel = Math.max(0, Math.min(100, current + delta));
  await runExecFile('osascript', ['-e', `set volume output volume ${newLevel}`]);
  return newLevel;
}

async function adjustVolumeWindows(delta: number): Promise<number> {
  // Attempt to read current volume via PowerShell
  let current = 50;
  try {
    const { stdout } = await runExecFile('powershell.exe', [
      '-NoProfile',
      '-Command',
      '(Get-AudioDevice -Playback).Volume',
    ]);
    const parsed = parseFloat(stdout.trim());
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      current = Math.round(parsed);
    }
  } catch {
    // Fallback: assume 50% if volume read fails
  }

  const newLevel = Math.max(0, Math.min(100, current + delta));
  const nircmdLevel = Math.round((newLevel / 100) * 65535);

  // Try PowerShell Set-Volume (requires AudioDeviceCmdlets module)
  try {
    await runExecFile('powershell.exe', ['-NoProfile', '-Command', `Set-Volume -Level ${newLevel}`]);
    return newLevel;
  } catch {
    // Fallback: nircmd.exe (no module required, widely available)
    try {
      await runExecFile('nircmd.exe', ['setsysvolume', String(nircmdLevel)]);
      return newLevel;
    } catch {
      throw new Error(
        'Set-Volume cmdlet not available and nircmd not found — install nircmd or update Windows audio modules',
      );
    }
  }
}
