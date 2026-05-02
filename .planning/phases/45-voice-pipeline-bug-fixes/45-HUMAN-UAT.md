---
status: partial
phase: 45-voice-pipeline-bug-fixes
source: [45-VERIFICATION.md]
started: 2026-05-01T00:00:00Z
updated: 2026-05-01T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. PTT Guard — Wake-word mode smoke test
expected: Launch app in default wake-word mode. Press PTT hotkey (CmdOrCtrl+Space). No recording starts. Console shows "[PTT] Hotkey ignored — voice mode is not ptt-only".
result: [pending]

### 2. Whisper Override — Settings model smoke test
expected: Open Settings UI, set Whisper model to "medium". Restart app. Console shows "[voice] Applying user override: medium (was: base)" on startup.
result: [pending]

### 3. Auto Mode — Override off smoke test
expected: Set Whisper model back to "auto" in Settings. Restart app. Console shows "[voice] Model selected by VRAM: ..." but NO override log appears.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
