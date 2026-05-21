---
phase: 78-voice-reliability-config
plan: "02"
subsystem: config
tags: [config, thread-safety, atomicity, tdd]
dependency_graph:
  requires: []
  provides: [atomic-save-config, whisper-model-locked-field]
  affects: [voice_modes, chat]
tech_stack:
  added: [threading, tempfile]
  patterns: [atomic-temp-file-swap, module-level-lock, tdd-red-green]
key_files:
  created: []
  modified:
    - apps/desktop-py/src/jarvis_desktop/config.py
    - apps/desktop-py/tests/test_config.py
key_decisions:
  - "os.replace() chosen for atomic swap: POSIX atomic + Windows safe when temp file is on same filesystem"
  - "Module-level _config_lock singleton: single Lock shared across all callers avoids multiple lock instances"
  - "tempfile.NamedTemporaryFile with delete=False: explicit cleanup on error path, no risk of premature deletion"
metrics:
  duration_minutes: 8
  tasks_completed: 1
  tasks_total: 1
  files_changed: 2
  completed_date: "2026-05-20"
requirements_validated:
  - CONF-01
  - CONF-02
  - CONF-03
---

# Phase 78 Plan 02: Atomic Config Save + whisper_model_locked Summary

**One-liner:** Atomic thread-safe save_config() via threading.Lock + NamedTemporaryFile + os.replace(), plus whisper_model_locked field for WGPU-02 Plan 03 dependency.

## What Was Built

### config.py changes

1. **New imports:** `import tempfile` and `import threading` added at module level.
2. **Module-level lock:** `_config_lock = threading.Lock()` — single instance shared across all concurrent callers.
3. **New JarvisConfig field:** `whisper_model_locked: bool = Field(default=False, ...)` added after `wake_word_threshold` — required by Plan 03 (WGPU-02) for GPU auto-detect skip logic.
4. **Atomic save_config():** Replaced direct `open()` write with:
   - `with _config_lock:` — serializes concurrent writes
   - `tempfile.NamedTemporaryFile(dir=config_file.parent, suffix=".tmp")` — same-filesystem temp file
   - `os.replace(tmp_path, config_file)` — atomic rename
   - Cleanup of temp file in `except` block if replace fails

### test_config.py additions (TDD)

4 new tests covering CONF-01/02/03:
- `test_save_config_atomic` — verifies config.json written correctly + no `.tmp` files remain
- `test_save_config_thread_safe` — 10 concurrent threads, result is valid JSON
- `test_whisper_model_locked_default` — field default, load_config() return, config.json persistence
- `test_whisper_model_locked_persists` — round-trip: write `true` to JSON, load returns `True`

## Test Results

```
36 passed, 1 xfailed, 14 xpassed
```

All tests green. Full suite clean.

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Atomic save_config() + whisper_model_locked | ffcfd2e | config.py, test_config.py |

## Self-Check: PASSED
