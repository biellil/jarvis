---
phase: 59-system-controls
plan: "01"
subsystem: desktop-actions
tags: [system-controls, volume, mute, media, electron, handlers]
dependency_graph:
  requires:
    - apps/desktop/src/main/actions/types.ts
    - apps/desktop/src/main/actions/validators.ts
    - apps/desktop/src/main/actions/index.ts
  provides:
    - adjust_volume ACTION_HANDLER (SYSCTRL-01)
    - toggle_mute ACTION_HANDLER (SYSCTRL-01)
    - media_control ACTION_HANDLER (SYSCTRL-02)
  affects:
    - apps/desktop/src/main/actions/index.ts (ACTION_HANDLERS expanded to 16)
    - apps/desktop/src/main/__tests__/actions.test.ts (barrel count updated)
tech_stack:
  added: []
  patterns:
    - Platform-switch handler pattern (win32 / darwin / linux branches)
    - Delta-clamping with Math.max(0, Math.min(100, current + delta))
    - nircmd.exe fallback for Windows when PowerShell modules unavailable
    - pactl CLI for Linux volume/mute; osascript for macOS
key_files:
  created:
    - apps/desktop/src/main/actions/adjust-volume.ts
    - apps/desktop/src/main/actions/toggle-mute.ts
    - apps/desktop/src/main/actions/media-control.ts
    - apps/desktop/src/main/actions/__tests__/system-controls.test.ts
  modified:
    - apps/desktop/src/main/actions/validators.ts (added assertDelta)
    - apps/desktop/src/main/actions/index.ts (registered 3 new handlers)
    - apps/desktop/src/main/__tests__/actions.test.ts (updated barrel count to 16)
decisions:
  - "assertDelta accepts [-100,100] integers only — same pattern as assertLevel0to100 but signed"
  - "adjustVolumeLinux reads current % via pactl before applying delta (not relative pactl setsysvolume +X%)"
  - "toggleMuteLinux uses pactl toggle subcommand — simpler than read+invert+set"
  - "mediaControlLinux uses playerctl; descriptive fail() on ENOENT with install hint"
  - "Windows volume: PowerShell Set-Volume first, nircmd.exe fallback — tolerates missing AudioDeviceCmdlets"
  - "Windows mute toggle: nircmd mutesysvolume 2 (toggle mode) first, PowerShell fallback"
  - "Windows media keys: WScript.Shell SendKeys with VK_MEDIA_* codes (179/176/177), nircmd fallback"
  - "macOS media keys: osascript NX key codes (100/101/98) via System Events; EACCES → descriptive permission_denied"
  - "All three handlers non-destructive — not added to REQUIRES_CONFIRMATION"
  - "Barrel test updated from 13 to 16 handlers (Rule 1 auto-fix — test was stale)"
metrics:
  duration_seconds: 264
  completed_date: "2026-05-07"
  tasks_completed: 2
  files_changed: 7
requirements:
  - SYSCTRL-01
  - SYSCTRL-02
---

# Phase 59 Plan 01: System Controls Electron Handlers Summary

**One-liner:** Delta-based volume + mute toggle + media key handlers wired into ACTION_HANDLERS with Linux/macOS/Windows platform branches and 23 unit tests.

## What Was Built

Three new Electron-side action handlers that enable voice commands to control OS-level audio and media:

1. **adjustVolumeHandler** (`adjust-volume.ts`) — Reads current OS volume, applies signed delta, clamps to [0,100], writes back. Platform-specific: `pactl` on Linux, `osascript` on macOS, PowerShell + nircmd fallback on Windows.

2. **toggleMuteHandler** (`toggle-mute.ts`) — Reads mute state, inverts it, returns `ok('muted')` or `ok('unmuted')`. Uses `pactl toggle` on Linux, AppleScript on macOS, nircmd `mutesysvolume 2` on Windows.

3. **mediaControlHandler** (`media-control.ts`) — Sends `play_pause`, `next_track`, or `prev_track` to the active media player. `playerctl` on Linux (with descriptive ENOENT message), `osascript` NX key codes on macOS (with Accessibility permission gate), WScript.Shell VK_MEDIA_* codes on Windows (with nircmd fallback).

**Validator added:** `assertDelta(v)` in `validators.ts` — validates signed integer in [-100, 100].

**Registration:** All three handlers registered in `ACTION_HANDLERS` in `index.ts`. None added to `REQUIRES_CONFIRMATION` (non-destructive).

## Test Coverage

23 unit tests in `system-controls.test.ts` covering:
- `assertDelta` boundary cases (0, ±100, ±101, 1.5, "10")
- `adjustVolumeHandler`: Linux get+set, clamp high (90+20=100), clamp low (5-20=0), subprocess failure, invalid delta
- `toggleMuteHandler`: Linux was-unmuted→muted, was-muted→unmuted, subprocess failure
- `mediaControlHandler`: Linux play_pause/next_track/prev_track, playerctl ENOENT, invalid command, missing command

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated stale barrel test count**
- **Found during:** Task 2 (full suite run after registering handlers in index.ts)
- **Issue:** `src/main/__tests__/actions.test.ts` had `expect(keys).toHaveLength(13)` — adding 3 new handlers caused it to fail with 16 found
- **Fix:** Updated test description and length assertion from 13 → 16; added explicit `expect(keys).toContain` for the 3 new Phase 59 entries
- **Files modified:** `apps/desktop/src/main/__tests__/actions.test.ts`
- **Commit:** 80592a3

## Self-Check: PASSED

- adjust-volume.ts: FOUND
- toggle-mute.ts: FOUND
- media-control.ts: FOUND
- system-controls.test.ts: FOUND
- Commit 80592a3: FOUND
