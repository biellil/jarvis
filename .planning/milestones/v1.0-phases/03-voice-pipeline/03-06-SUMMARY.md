---
phase: 03-voice-pipeline
plan: "06"
subsystem: voice
tags: [tts, ptt, push-to-talk, bug-fix, regression-test]
dependency_graph:
  requires: [03-02, 03-03]
  provides: [CONV-03-complete, CONV-04-ptt]
  affects: [__main__.py ptt path]
tech_stack:
  added: []
  patterns: [tts-wiring-ptt, response-capture-pattern]
key_files:
  created:
    - tests/test_ptt_tts.py
  modified:
    - src/jarvis/__main__.py
decisions:
  - "/ptt path now captures session.send() return value and calls tts.speak() — matching wake word and /voice file patterns"
metrics:
  duration: "5 minutes"
  completed: "2026-04-04T22:44:00Z"
  tasks_completed: 2
  files_modified: 2
---

# Phase 03 Plan 06: PTT TTS Wiring Fix Summary

**One-liner:** Fixed bare `await session.send(transcript)` on /ptt path to capture response and call `tts.speak(response)`, closing CONV-03 gap on the primary interactive voice input method.

## What Was Built

The `/ptt` (push-to-talk) command path in `src/jarvis/__main__.py` was discarding the return value of `session.send(transcript)`, so `tts.speak()` was never called after PTT recordings. All other voice paths (wake word, `/voice file`, text input) correctly captured the response and called TTS.

**Fix:** Changed line 231 from:
```python
await session.send(transcript)
```
to:
```python
response = await session.send(transcript)
# CONV-03: Speak response after push-to-talk (SC2 streaming)
if tts and response:
    console.print("\n[dim][falando]...[/dim]")
    await tts.speak(response)
```

This is identical to the pattern used by the wake word path (lines 164-167) and the `/voice file` path (lines 275-279).

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Wire TTS to /ptt path in __main__.py | 37e4eea | src/jarvis/__main__.py |
| 2 | Add regression test for /ptt TTS wiring | 2af5394 | tests/test_ptt_tts.py |

## Verification Results

| Check | Result |
|-------|--------|
| `grep -c "response = await session.send(transcript)" src/jarvis/__main__.py` | 3 (was 2 before fix) |
| `grep -c "await tts.speak(response)" src/jarvis/__main__.py` | 4 (was 3 before fix) |
| `PYTHONPATH=src pytest tests/ -x -q` | 162 passed, 0 failed |
| `PYTHONPATH=src pytest tests/test_ptt_tts.py -x -v` | 4 passed |

## Deviations from Plan

None - plan executed exactly as written. The fix was surgical (5 lines changed in __main__.py) and matched the specified pattern exactly.

## Known Stubs

None — no stubs or placeholders. The fix wires real data flow through tts.speak().

## Self-Check: PASSED

- [x] `src/jarvis/__main__.py` exists and contains `# CONV-03: Speak response after push-to-talk`
- [x] `tests/test_ptt_tts.py` exists with 164 lines (>20 minimum)
- [x] Commit 37e4eea exists (Task 1)
- [x] Commit 2af5394 exists (Task 2)
- [x] 162 tests pass with no regressions
