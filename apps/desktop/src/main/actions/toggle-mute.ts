/**
 * toggleMuteHandler — system mute toggle (Phase 59, SYSCTRL-01).
 *
 * Reads current mute state and inverts it. Returns ok('muted') or ok('unmuted').
 *   Linux:   pactl get-sink-mute / pactl set-sink-mute toggle
 *   macOS:   osascript (AppleScript volume settings)
 *   Windows: PowerShell Get-AudioDevice + nircmd mutesysvolume 2 (toggle)
 */
import type { ActionHandler } from './types.js';
import { ok, fail } from './types.js';
import { describeError, runExecFile } from './validators.js';

export const toggleMuteHandler: ActionHandler = async (_args) => {
  try {
    let newState: 'muted' | 'unmuted';
    if (process.platform === 'win32') {
      newState = await toggleMuteWindows();
    } else if (process.platform === 'darwin') {
      newState = await toggleMuteMac();
    } else {
      newState = await toggleMuteLinux();
    }
    return ok(newState);
  } catch (err) {
    return fail(describeError(err));
  }
};

async function toggleMuteLinux(): Promise<'muted' | 'unmuted'> {
  const { stdout } = await runExecFile('pactl', ['get-sink-mute', '@DEFAULT_SINK@']);
  const wasMuted = stdout.toLowerCase().includes('yes');
  await runExecFile('pactl', ['set-sink-mute', '@DEFAULT_SINK@', 'toggle']);
  return wasMuted ? 'unmuted' : 'muted';
}

async function toggleMuteMac(): Promise<'muted' | 'unmuted'> {
  const { stdout } = await runExecFile('osascript', [
    '-e',
    'output muted of (get volume settings)',
  ]);
  const wasMuted = stdout.trim().toLowerCase() === 'true';
  const newMuted = !wasMuted;
  await runExecFile('osascript', ['-e', `set volume output muted ${newMuted}`]);
  return newMuted ? 'muted' : 'unmuted';
}

async function toggleMuteWindows(): Promise<'muted' | 'unmuted'> {
  // Try to read current mute state via PowerShell
  let wasMuted = false;
  try {
    const { stdout } = await runExecFile('powershell.exe', [
      '-NoProfile',
      '-Command',
      '(Get-AudioDevice -Playback).Mute',
    ]);
    wasMuted = stdout.trim().toLowerCase() === 'true';
  } catch {
    // Assume unmuted if read fails
  }

  // Toggle: nircmd mutesysvolume 2 (toggle mode) is the simplest cross-version approach
  try {
    await runExecFile('nircmd.exe', ['mutesysvolume', '2']);
    return wasMuted ? 'unmuted' : 'muted';
  } catch {
    // Fallback: PowerShell AudioDeviceCmdlets
    try {
      await runExecFile('powershell.exe', [
        '-NoProfile',
        '-Command',
        `Set-AudioDevice -Playback -Mute ${!wasMuted}`,
      ]);
      return wasMuted ? 'unmuted' : 'muted';
    } catch {
      throw new Error(
        'Unable to toggle mute — install nircmd or AudioDeviceCmdlets PowerShell module',
      );
    }
  }
}
