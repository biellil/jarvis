---
phase: quick
plan: 260527-qmb
subsystem: desktop-py/chat
tags: [bug-fix, windows, unicode, emoji, msvcrt]
key-files:
  modified:
    - apps/desktop-py/src/jarvis_desktop/chat.py
decisions:
  - surrogate-pair buffer local to _await_input loop — no global state needed
  - try/except UnicodeEncodeError on write as defense-in-depth even after join
metrics:
  duration: ~10min
  completed: 2026-05-27
  tasks: 1
  files: 1
---

# Quick Task 260527-qmb: Fix UnicodeEncodeError When Writing Emoji Characters Summary

**One-liner:** Surrogate pair joining in `_await_input` prevents UnicodeEncodeError when typing emoji on Windows cp1252 terminals.

## What Was Done

`msvcrt.getwch()` returns emoji as two separate UTF-16 surrogate characters (high: \ud800–\udbff, low: \udc00–\udfff). Writing either half directly to `sys.stdout` raises `UnicodeEncodeError` on Windows terminals with cp1252 encoding.

Fix applied to `_await_input` in `apps/desktop-py/src/jarvis_desktop/chat.py`:

1. Added `_pending_surrogate = ""` before the `while True:` loop
2. After control-char checks, surrogate-joining block accumulates the high surrogate and joins it with the subsequent low surrogate into a valid Python str codepoint
3. Orphan low surrogates (no preceding high) are dropped silently
4. `sys.stdout.write(raw)` wrapped in `try/except UnicodeEncodeError` as defense-in-depth

## Verification

- `uv run pytest tests/test_chat.py` — 1 passed, 1 xfailed, 3 xpassed (no regressions)
- Full suite (excluding pre-existing failures in test_pc_control and test_voice_modes): 44 passed, 6 xfailed, 14 xpassed
- Pre-existing failures (`test_open_folder_native`, `test_ptt_mode_hotkey`) confirmed pre-existing before this change

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | ebab40a | fix(chat): handle surrogate pairs from msvcrt.getwch() on Windows |

## Self-Check: PASSED

- File modified: `apps/desktop-py/src/jarvis_desktop/chat.py` — confirmed
- Commit `ebab40a` exists in git log — confirmed
- Chat tests pass — confirmed
