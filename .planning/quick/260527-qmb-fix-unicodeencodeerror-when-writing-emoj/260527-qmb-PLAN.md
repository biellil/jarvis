---
phase: quick
plan: 260527-qmb
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/desktop-py/src/jarvis_desktop/chat.py
autonomous: true
requirements: []
must_haves:
  truths:
    - "Typing or pasting emoji characters in the chat prompt does not crash with UnicodeEncodeError"
    - "Non-emoji characters continue to echo correctly"
    - "Surrogate pairs from msvcrt.getwch() are accumulated into valid Unicode codepoints before display"
  artifacts:
    - path: apps/desktop-py/src/jarvis_desktop/chat.py
      provides: Surrogate-safe character accumulation in _await_input
  key_links:
    - from: msvcrt.getwch()
      to: sys.stdout.write()
      via: surrogate pair joining before write
      pattern: "surrogates"
---

<objective>
Fix UnicodeEncodeError crash when the user types or pastes emoji characters in the chat prompt on Windows.

Purpose: `msvcrt.getwch()` returns emoji as two separate surrogate characters (\ud83d, \udc4d etc.). Writing either half directly to stdout raises UnicodeEncodeError. The fix accumulates surrogates into a complete codepoint before echoing or appending.

Output: Modified `_await_input` in chat.py that handles surrogate pairs silently.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@apps/desktop-py/src/jarvis_desktop/chat.py
</context>

<tasks>

<task type="auto">
  <name>Task 1: Handle surrogate pairs in _await_input character echo loop</name>
  <files>apps/desktop-py/src/jarvis_desktop/chat.py</files>
  <action>
In `_await_input` (around line 441), `msvcrt.getwch()` returns individual UTF-16 surrogate characters for emoji. The fix: buffer a leading surrogate and wait for the trailing surrogate before appending/echoing.

Add a `_pending_surrogate` local variable (initialized to `""`) before the `while True` loop. After reading `raw` from `msvcrt.getwch()`, and after the special-key/control-char checks, add this surrogate-joining block BEFORE the `chars.append(raw)` / `sys.stdout.write(raw)` lines:

```python
# Handle UTF-16 surrogate pairs from msvcrt.getwch() on Windows
if "\ud800" <= raw <= "\udbff":   # high surrogate — hold and wait for low
    _pending_surrogate = raw
    continue
if "\udc00" <= raw <= "\udfff":   # low surrogate — join with pending high
    if _pending_surrogate:
        raw = _pending_surrogate + raw  # form the surrogate pair string
        _pending_surrogate = ""
    else:
        continue                        # orphan low surrogate — drop silently
else:
    _pending_surrogate = ""             # non-surrogate resets any pending high
```

After this block, the existing `chars.append(raw)` and `sys.stdout.write(raw)` lines handle both single characters and the now-joined surrogate pair string correctly. The joined pair is valid Python str and encodes cleanly to UTF-8.

Also wrap `sys.stdout.write(raw)` in a try/except to catch any residual encoding errors:

```python
try:
    sys.stdout.write(raw)
except UnicodeEncodeError:
    pass  # drop unencodable character silently rather than crashing
sys.stdout.flush()
```

Remove the original bare `sys.stdout.write(raw)` + `sys.stdout.flush()` lines that follow.

Initialize `_pending_surrogate = ""` right before the `while True:` loop (after `sys.stdout.write("> ")` and `sys.stdout.flush()`).
  </action>
  <verify>
    <automated>cd apps/desktop-py && uv run pytest tests/ -x -q 2>&1 | tail -20</automated>
  </verify>
  <done>Full test suite passes (no regressions). Surrogate pair logic inserted; UnicodeEncodeError no longer possible on the write path.</done>
</task>

</tasks>

<verification>
- `uv run pytest tests/ -x -q` exits 0 with no failures
- Manually confirmed: `_pending_surrogate` variable declared before loop, surrogate range checks use correct Unicode ranges (\ud800–\udbff for high, \udc00–\udfff for low)
- `sys.stdout.write(raw)` wrapped in try/except UnicodeEncodeError as safety net
</verification>

<success_criteria>
UnicodeEncodeError on emoji input is eliminated. Non-emoji input continues to echo correctly. Test suite stays green.
</success_criteria>

<output>
After completion, update `.planning/STATE.md` Quick Tasks table with this entry:
| 260527-qmb | fix UnicodeEncodeError when writing emoji characters to stdout on Windows | 2026-05-27 | {commit} | [260527-qmb-fix-unicodeencodeerror-when-writing-emoj](.planning/quick/260527-qmb-fix-unicodeencodeerror-when-writing-emoj/) |
</output>
